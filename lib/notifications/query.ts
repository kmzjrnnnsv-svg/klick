import { and, count, desc, eq, inArray, isNull, lt } from "drizzle-orm";
import { notifications, tasks } from "@/db/schema";
import type { OrgTx } from "@/lib/db/with-org";
import { todayBerlin } from "@/lib/time/berlin";

export async function listNotifications(tx: OrgTx, userId: string, limit = 8) {
	return tx
		.select()
		.from(notifications)
		.where(eq(notifications.userId, userId))
		.orderBy(desc(notifications.createdAt))
		.limit(limit);
}

export async function unreadCount(tx: OrgTx, userId: string): Promise<number> {
	// count(*) statt alle IDs zu laden — läuft in jedem App-Layout.
	const [row] = await tx
		.select({ n: count() })
		.from(notifications)
		.where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
	return row?.n ?? 0;
}

// Navigation „Heute“: überfällige offene Aufgaben der Person (Berliner Tag).
export async function overdueTaskCount(
	tx: OrgTx,
	orgId: string,
	userId: string,
): Promise<number> {
	const [row] = await tx
		.select({ n: count() })
		.from(tasks)
		.where(
			and(
				eq(tasks.organizationId, orgId),
				eq(tasks.assigneeUserId, userId),
				inArray(tasks.status, ["todo", "doing", "blocked"]),
				lt(tasks.dueAt, todayBerlin()),
			),
		);
	return row?.n ?? 0;
}
