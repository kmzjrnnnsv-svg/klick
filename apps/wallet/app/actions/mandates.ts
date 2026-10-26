"use server";

import type { AuthenticationResponseJSON } from "@simplewebauthn/server";
import { requireUnlocked, toOrgCtx } from "@wallet/lib/auth/guards";
import {
	mandateSchema,
	type PreparedMandate,
	revokeMandateSchema,
} from "@wallet/lib/validation/mandates";
import {
	prepareMandate,
	revokeMandate,
	submitMandate,
} from "@wallet/lib/wallet/mandates";
import { revalidatePath } from "next/cache";
import { safeAction } from "@/lib/actions/safe";
import { type ActionResult, fail, fromZod } from "@/lib/validation/common";

// Vollmachten (Härtung W): ausstellen nur Inhaber:innen (wallet:manage) mit
// entsperrter Wallet; die Unterschrift per Sicherheitsschlüssel ersetzt den
// Step-up. Widerrufen bremst nur und geht ohne.

const PAGE = "/mandates";

async function prepareMandateImpl(
	input: unknown,
): Promise<ActionResult<PreparedMandate>> {
	const c = await requireUnlocked("wallet:manage");
	const parsed = mandateSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	return prepareMandate(
		{ ...toOrgCtx(c), userId: c.userId, sessionId: c.sessionId },
		parsed.data,
	);
}

async function submitMandateImpl(
	response: AuthenticationResponseJSON,
): Promise<ActionResult<{ id: string }>> {
	const c = await requireUnlocked("wallet:manage");
	if (typeof response?.id !== "string" || !response.response)
		return fail("invalid");
	const res = await submitMandate(
		{ ...toOrgCtx(c), userId: c.userId, sessionId: c.sessionId },
		response,
	);
	if (res.ok) revalidatePath(PAGE);
	return res;
}

async function revokeMandateImpl(input: unknown): Promise<ActionResult> {
	const c = await requireUnlocked("wallet:manage");
	const parsed = revokeMandateSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const res = await revokeMandate(
		{ ...toOrgCtx(c), userId: c.userId },
		parsed.data.id,
		parsed.data.reason,
	);
	if (res.ok) revalidatePath(PAGE);
	return res;
}

export const prepareMandateAction = safeAction(
	"prepareMandate",
	prepareMandateImpl,
);
export const submitMandateAction = safeAction(
	"submitMandate",
	submitMandateImpl,
);
export const revokeMandateAction = safeAction(
	"revokeMandate",
	revokeMandateImpl,
);
