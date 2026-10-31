"use server";

import { z } from "zod";
import { safeAction } from "@/lib/actions/safe";
import { requireStepUp, toOrgCtx } from "@/lib/auth/guards";
import { env } from "@/lib/env";
import { issueSiteLinkAsOwner } from "@/lib/site-tunnels/service";
import { type ActionResult, fromZod } from "@/lib/validation/common";

// Einstellungen > Netzwerk > Standort-Tunnel (ADR-033): Inhaber:innen
// stellen der IT einen neuen Link aus (Step-up; der alte gilt dann nicht
// mehr). Anlegen und Abbauen macht der Klick-Betrieb.
async function issueOwnSiteLinkImpl(
	id: unknown,
): Promise<ActionResult<{ url: string; expiresAt: string }>> {
	const c = await requireStepUp({ settings: ["update"] });
	// Impersonation kommt hier nicht durch: deren Step-up steht auf der
	// Epoche und lässt sich nur mit dem Passkey der Person bestätigen
	if (c.orgRole !== "owner") return { ok: false, error: "forbidden" };
	const parsed = z.uuid().safeParse(id);
	if (!parsed.success) return fromZod(parsed.error);
	const link = await issueSiteLinkAsOwner(
		{ ...toOrgCtx(c), userId: c.userId },
		parsed.data,
	);
	if (!link) return { ok: false, error: "not_found" };
	const origin = new URL(env().BETTER_AUTH_URL).origin;
	return {
		ok: true,
		data: {
			url: `${origin}/standort#${link.token}`,
			expiresAt: link.expiresAt.toISOString(),
		},
	};
}

export const issueOwnSiteLink = safeAction(
	"issueOwnSiteLink",
	issueOwnSiteLinkImpl,
);
