"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { notifications } from "@/db/schema";
import { safeAction } from "@/lib/actions/safe";
import { requireOrg, toOrgCtx } from "@/lib/auth/guards";
import { withOrg } from "@/lib/db/with-org";
import { uuid } from "@/lib/validation/common";

async function markAllNotificationsReadImpl(): Promise<void> {
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

// Sicherheitsnetz: unerwartete Ausnahmen → { ok: false, error, ref } + Log
// statt Error-Boundary (lib/actions/safe.ts).
export const markAllNotificationsRead = safeAction(
	"markAllNotificationsRead",
	markAllNotificationsReadImpl,
	() => undefined,
);

// Klick auf eine Benachrichtigung in der Glocke: nur diese als gelesen.
async function markNotificationReadImpl(id: unknown): Promise<void> {
	const c = await requireOrg();
	const parsed = uuid.safeParse(id);
	if (!parsed.success) return;
	await withOrg(toOrgCtx(c), (tx) =>
		tx
			.update(notifications)
			.set({ readAt: new Date() })
			.where(
				and(
					eq(notifications.id, parsed.data),
					eq(notifications.userId, c.userId),
					isNull(notifications.readAt),
				),
			),
	);
	revalidatePath("/", "layout");
}

export const markNotificationRead = safeAction(
	"markNotificationRead",
	markNotificationReadImpl,
	() => undefined,
);
