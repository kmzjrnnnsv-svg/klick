"use server";

import { eq } from "drizzle-orm";
import { orgSettings } from "@/db/schema";
import { safeAction } from "@/lib/actions/safe";
import { requireOrg, toOrgCtx } from "@/lib/auth/guards";
import { mutateOrg } from "@/lib/db/with-org";
import { TERMS_FLAG, TERMS_VERSION, termsAccepted } from "@/lib/legal/terms";
import type { ActionResult } from "@/lib/validation/common";

// Nutzungsbedingungen beim ersten Einstieg bestätigen (Organisation vom
// Plattform-Admin angelegt): nur Inhaber:innen, einmal; danach wie beim
// Onboarding in org_settings.setupFlags.
async function acceptTermsImpl(confirmed: boolean): Promise<ActionResult> {
	const c = await requireOrg();
	if (c.orgRole !== "owner") return { ok: false, error: "forbidden" };
	if (confirmed !== true) return { ok: false, error: "terms_required" };
	return mutateOrg(toOrgCtx(c), async (tx) => {
		const [row] = await tx
			.select({ flags: orgSettings.setupFlags })
			.from(orgSettings)
			.where(eq(orgSettings.organizationId, c.orgId))
			.for("update");
		const flags = row?.flags ?? {};
		if (termsAccepted(flags))
			return { result: { ok: true as const, data: undefined }, audit: [] };
		const at = new Date().toISOString();
		await tx
			.update(orgSettings)
			.set({
				setupFlags: {
					...flags,
					[TERMS_FLAG.acceptedAt]: at,
					[TERMS_FLAG.version]: TERMS_VERSION,
				},
			})
			.where(eq(orgSettings.organizationId, c.orgId));
		return {
			result: { ok: true as const, data: undefined },
			audit: {
				action: "org.terms_accepted",
				target: `organization:${c.orgId}`,
				after: { version: TERMS_VERSION, at },
			},
		};
	});
}

export const acceptTerms = safeAction("acceptTerms", acceptTermsImpl);
