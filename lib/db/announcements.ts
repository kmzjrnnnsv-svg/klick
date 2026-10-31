import { and, desc, eq, gt, inArray, isNull, or, sql } from "drizzle-orm";
import { type DbTx, globalDb } from "@/db";
import { organization } from "@/db/auth-schema";
import {
	announcementAcknowledgements,
	platformAnnouncements,
} from "@/db/schema";

// Mitteilungen an Kund:innen (Admin-Portal, Teil 6). platform_announcements
// ist Plattform-Inhalt ohne RLS: Lesen und Schreiben nur hier. Kenntnisnahmen
// gehören der Org (RLS + FORCE) und laufen über readOrg/mutateOrg bzw. für
// die Admin-Übersicht über withPlatform.

export type Announcement = typeof platformAnnouncements.$inferSelect;

export async function listAnnouncements(limit = 100): Promise<Announcement[]> {
	return globalDb
		.select()
		.from(platformAnnouncements)
		.orderBy(desc(platformAnnouncements.startsAt))
		.limit(limit);
}

export async function announcementById(id: string) {
	const [row] = await globalDb
		.select()
		.from(platformAnnouncements)
		.where(eq(platformAnnouncements.id, id))
		.limit(1);
	return row ?? null;
}

/** Noch nicht beendet und nicht zurückgezogen, für diese Org (oder alle). */
export async function openAnnouncementsFor(orgId: string, now: Date) {
	return globalDb
		.select()
		.from(platformAnnouncements)
		.where(
			and(
				isNull(platformAnnouncements.withdrawnAt),
				or(
					isNull(platformAnnouncements.endsAt),
					gt(platformAnnouncements.endsAt, now),
				),
				or(
					isNull(platformAnnouncements.orgIds),
					sql`${orgId}::uuid = any(${platformAnnouncements.orgIds})`,
				),
			),
		)
		.orderBy(desc(platformAnnouncements.startsAt))
		.limit(20);
}

export async function insertAnnouncement(
	values: typeof platformAnnouncements.$inferInsert,
) {
	const [row] = await globalDb
		.insert(platformAnnouncements)
		.values(values)
		.returning();
	if (!row) throw new Error("announcement insert failed");
	return row;
}

export async function markWithdrawn(id: string, userId: string) {
	const [row] = await globalDb
		.update(platformAnnouncements)
		.set({ withdrawnAt: new Date(), withdrawnBy: userId })
		.where(
			and(
				eq(platformAnnouncements.id, id),
				isNull(platformAnnouncements.withdrawnAt),
			),
		)
		.returning({ id: platformAnnouncements.id });
	return Boolean(row);
}

export async function allOrgIds(): Promise<string[]> {
	const rows = await globalDb
		.select({ id: organization.id })
		.from(organization);
	return rows.map((r) => r.id);
}

/** Kenntnisnahmen dieser Org (Org-Kontext). */
export async function acknowledgedIds(tx: DbTx, orgId: string) {
	const rows = await tx
		.select({ id: announcementAcknowledgements.announcementId })
		.from(announcementAcknowledgements)
		.where(eq(announcementAcknowledgements.organizationId, orgId));
	return new Set(rows.map((r) => r.id));
}

/** Je Mitteilung die Orgs, die sie zur Kenntnis genommen haben (Plattform). */
export async function acknowledgementCounts(
	tx: DbTx,
	ids: readonly string[],
): Promise<Map<string, number>> {
	if (ids.length === 0) return new Map();
	const rows = await tx
		.select({
			id: announcementAcknowledgements.announcementId,
			n: sql<number>`count(*)::int`,
		})
		.from(announcementAcknowledgements)
		.where(inArray(announcementAcknowledgements.announcementId, [...ids]))
		.groupBy(announcementAcknowledgements.announcementId);
	return new Map(rows.map((r) => [r.id, Number(r.n)]));
}
