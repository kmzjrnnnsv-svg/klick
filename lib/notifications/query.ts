import { and, desc, eq, isNull } from "drizzle-orm";
import { notifications } from "@/db/schema";
import type { OrgTx } from "@/lib/db/with-org";

export async function listNotifications(tx: OrgTx, userId: string, limit = 8) {
	return tx
		.select()
		.from(notifications)
		.where(eq(notifications.userId, userId))
		.orderBy(desc(notifications.createdAt))
		.limit(limit);
}

export async function unreadCount(tx: OrgTx, userId: string): Promise<number> {
	const rows = await tx
		.select({ id: notifications.id })
		.from(notifications)
		.where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
	return rows.length;
}
