import { and, eq, inArray, sql } from "drizzle-orm";
import { notifications } from "@/db/schema";
import type { OrgTx } from "@/lib/db/with-org";

// Zuletzt erinnert je Person (/team): jüngste Erinnerung durch Inhaber:innen
// (Art „reminder“) in dieser Org; Index notifications_org_user_created_idx.
export async function lastReminders(
	tx: OrgTx,
	orgId: string,
	userIds?: readonly string[],
): Promise<Map<string, Date>> {
	if (userIds && userIds.length === 0) return new Map();
	const rows = await tx
		.select({
			userId: notifications.userId,
			at: sql<Date>`max(${notifications.createdAt})`,
		})
		.from(notifications)
		.where(
			and(
				eq(notifications.organizationId, orgId),
				eq(notifications.kind, "reminder"),
				userIds ? inArray(notifications.userId, [...userIds]) : undefined,
			),
		)
		.groupBy(notifications.userId);
	return new Map(rows.map((r) => [r.userId, new Date(r.at)]));
}
