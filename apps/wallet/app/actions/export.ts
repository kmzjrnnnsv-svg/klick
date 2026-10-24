"use server";

import { requireOrg, requireStepUp, toOrgCtx } from "@wallet/lib/auth/guards";
import { walletEnv } from "@wallet/lib/env";
import {
	createLink,
	renewLinkToken,
	setLinkState,
} from "@wallet/lib/export/link-service";
import {
	createLinkSchema,
	renewTokenSchema,
} from "@wallet/lib/validation/export";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { safeAction } from "@/lib/actions/safe";
import type { ActionResult } from "./auth";

// Einstellungen → Compliance-Export (Plan both.money, W4): verbinden,
// Token erneuern, fortsetzen und trennen nur mit Step-up; pausieren (bremsen)
// darf jede:r mit export:manage ohne.

const PAGE = "/settings/export";

async function createKlickLinkImpl(
	input: unknown,
): Promise<ActionResult<{ klickOrgName: string; events: number }>> {
	const c = await requireStepUp("export:manage");
	const parsed = createLinkSchema.safeParse(input);
	if (!parsed.success) return { ok: false, error: "invalid" };
	const res = await createLink(toOrgCtx(c), parsed.data, {
		origins: walletEnv().WALLET_KLICK_ORIGINS,
	});
	if (!res.ok) return res;
	revalidatePath(PAGE);
	return {
		ok: true,
		data: { klickOrgName: res.data.klickOrgName, events: res.data.events },
	};
}

async function renewKlickLinkTokenImpl(input: unknown): Promise<ActionResult> {
	const c = await requireStepUp("export:manage");
	const parsed = renewTokenSchema.safeParse(input);
	if (!parsed.success) return { ok: false, error: "invalid" };
	const res = await renewLinkToken(
		toOrgCtx(c),
		parsed.data.linkId,
		parsed.data.token,
		{ origins: walletEnv().WALLET_KLICK_ORIGINS },
	);
	if (!res.ok) return res;
	revalidatePath(PAGE);
	return { ok: true, data: undefined };
}

const stateInput = z.object({
	linkId: z.uuid(),
	what: z.enum(["pause", "resume", "revoke"]),
});

async function setKlickLinkStateImpl(input: unknown): Promise<ActionResult> {
	const parsed = stateInput.safeParse(input);
	const c =
		parsed.success && parsed.data.what === "pause"
			? await requireOrg("export:manage")
			: await requireStepUp("export:manage");
	if (!parsed.success) return { ok: false, error: "invalid" };
	const res = await setLinkState(
		toOrgCtx(c),
		parsed.data.linkId,
		parsed.data.what,
	);
	if (!res.ok) return res;
	revalidatePath(PAGE);
	return { ok: true, data: undefined };
}

export const createKlickLink = safeAction(
	"createKlickLink",
	createKlickLinkImpl,
);
export const renewKlickLinkToken = safeAction(
	"renewKlickLinkToken",
	renewKlickLinkTokenImpl,
);
export const setKlickLinkState = safeAction(
	"setKlickLinkState",
	setKlickLinkStateImpl,
);
