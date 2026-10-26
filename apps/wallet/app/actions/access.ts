"use server";

import { requireStepUp, toOrgCtx } from "@wallet/lib/auth/guards";
import { userOnlyDeviceBound } from "@wallet/lib/auth/security-keys";
import type { AccessChange } from "@wallet/lib/orgs/access-policy";
import { updateAccessPolicy } from "@wallet/lib/orgs/access-service";
import { accessPolicySchema } from "@wallet/lib/validation/access";
import { revalidatePath } from "next/cache";
import { safeAction } from "@/lib/actions/safe";
import { type ActionResult, fromZod } from "@/lib/validation/common";

// Einstellungen > Zugang (Härtung W): nur Inhaber:innen (settings:update),
// immer mit frischem Step-up. Regeln und Aussperr-Schutz im Dienst.

async function saveAccessPolicyImpl(
	input: unknown,
): Promise<ActionResult<{ changes: AccessChange[] }>> {
	const c = await requireStepUp("settings:update");
	const parsed = accessPolicySchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const res = await updateAccessPolicy(toOrgCtx(c), parsed.data, {
		ip: c.ip,
		onlyDeviceBound: await userOnlyDeviceBound(c.userId),
	});
	if (res.ok) revalidatePath("/", "layout");
	return res;
}

export const saveAccessPolicy = safeAction(
	"saveAccessPolicy",
	saveAccessPolicyImpl,
);
