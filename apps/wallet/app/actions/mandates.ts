"use server";

import type { AuthenticationResponseJSON } from "@simplewebauthn/server";
import { payoutMandates } from "@wallet/db/schema";
import { requireUnlocked, toOrgCtx } from "@wallet/lib/auth/guards";
import { readOrg } from "@wallet/lib/db/with-org";
import {
	mandateSchema,
	type PreparedMandate,
	revokeMandateSchema,
} from "@wallet/lib/validation/mandates";
import {
	registerMandateInSigner,
	revokeMandateInSigner,
} from "@wallet/lib/wallet/mandate-signer";
import {
	prepareMandate,
	revokeMandate,
	submitMandate,
} from "@wallet/lib/wallet/mandates";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { safeAction } from "@/lib/actions/safe";
import { type ActionResult, fail, fromZod } from "@/lib/validation/common";

// Vollmachten (Härtung W): ausstellen nur Inhaber:innen (wallet:manage) mit
// entsperrter Wallet; die Unterschrift per Sicherheitsschlüssel ersetzt den
// Step-up. Widerrufen bremst nur und geht ohne. Mit eigenem Signer geht die
// Vollmacht danach in den Signer (Schritt 2) und wird dort per
// Sicherheitsschlüssel freigegeben; ohne Signer gilt Schritt 1 allein.

// Fehler, bei denen es keinen Signer dieser Org gibt (dann nur Schritt 1)
const NO_SIGNER = new Set([
	"signer_off",
	"signer_uninitialized",
	"signer_other_org",
]);

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

async function submitMandateImpl(response: AuthenticationResponseJSON): Promise<
	ActionResult<{
		id: string;
		signer: "registered" | "none" | "failed";
		confirmUrl: string | null;
	}>
> {
	const c = await requireUnlocked("wallet:manage");
	if (typeof response?.id !== "string" || !response.response)
		return fail("invalid");
	const ctx = { ...toOrgCtx(c), userId: c.userId };
	const res = await submitMandate({ ...ctx, sessionId: c.sessionId }, response);
	if (!res.ok) return res;
	revalidatePath(PAGE);
	// die Vollmacht gilt in der App schon; der Signer kommt dazu, wenn es ihn gibt
	const reg = await registerMandateInSigner(ctx, res.data.id);
	if (reg.ok)
		return {
			ok: true,
			data: {
				id: res.data.id,
				signer: "registered",
				confirmUrl: reg.data.confirmUrl,
			},
		};
	return {
		ok: true,
		data: {
			id: res.data.id,
			signer: NO_SIGNER.has(reg.error) ? "none" : "failed",
			confirmUrl: null,
		},
	};
}

async function revokeMandateImpl(input: unknown): Promise<ActionResult> {
	const c = await requireUnlocked("wallet:manage");
	const parsed = revokeMandateSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const ctx = { ...toOrgCtx(c), userId: c.userId };
	const res = await revokeMandate(ctx, parsed.data.id, parsed.data.reason);
	if (!res.ok) return res;
	revalidatePath(PAGE);
	// im Signer ebenfalls (bremst); ohne Signer oder bei Ausfall bleibt
	// „Mit Signer abgleichen“ auf der Seite
	await revokeMandateInSigner(ctx, parsed.data.id);
	return res;
}

// Stand im Signer an die App angleichen: widerrufen bzw. (erneut) anlegen
async function syncMandateSignerImpl(
	input: unknown,
): Promise<ActionResult<{ confirmUrl: string | null }>> {
	const c = await requireUnlocked("wallet:manage");
	const id = typeof input === "string" ? input : "";
	if (!/^[0-9a-f-]{36}$/.test(id)) return fail("invalid");
	const ctx = { ...toOrgCtx(c), userId: c.userId };
	const [row] = await readOrg(ctx, (tx) =>
		tx
			.select({ revokedAt: payoutMandates.revokedAt })
			.from(payoutMandates)
			.where(
				and(
					eq(payoutMandates.id, id),
					eq(payoutMandates.organizationId, c.orgId),
				),
			)
			.limit(1),
	);
	if (!row) return fail("notFound");
	const res = row.revokedAt
		? await revokeMandateInSigner(ctx, id).then((r) =>
				r.ok ? { ok: true as const, data: { confirmUrl: null } } : r,
			)
		: await registerMandateInSigner(ctx, id);
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
export const syncMandateSignerAction = safeAction(
	"syncMandateSigner",
	syncMandateSignerImpl,
);
