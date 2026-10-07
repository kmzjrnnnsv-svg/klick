"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { notifications } from "@/db/schema";
import { requireOrg, toOrgCtx } from "@/lib/auth/guards";
import { withOrg } from "@/lib/db/with-org";

export async function markAllNotificationsRead(): Promise<void> {
	const c = await requireOrg();
	await withOrg(toOrgCtx(c), (tx) =>
		tx
			.update(notifications)
			.set({ readAt: new Date() })
			.where(
				and(eq(notifications.userId, c.userId), isNull(notifications.readAt)),
			),
	);
	revalidatePath("/", "layout");
}
