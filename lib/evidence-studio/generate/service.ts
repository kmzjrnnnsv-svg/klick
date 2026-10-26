import { and, count, desc, eq, inArray, sql } from "drizzle-orm";
import { evidence, evidenceSignatures, roleAssignments } from "@/db/schema";
import type { RoleFunction } from "@/db/schema/enums";
import type { AuditInput } from "@/lib/audit";
import { getOrgSummary } from "@/lib/auth/org";
import { effectiveAssignment } from "@/lib/compliance/appointments";
import { EVIDENCE_KIND_BY_CODE } from "@/lib/compliance/catalog/evidence-kinds";
import { functionKeyOf } from "@/lib/compliance/function-key";
import { userNames } from "@/lib/compliance/queries";
import type { OrgTx } from "@/lib/db/with-org";
import {
	currentEvidence,
	lockForSuccessor,
	supersedeEvidence,
} from "@/lib/evidence/current";
import {
	linkEvidenceToControl,
	storeEncryptedEvidence,
} from "@/lib/evidence/store";
import { renderMarkdown } from "@/lib/export/doc-model";
import { renderPdf } from "@/lib/export/pdf";
import { implementationFor } from "../implementation";
import { berlinToday } from "../queries";
import {
	assembleDoc,
	canonicalJson,
	contentHash,
	type SignerSlot,
	type Snapshot,
} from "./doc";
import { GENERATORS } from "./registry";

// Nachweis aus Klick erzeugen: Registerdaten → Schnappschuss → PDF (mit
// Schnappschuss und Markdown als Anhang) → verschlüsselte Ablage → an alle
// Controls der Art. Gleicher Inhalt wie der letzte Nachweis → kein neuer.

const plusMonths = (iso: string, months: number) => {
	const d = new Date(`${iso}T00:00:00Z`);
	d.setUTCMonth(d.getUTCMonth() + months);
	return d.toISOString().slice(0, 10);
};

async function latestOf(
	tx: OrgTx,
	orgId: string,
	code: string,
	entityId: string | null,
) {
	const entityMatch = entityId
		? sql`${evidence.snapshot}->>'entityId' = ${entityId}`
		: sql`coalesce(${evidence.snapshot}->>'entityId', '') = ''`;
	// aktuelle Fassung (nie eine ersetzte)
	const [latest] = await tx
		.select({
			id: evidence.id,
			contentSha256: evidence.contentSha256,
			validUntil: evidence.validUntil,
			createdAt: evidence.createdAt,
		})
		.from(evidence)
		.where(
			and(
				eq(evidence.organizationId, orgId),
				eq(evidence.kindCode, code),
				entityMatch,
				currentEvidence(),
			),
		)
		.orderBy(desc(evidence.createdAt))
		.limit(1);
	const [n] = await tx
		.select({ n: count() })
		// evidence:any-version — Fassungsnummer zählt alle
		.from(evidence)
		.where(
			and(
				eq(evidence.organizationId, orgId),
				eq(evidence.kindCode, code),
				entityMatch,
			),
		);
	return { latest: latest ?? null, versions: n?.n ?? 0 };
}

export async function signerSlots(
	tx: OrgTx,
	orgId: string,
	signers: readonly { function: RoleFunction; mode: "all" | "any" }[],
): Promise<SignerSlot[]> {
	if (signers.length === 0) return [];
	const rows = await tx
		.select({
			function: roleAssignments.function,
			userId: roleAssignments.userId,
			externalName: roleAssignments.externalName,
		})
		.from(roleAssignments)
		.where(
			and(
				eq(roleAssignments.organizationId, orgId),
				effectiveAssignment(),
				inArray(
					roleAssignments.function,
					signers.map((s) => s.function),
				),
			),
		);
	const names = await userNames(
		tx,
		rows.map((r) => r.userId),
	);
	return signers.map((s) => ({
		function: s.function,
		mode: s.mode,
		holders: rows
			.filter((r) => r.function === s.function)
			.map((r) =>
				r.userId ? (names.get(r.userId) ?? "") : (r.externalName ?? ""),
			)
			.filter(Boolean),
	}));
}

export type GenerateResult =
	| { ok: true; id: string; reused: boolean; audit: AuditInput[] }
	| { ok: false; error: "unknown_kind" | "not_found" | "already_superseded" };

// Aktuelle Prüfsumme einer Art (für „veraltet“): null, wenn nicht erzeugbar
export async function currentHash(
	tx: OrgTx,
	orgId: string,
	code: string,
	entityId?: string,
): Promise<string | null> {
	const gen = GENERATORS.get(code);
	if (!gen) return null;
	const facts = await gen.load(tx, orgId, entityId);
	if (facts === null) return null;
	return contentHash({ v: 1, kind: code, entityId: entityId ?? null, facts });
}

export async function generateKindEvidence(
	tx: OrgTx,
	ctx: { orgId: string; userId: string | null },
	code: string,
	entityId?: string,
): Promise<GenerateResult> {
	const kind = EVIDENCE_KIND_BY_CODE.get(code);
	const gen = GENERATORS.get(code);
	if (!kind || !gen) return { ok: false, error: "unknown_kind" };
	// je Org genau ein Strang, je Datensatz nur mit Datensatz
	if ((kind.scope === "org") === Boolean(entityId))
		return { ok: false, error: "not_found" };
	const facts = await gen.load(tx, ctx.orgId, entityId);
	if (facts === null) return { ok: false, error: "not_found" };
	const snapshot: Snapshot = {
		v: 1,
		kind: code,
		entityId: entityId ?? null,
		facts,
	};
	const hash = contentHash(snapshot);
	const { latest, versions } = await latestOf(
		tx,
		ctx.orgId,
		code,
		entityId ?? null,
	);
	const today = berlinToday();
	// gleicher Inhalt und noch gültig: wiederverwenden; abgelaufen: neu
	// erzeugen (neue Fassung, neues Gültig-bis)
	if (
		latest?.contentSha256 === hash &&
		(latest.validUntil === null || latest.validUntil >= today)
	)
		return { ok: true, id: latest.id, reused: true, audit: [] };
	if (latest && (await lockForSuccessor(tx, ctx.orgId, latest.id)) !== "ok")
		return { ok: false, error: "already_superseded" };

	const id = crypto.randomUUID();
	const version = versions + 1;
	const built = gen.build(facts, { today });
	const org = await getOrgSummary(ctx.orgId);
	const doc = assembleDoc({
		kind,
		org: org?.name ?? "",
		today,
		version,
		evidenceId: id,
		contentSha256: hash,
		title: built.title,
		subtitle: built.subtitle,
		blocks: built.blocks,
		signers: [
			...(await signerSlots(tx, ctx.orgId, kind.signers)),
			...(gen.extraSigners?.(facts) ?? []),
		],
	});
	const pdf = renderPdf(doc, {
		attachments: [
			{
				name: "nachweis.json",
				data: JSON.stringify(JSON.parse(canonicalJson(snapshot)), null, 2),
				mime: "application/json",
				description: "Schnappschuss der Registerdaten (Prüfsumme im Kopf)",
			},
			{
				name: "nachweis.md",
				data: renderMarkdown(doc),
				mime: "text/markdown",
			},
		],
	});
	await storeEncryptedEvidence(tx, {
		id,
		orgId: ctx.orgId,
		bytes: pdf,
		mime: "application/pdf",
		safeName: `${code}-v${version}-${today}.pdf`,
		title: doc.title,
		description: `${kind.purpose} Erzeugt aus den Registern in Klick.`,
		type: "document",
		classification: "internal",
		validUntil: plusMonths(today, kind.reviewMonths),
		createdByUserId: ctx.userId,
		source: "klick",
	});
	await tx
		.update(evidence)
		.set({
			kindCode: code,
			contentSha256: hash,
			snapshot: snapshot as unknown as Record<string, unknown>,
		})
		.where(eq(evidence.id, id));
	if (latest) await supersedeEvidence(tx, ctx.orgId, latest.id, id);
	const controls = gen.controls
		? kind.controls.filter((c) => gen.controls?.(facts).includes(c))
		: kind.controls;
	for (const c of controls) {
		const impl = await implementationFor(tx, ctx.orgId, c);
		if (impl) await linkEvidenceToControl(tx, ctx.orgId, impl.id, id);
	}
	return {
		ok: true,
		id,
		reused: false,
		audit: [
			{
				action: "evidence.generated",
				target: `evidence:${id}`,
				after: {
					kindCode: code,
					entityId: entityId ?? null,
					version,
					contentSha256: hash,
					supersedesId: latest?.id ?? null,
					controls,
				},
			},
		],
	};
}

// Heutige Prüfsummen der erzeugbaren Arten in diesen Bögen (für „veraltet“)
export async function kindHashesFor(
	tx: OrgTx,
	orgId: string,
	sheets: readonly {
		items: readonly {
			resolution:
				| { type: "kind"; kind: { code: string; scope: string } }
				| { type: string };
		}[];
	}[],
): Promise<Map<string, string | null>> {
	const codes = new Set<string>();
	for (const s of sheets)
		for (const i of s.items)
			if (
				i.resolution.type === "kind" &&
				"kind" in i.resolution &&
				i.resolution.kind.scope === "org" &&
				GENERATORS.has(i.resolution.kind.code)
			)
				codes.add(i.resolution.kind.code);
	const out = new Map<string, string | null>();
	for (const code of codes) out.set(code, await currentHash(tx, orgId, code));
	return out;
}

// Letzter erzeugter Nachweis einer Art (je Datensatz über entityId)
export async function generatedFor(
	tx: OrgTx,
	orgId: string,
	code: string,
	entityId?: string,
): Promise<{
	id: string;
	createdAt: Date;
	contentSha256: string | null;
} | null> {
	return (await latestOf(tx, orgId, code, entityId ?? null)).latest;
}

// Unterschriften unter einem erzeugten Nachweis: wer schon unterschrieben
// hat, welche Funktionen noch fehlen und in welcher ich jetzt unterschreiben
// kann (je Funktion eine Unterschrift; zusätzliche Unterzeichnende wie die
// bestellte Person kommen aus dem gespeicherten Schnappschuss)
export async function evidenceSignState(
	tx: OrgTx,
	orgId: string,
	code: string,
	evidenceId: string,
	userId: string,
): Promise<{
	signatures: { name: string; function: string | null; signedAt: string }[];
	signAs: string | null;
	open: string[];
}> {
	const kind = EVIDENCE_KIND_BY_CODE.get(code);
	const gen = GENERATORS.get(code);
	const [row] = await tx
		.select({ snapshot: evidence.snapshot })
		// evidence:any-version — Schnappschuss einer Fassung per ID
		.from(evidence)
		.where(and(eq(evidence.organizationId, orgId), eq(evidence.id, evidenceId)))
		.limit(1);
	const facts = (row?.snapshot as { facts?: unknown } | null)?.facts;
	const required = [
		...new Set([
			...(kind?.signers ?? []).map((sg) => sg.function as string),
			...(facts !== undefined && gen?.extraSigners
				? gen.extraSigners(facts).map((sg) => sg.function)
				: []),
		]),
	];
	const [sigs, mine] = await Promise.all([
		tx
			.select({
				signerUserId: evidenceSignatures.signerUserId,
				name: evidenceSignatures.signerName,
				function: evidenceSignatures.function,
				signedAt: evidenceSignatures.signedAt,
			})
			.from(evidenceSignatures)
			.where(
				and(
					eq(evidenceSignatures.organizationId, orgId),
					eq(evidenceSignatures.evidenceId, evidenceId),
				),
			)
			.orderBy(evidenceSignatures.signedAt),
		tx
			.select({
				function: roleAssignments.function,
				orgRoleId: roleAssignments.orgRoleId,
			})
			.from(roleAssignments)
			.where(
				and(
					eq(roleAssignments.organizationId, orgId),
					effectiveAssignment(),
					eq(roleAssignments.userId, userId),
				),
			),
	]);
	const signed = new Set(sigs.map((x) => x.function));
	const open = required.filter((f) => !signed.has(f));
	const myFns = new Set<string>(mine.map((m) => functionKeyOf(m)));
	return {
		signatures: sigs.map((x) => ({
			name: x.name,
			function: x.function,
			signedAt: x.signedAt.toISOString(),
		})),
		signAs: open.find((f) => myFns.has(f)) ?? null,
		open,
	};
}

export type KindOverviewRow = {
	code: string;
	title: string;
	purpose: string;
	mandatory: boolean;
	scope: "org" | "per_entity";
	editHref: string;
	editLabel: string;
	generatable: boolean;
	latest: { id: string; createdAt: string; validUntil: string | null } | null;
	// Unterschriften unter dem letzten Nachweis
	signatures: { name: string; function: string | null; signedAt: string }[];
	// Funktion, in der ich unterschreiben soll (noch offen), sonst null
	signAs: string | null;
	// offene Unterschriften (Funktionen ohne Unterschrift)
	openSigners: number;
	state:
		| "missing"
		| "current"
		| "stale"
		| "expired"
		| "manual"
		| "per_entity"
		| "no_data";
};

// Stand aller Nachweisarten (Reiter „Nachweise“ eines Rahmenwerks)
export async function kindOverview(
	tx: OrgTx,
	orgId: string,
	codes: readonly string[],
	today: string,
	me?: { userId: string },
): Promise<KindOverviewRow[]> {
	const rows: KindOverviewRow[] = [];
	const myFunctions = me
		? (
				await tx
					.select({ function: roleAssignments.function })
					.from(roleAssignments)
					.where(
						and(
							eq(roleAssignments.organizationId, orgId),
							effectiveAssignment(),
							eq(roleAssignments.userId, me.userId),
						),
					)
			).map((r) => r.function as string)
		: [];
	for (const code of codes) {
		const kind = EVIDENCE_KIND_BY_CODE.get(code);
		if (!kind) continue;
		const generatable = GENERATORS.has(code) && kind.scope === "org";
		const [latest] =
			kind.scope === "org"
				? await tx
						.select({
							id: evidence.id,
							createdAt: evidence.createdAt,
							validUntil: evidence.validUntil,
							contentSha256: evidence.contentSha256,
						})
						.from(evidence)
						.where(
							and(
								eq(evidence.organizationId, orgId),
								eq(evidence.kindCode, code),
								currentEvidence(),
							),
						)
						.orderBy(desc(evidence.createdAt))
						.limit(1)
				: [];
		const current = generatable ? await currentHash(tx, orgId, code) : null;
		const state: KindOverviewRow["state"] =
			kind.scope === "per_entity"
				? "per_entity"
				: !GENERATORS.has(code)
					? "manual"
					: current === null
						? "no_data"
						: !latest
							? "missing"
							: latest.validUntil && latest.validUntil < today
								? "expired"
								: current && latest.contentSha256 !== current
									? "stale"
									: "current";
		const sigs = latest
			? await tx
					.select({
						signerUserId: evidenceSignatures.signerUserId,
						name: evidenceSignatures.signerName,
						function: evidenceSignatures.function,
						signedAt: evidenceSignatures.signedAt,
					})
					.from(evidenceSignatures)
					.where(
						and(
							eq(evidenceSignatures.organizationId, orgId),
							eq(evidenceSignatures.evidenceId, latest.id),
						),
					)
			: [];
		const signedFns = new Set(sigs.map((x) => x.function));
		const iSigned = sigs.some((x) => x.signerUserId === me?.userId);
		const mine = kind.signers.find((sg) => myFunctions.includes(sg.function));
		rows.push({
			code,
			title: kind.title,
			purpose: kind.purpose,
			mandatory: kind.mandatory,
			scope: kind.scope,
			editHref: kind.edit.href,
			editLabel: kind.edit.label,
			generatable,
			latest: latest
				? {
						id: latest.id,
						createdAt: latest.createdAt.toISOString(),
						validUntil: latest.validUntil,
					}
				: null,
			signatures: sigs.map((x) => ({
				name: x.name,
				function: x.function,
				signedAt: x.signedAt.toISOString(),
			})),
			signAs:
				latest && mine && !iSigned && state !== "expired"
					? mine.function
					: null,
			openSigners: latest
				? kind.signers.filter((sg) => !signedFns.has(sg.function)).length
				: 0,
			state,
		});
	}
	return rows;
}
