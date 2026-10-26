import { randomInt } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import {
	accessTokens,
	policyReaderAcknowledgements,
	policyReaders,
} from "@/db/schema";
import { type PublicPortal, publicPortal } from "@/lib/db/policy-portal";
import { mutateOrg, readOrg } from "@/lib/db/with-org";
import { type ResolvedToken, resolveToken } from "@/lib/db/with-token";
import { env } from "@/lib/env";
import {
	type EvidenceFilePayload,
	evidenceFileFor,
} from "@/lib/evidence/serve";
import { sendTransactionalMail } from "@/lib/mail/send";
import { portalCodeEmail } from "@/lib/mail/templates";
import { policiesFor, sharedEvidence } from "@/lib/policies/queries";
import { newToken } from "@/lib/security/tokens";
import { trustIpHash } from "@/lib/trust/access";
import {
	CODE_TTL_MS,
	checkCode,
	codeHash,
	domainAllowed,
	emailDomain,
} from "./rules";

// Richtlinien-Portal (M2): Code anfordern, Code einlösen (Token klk_reader_,
// ADR-017), Leser:in aus dem Cookie auflösen, Kenntnisnahme. Die Org kommt
// immer aus dem eingeschalteten Portal (Slug), nie aus der Eingabe; jede
// Wirkung läuft danach mit der Org des Portals über mutateOrg (Audit ohne
// Konto, `via: policy_portal`).

export { type PublicPortal, publicPortal };

const ctxFor = (orgId: string, userAgent: string | null) => ({
	orgId,
	userId: null,
	ip: null,
	userAgent,
});

const secret = () => env().BETTER_AUTH_SECRET;

// Code anfordern. Nach außen immer dieselbe Antwort (die Route meldet 202):
// fremde Domain, gesperrte Domain oder Mailfehler verraten nichts.
export async function requestPortalCode(input: {
	portal: PublicPortal;
	email: string;
	baseUrl: string;
	userAgent: string | null;
}): Promise<{ sent: boolean }> {
	const email = input.email.trim().toLowerCase();
	if (!domainAllowed(email, input.portal.domains)) return { sent: false };
	const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
	const orgId = input.portal.organizationId;
	await mutateOrg(ctxFor(orgId, input.userAgent), async (tx) => {
		const [row] = await tx
			.insert(policyReaders)
			.values({ organizationId: orgId, email })
			.onConflictDoUpdate({
				target: [policyReaders.organizationId, policyReaders.email],
				set: { email },
			})
			.returning({ id: policyReaders.id });
		if (!row) throw new Error("insert failed");
		await tx
			.update(policyReaders)
			.set({
				codeHash: codeHash(secret(), row.id, code),
				codeExpiresAt: new Date(Date.now() + CODE_TTL_MS),
				codeAttempts: 0,
			})
			.where(eq(policyReaders.id, row.id));
		return {
			result: null,
			audit: {
				action: "policy_portal.code_requested",
				target: `policy_reader:${row.id}`,
				after: { via: "policy_portal", domain: emailDomain(email) },
			},
		};
	});
	const mail = portalCodeEmail({
		organization: input.portal.orgName,
		code,
		url: `${input.baseUrl}/portal/${input.portal.slug}`,
	});
	const res = await sendTransactionalMail({ to: email, ...mail });
	return { sent: res.ok };
}

// Code einlösen → Token für die Sitzung (Dauer je Portal). Falsche Codes
// zählen mit; nach fünf ist der Code verbraucht.
export type RedeemResult =
	| { ok: true; token: string; expiresAt: Date }
	| { ok: false; error: "invalid" | "expired" | "locked" };

export async function redeemPortalCode(input: {
	portal: PublicPortal;
	email: string;
	code: string;
	ip: string;
	userAgent: string | null;
}): Promise<RedeemResult> {
	const email = input.email.trim().toLowerCase();
	if (
		!domainAllowed(email, input.portal.domains) ||
		!/^\d{6}$/.test(input.code)
	)
		return { ok: false, error: "invalid" };
	const orgId = input.portal.organizationId;
	const now = new Date();
	return mutateOrg<RedeemResult>(ctxFor(orgId, input.userAgent), async (tx) => {
		const [reader] = await tx
			.select()
			.from(policyReaders)
			.where(
				and(
					eq(policyReaders.organizationId, orgId),
					eq(policyReaders.email, email),
				),
			)
			.for("update")
			.limit(1);
		if (!reader) return { result: { ok: false, error: "invalid" }, audit: [] };
		const state = checkCode(
			reader,
			codeHash(secret(), reader.id, input.code),
			now,
		);
		if (state === "wrong") {
			await tx
				.update(policyReaders)
				.set({ codeAttempts: reader.codeAttempts + 1 })
				.where(eq(policyReaders.id, reader.id));
			return { result: { ok: false, error: "invalid" }, audit: [] };
		}
		if (state !== "ok")
			return {
				result: {
					ok: false,
					error: state === "none" ? "invalid" : state,
				},
				audit: [],
			};
		const t = newToken("policy_reader");
		const expiresAt = new Date(
			now.getTime() + input.portal.sessionDays * 86_400_000,
		);
		await tx.insert(accessTokens).values({
			organizationId: orgId,
			kind: "policy_reader",
			name: `Richtlinien-Portal: ${email}`.slice(0, 200),
			prefix: t.prefix,
			tokenHash: t.hash,
			scopes: ["policy:read"],
			subjectType: "policy_reader",
			subjectId: reader.id,
			expiresAt,
			lastUsedAt: now,
			lastUsedIp: trustIpHash(input.ip),
		});
		await tx
			.update(policyReaders)
			.set({
				codeHash: null,
				codeExpiresAt: null,
				codeAttempts: 0,
				confirmedAt: reader.confirmedAt ?? now,
				lastSeenAt: now,
			})
			.where(eq(policyReaders.id, reader.id));
		return {
			result: { ok: true, token: t.token, expiresAt },
			audit: {
				action: "policy_portal.signed_in",
				target: `policy_reader:${reader.id}`,
				after: {
					via: "policy_portal",
					domain: emailDomain(email),
					expiresAt: expiresAt.toISOString(),
				},
			},
		};
	});
}

export type PortalReader = {
	token: ResolvedToken;
	readerId: string;
	email: string;
};

// Cookie → Leser:in: Token passt zur Org des Portals, die Domain ist noch
// freigegeben (Domain entfernt = Zugang endet).
export async function resolvePortalReader(
	portal: PublicPortal,
	raw: string | null | undefined,
): Promise<PortalReader | null> {
	if (!raw) return null;
	const r = await resolveToken(raw, "policy_reader");
	if (!r.ok) return null;
	const t = r.token;
	if (
		t.organizationId !== portal.organizationId ||
		t.subjectType !== "policy_reader" ||
		!t.subjectId
	)
		return null;
	const readerId = t.subjectId;
	const reader = await readOrg(ctxFor(t.organizationId, null), async (tx) => {
		const [row] = await tx
			.select({ id: policyReaders.id, email: policyReaders.email })
			.from(policyReaders)
			.where(
				and(
					eq(policyReaders.id, readerId),
					eq(policyReaders.organizationId, t.organizationId),
				),
			)
			.limit(1);
		return row ?? null;
	});
	if (!reader || !domainAllowed(reader.email, portal.domains)) return null;
	return { token: t, readerId: reader.id, email: reader.email };
}

export function readerPolicies(portal: PublicPortal, reader: PortalReader) {
	return readOrg(ctxFor(portal.organizationId, null), (tx) =>
		policiesFor(tx, portal.organizationId, {
			kind: "reader",
			readerId: reader.readerId,
		}),
	);
}

// Kenntnisnahme der gültigen Fassung (nur, was das Portal zeigt).
export async function acknowledgeAsReader(input: {
	portal: PublicPortal;
	reader: PortalReader;
	versionId: string;
	userAgent: string | null;
}): Promise<boolean> {
	const orgId = input.portal.organizationId;
	return mutateOrg(ctxFor(orgId, input.userAgent), async (tx) => {
		const item = (
			await policiesFor(tx, orgId, {
				kind: "reader",
				readerId: input.reader.readerId,
			})
		).find((p) => p.versionId === input.versionId);
		if (!item) return { result: false, audit: [] };
		if (item.acknowledgedAt) return { result: true, audit: [] };
		await tx
			.insert(policyReaderAcknowledgements)
			.values({
				organizationId: orgId,
				readerId: input.reader.readerId,
				documentVersionId: item.versionId,
			})
			.onConflictDoNothing();
		await tx
			.update(policyReaders)
			.set({ lastSeenAt: new Date() })
			.where(eq(policyReaders.id, input.reader.readerId));
		return {
			result: true,
			audit: {
				action: "document.acknowledged",
				target: `document:${item.documentId}`,
				after: {
					via: "policy_portal",
					readerId: input.reader.readerId,
					version: item.version,
				},
			},
		};
	});
}

// Abmelden: Token widerrufen (Cookie löscht die Route).
export async function signOutReader(
	portal: PublicPortal,
	reader: PortalReader,
): Promise<void> {
	await mutateOrg(ctxFor(portal.organizationId, null), async (tx) => {
		await tx
			.update(accessTokens)
			.set({ revokedAt: new Date() })
			.where(
				and(
					eq(accessTokens.id, reader.token.id),
					isNull(accessTokens.revokedAt),
				),
			);
		return {
			result: null,
			audit: {
				action: "policy_portal.signed_out",
				target: `policy_reader:${reader.readerId}`,
				after: { via: "policy_portal" },
			},
		};
	});
}

type ReaderFile = { file: EvidenceFilePayload; name?: string };

// Datei der gültigen Fassung bzw. eines freigegebenen Nachweises für eine
// Portal-Leser:in (Audit `via: policy_portal`).
export async function readerFile(input: {
	portal: PublicPortal;
	reader: PortalReader;
	target: { versionId: string } | { evidenceId: string };
	userAgent: string | null;
}): Promise<ReaderFile | null> {
	const orgId = input.portal.organizationId;
	return mutateOrg<ReaderFile | null>(
		ctxFor(orgId, input.userAgent),
		async (tx) => {
			if ("versionId" in input.target) {
				const versionId = input.target.versionId;
				const policy = (
					await policiesFor(tx, orgId, {
						kind: "reader",
						readerId: input.reader.readerId,
					})
				).find((p) => p.versionId === versionId);
				if (!policy?.fileEvidenceId) return { result: null, audit: [] };
				const file = await evidenceFileFor(tx, orgId, policy.fileEvidenceId);
				if (!file) return { result: null, audit: [] };
				return {
					result: { file, name: `${policy.docNumber}-v${policy.version}` },
					audit: {
						action: "policy.file_download",
						target: `document:${policy.documentId}`,
						after: {
							via: "policy_portal",
							readerId: input.reader.readerId,
							versionId,
							version: policy.version,
						},
					},
				};
			}
			const evidenceId = input.target.evidenceId;
			const shared = (await sharedEvidence(tx, orgId)).find(
				(e) => e.id === evidenceId,
			);
			if (!shared) return { result: null, audit: [] };
			const file = await evidenceFileFor(tx, orgId, evidenceId);
			if (!file) return { result: null, audit: [] };
			return {
				result: { file },
				audit: {
					action: "evidence.download",
					target: `evidence:${evidenceId}`,
					after: {
						via: "policy_portal",
						readerId: input.reader.readerId,
						fileName: file.fileName,
					},
				},
			};
		},
	);
}

export function readerSharedEvidence(portal: PublicPortal) {
	return readOrg(ctxFor(portal.organizationId, null), (tx) =>
		sharedEvidence(tx, portal.organizationId),
	);
}
