"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { safeAction } from "@/lib/actions/safe";
import { requireStepUp, toOrgCtx } from "@/lib/auth/guards";
import { mutateOrg } from "@/lib/db/with-org";
import { type ActionResult, fromZod } from "@/lib/validation/common";
import {
	createWalletLink,
	renewWalletLinkToken,
	revokeWalletLink,
} from "@/lib/wallet-link-ingest/service";

// Einstellungen → Integrationen → „both.money verbinden“ (Plan both.money,
// K4): Verbindung anlegen, Token erneuern und trennen nur mit Step-up. Der
// Klartext des Tokens kommt genau einmal zurück, das Audit kennt nur das
// Präfix.

const PATH = "/einstellungen";
const nameSchema = z.object({ name: z.string().trim().min(1).max(80) });
const idSchema = z.object({ linkId: z.uuid() });

async function connectWalletImpl(
	input: unknown,
): Promise<ActionResult<{ token: string; expiresAt: string }>> {
	const c = await requireStepUp({ integration: ["create"] });
	const parsed = nameSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const r = await mutateOrg(toOrgCtx(c), async (tx) => {
		const created = await createWalletLink(tx, c, parsed.data);
		return { result: created, audit: created.audit };
	});
	revalidatePath(PATH);
	revalidatePath("/", "layout");
	return {
		ok: true,
		data: { token: r.token, expiresAt: r.expiresAt.toISOString() },
	};
}

async function renewWalletTokenImpl(
	input: unknown,
): Promise<ActionResult<{ token: string; expiresAt: string }>> {
	const c = await requireStepUp({ integration: ["create"] });
	const parsed = idSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	type Renewed = Awaited<ReturnType<typeof renewWalletLinkToken>>;
	const r = await mutateOrg<Renewed>(toOrgCtx(c), async (tx) => {
		const res = await renewWalletLinkToken(tx, c, parsed.data.linkId);
		return res.ok
			? { result: res, audit: res.audit }
			: { result: res, audit: [] };
	});
	if (!r.ok) return { ok: false, error: "notFound" };
	revalidatePath(PATH);
	return {
		ok: true,
		data: { token: r.token, expiresAt: r.expiresAt.toISOString() },
	};
}

async function disconnectWalletImpl(input: unknown): Promise<ActionResult> {
	const c = await requireStepUp({ integration: ["revoke"] });
	const parsed = idSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const ok = await mutateOrg(toOrgCtx(c), async (tx) => {
		const a = await revokeWalletLink(tx, c, parsed.data.linkId);
		return { result: Boolean(a), audit: a ?? [] };
	});
	if (!ok) return { ok: false, error: "notFound" };
	revalidatePath(PATH);
	revalidatePath("/", "layout");
	return { ok: true, data: undefined };
}

export const connectWallet = safeAction("connectWallet", connectWalletImpl);
export const renewWalletToken = safeAction(
	"renewWalletToken",
	renewWalletTokenImpl,
);
export const disconnectWallet = safeAction(
	"disconnectWallet",
	disconnectWalletImpl,
);
