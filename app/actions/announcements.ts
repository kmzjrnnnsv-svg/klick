"use server";

import { revalidatePath } from "next/cache";
import { safeAction } from "@/lib/actions/safe";
import { acknowledgeAnnouncement } from "@/lib/announcements/service";
import { getSessionCtx, requireOrg, toOrgCtx } from "@/lib/auth/guards";
import type { ActionResult } from "@/lib/validation/common";

// Mitteilung von Klick zur Kenntnis nehmen (Sicherheitsvorfall): nur
// Inhaber:innen und Geschäftsleitung, einmal je Org, Eintrag in der Kette.
// Nie in einer Impersonation-Sitzung: der Klick-Support quittiert nicht für
// die Org, was er selbst gemeldet hat.
async function acknowledgeImpl(id: string): Promise<ActionResult> {
	const ctx = await requireOrg();
	if ((await getSessionCtx())?.session.impersonatedBy)
		return { ok: false, error: "forbidden" };
	if (typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id))
		return { ok: false, error: "not_found" };
	const res = await acknowledgeAnnouncement(
		{ ...toOrgCtx(ctx), userId: ctx.userId },
		id,
	);
	if (res.ok) revalidatePath("/", "layout");
	return res;
}

export const acknowledgeAnnouncementAction = safeAction(
	"acknowledgeAnnouncementAction",
	acknowledgeImpl,
);
