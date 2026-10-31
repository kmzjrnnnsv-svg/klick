"use server";

import { revalidatePath } from "next/cache";
import { safeAction } from "@/lib/actions/safe";
import {
	publishAnnouncement,
	withdrawAnnouncement,
} from "@/lib/announcements/service";
import { requirePlatformAdmin, requirePlatformStepUp } from "@/lib/auth/guards";
import { announcementSchema } from "@/lib/validation/announcements";
import { type ActionResult, fromZod } from "@/lib/validation/common";

// Admin > Mitteilungen (Admin-Portal, Teil 6). Veröffentlichen mit Step-up
// (ein Vorfall mailt sofort alle Inhaber:innen und Geschäftsleitungen),
// Zurückziehen ohne: es nimmt nur einen Hinweis weg.

async function publishImpl(
	input: unknown,
): Promise<ActionResult<{ id: string; orgs: number; notified: number }>> {
	const a = await requirePlatformStepUp();
	const parsed = announcementSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const res = await publishAnnouncement(a, parsed.data);
	if (res.ok) revalidatePath("/admin/mitteilungen");
	return res;
}

async function withdrawImpl(id: string): Promise<ActionResult> {
	const a = await requirePlatformAdmin();
	if (typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id))
		return { ok: false, error: "not_found" };
	const res = await withdrawAnnouncement(a, id);
	if (res.ok) revalidatePath("/admin/mitteilungen");
	return res;
}

export const publishAnnouncementAction = safeAction(
	"publishAnnouncementAction",
	publishImpl,
);
export const withdrawAnnouncementAction = safeAction(
	"withdrawAnnouncementAction",
	withdrawImpl,
);
