"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { safeAction } from "@/lib/actions/safe";
import { auditPlatform } from "@/lib/audit";
import { getSessionCtx } from "@/lib/auth/guards";
import { expireStepUp, listUserMemberships } from "@/lib/auth/org";
import { auth } from "@/lib/auth/server";
import { AuthError, checkSessionRules } from "@/lib/auth/session-rules";
import type { ActionResult } from "@/lib/validation/common";

// Organisation wechseln (ADR-018, Berater:innen mit mehreren Zugängen).
// Nur eigene, nicht abgelaufene Mitgliedschaften; der Step-up verfällt beim
// Wechsel, damit eine MFA-Bestätigung nie in einen anderen Mandanten trägt.
async function switchOrganizationImpl(orgId: string): Promise<ActionResult> {
	const ctx = await getSessionCtx();
	if (!ctx) throw new AuthError("unauthenticated");
	checkSessionRules(ctx);
	// Als Person angemeldet: nur in der Org der Freigabe (Lockbox, Härtung A3)
	if (ctx.session.impersonatedBy) return { ok: false, error: "forbidden" };
	if (!z.uuid().safeParse(orgId).success)
		return { ok: false, error: "Organisation nicht gefunden" };
	const target = (await listUserMemberships(ctx.user.id)).find(
		(m) => m.organizationId === orgId,
	);
	if (!target) return { ok: false, error: "Organisation nicht gefunden" };
	if (target.expired)
		return {
			ok: false,
			error: "Dein Zugang zu dieser Organisation ist abgelaufen.",
		};
	const from = ctx.session.activeOrganizationId ?? null;
	if (from !== orgId) {
		await auth.api.setActiveOrganization({
			body: { organizationId: orgId },
			headers: await headers(),
		});
		await expireStepUp({ sessionId: ctx.session.id });
		await auditPlatform(
			{ userId: ctx.user.id, ip: ctx.ip, userAgent: ctx.userAgent },
			{
				action: "org.switched",
				target: `organization:${orgId}`,
				organizationId: orgId,
				after: { from, role: target.role },
			},
		);
	}
	redirect("/heute");
}

export const switchOrganization = safeAction(
	"switchOrganization",
	switchOrganizationImpl,
);
