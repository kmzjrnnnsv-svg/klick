import { randomBytes } from "node:crypto";
import { and, count, desc, eq, gt, isNull } from "drizzle-orm";
import { organization } from "@/db/auth-schema";
import {
	accessTokens,
	type PolicyPortal,
	policyPortals,
	policyReaderAcknowledgements,
	policyReaders,
} from "@/db/schema";
import type { OrgTx } from "@/lib/db/with-org";
import { isUniqueViolation } from "@/lib/trust/service";
import { portalSlugValid } from "./rules";

// Richtlinien-Portal aus Sicht der Org (Einstellungen > Richtlinien-Portal).

export async function portalOf(
	tx: OrgTx,
	orgId: string,
): Promise<PolicyPortal | null> {
	const [row] = await tx
		.select()
		.from(policyPortals)
		.where(eq(policyPortals.organizationId, orgId))
		.limit(1);
	return row ?? null;
}

export async function orgNameAndSlug(tx: OrgTx, orgId: string) {
	const [o] = await tx
		.select({ name: organization.name, slug: organization.slug })
		.from(organization)
		.where(eq(organization.id, orgId))
		.limit(1);
	return { name: o?.name ?? "", slug: o?.slug ?? "" };
}

// Vorschlag für die Adresse: Kurzname der Org, sonst mit Zusatz.
export function suggestPortalSlug(orgSlug: string): string {
	const s = orgSlug
		.toLowerCase()
		.replace(/[^a-z0-9-]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 32);
	return portalSlugValid(s) ? s : `${s || "org"}-portal`.slice(0, 40);
}

// Portal anlegen, wenn es fehlt (ausgeschaltet).
export async function ensurePortal(
	tx: OrgTx,
	orgId: string,
): Promise<PolicyPortal> {
	const existing = await portalOf(tx, orgId);
	if (existing) return existing;
	const org = await orgNameAndSlug(tx, orgId);
	const base = suggestPortalSlug(org.slug);
	// Kurznamen sind plattformweit eindeutig; vergeben → mit Zusatz (Savepoint,
	// damit der Fehler die Transaktion nicht abbricht)
	for (const slug of [
		base,
		`${base.slice(0, 35)}-${randomBytes(2).toString("hex")}`,
	]) {
		try {
			const row = await tx.transaction(async (sp) => {
				const [r] = await sp
					.insert(policyPortals)
					.values({ organizationId: orgId, slug, orgName: org.name })
					.returning();
				return r;
			});
			if (row) return row;
		} catch (e) {
			if (!isUniqueViolation(e)) throw e;
		}
	}
	throw new Error("portal slug unavailable");
}

export type PortalReaderRow = {
	id: string;
	email: string;
	confirmedAt: Date | null;
	lastSeenAt: Date | null;
	acknowledgements: number;
	activeSessions: number;
};

export async function portalReaders(
	tx: OrgTx,
	orgId: string,
): Promise<PortalReaderRow[]> {
	const now = new Date();
	const [readers, acks, sessions] = await Promise.all([
		tx
			.select({
				id: policyReaders.id,
				email: policyReaders.email,
				confirmedAt: policyReaders.confirmedAt,
				lastSeenAt: policyReaders.lastSeenAt,
			})
			.from(policyReaders)
			.where(eq(policyReaders.organizationId, orgId))
			.orderBy(desc(policyReaders.lastSeenAt)),
		tx
			.select({ readerId: policyReaderAcknowledgements.readerId, n: count() })
			.from(policyReaderAcknowledgements)
			.where(eq(policyReaderAcknowledgements.organizationId, orgId))
			.groupBy(policyReaderAcknowledgements.readerId),
		tx
			.select({ subjectId: accessTokens.subjectId, n: count() })
			.from(accessTokens)
			.where(
				and(
					eq(accessTokens.organizationId, orgId),
					eq(accessTokens.kind, "policy_reader"),
					isNull(accessTokens.revokedAt),
					gt(accessTokens.expiresAt, now),
				),
			)
			.groupBy(accessTokens.subjectId),
	]);
	const ackBy = new Map(acks.map((a) => [a.readerId, a.n]));
	const sesBy = new Map(sessions.map((s) => [s.subjectId, s.n]));
	// nur, wer schon einmal mit Code hineingekommen ist
	return readers
		.filter((r) => r.confirmedAt)
		.map((r) => ({
			...r,
			acknowledgements: ackBy.get(r.id) ?? 0,
			activeSessions: sesBy.get(r.id) ?? 0,
		}));
}

// Kenntnisnahmen einer Fassung über das Portal (Dokumentseite).
export async function portalAcknowledgementsFor(
	tx: OrgTx,
	orgId: string,
	versionId: string,
) {
	return tx
		.select({
			email: policyReaders.email,
			acknowledgedAt: policyReaderAcknowledgements.acknowledgedAt,
		})
		.from(policyReaderAcknowledgements)
		.innerJoin(
			policyReaders,
			eq(policyReaders.id, policyReaderAcknowledgements.readerId),
		)
		.where(
			and(
				eq(policyReaderAcknowledgements.organizationId, orgId),
				eq(policyReaderAcknowledgements.documentVersionId, versionId),
			),
		)
		.orderBy(desc(policyReaderAcknowledgements.acknowledgedAt));
}
