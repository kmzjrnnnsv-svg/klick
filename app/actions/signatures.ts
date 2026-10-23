"use server";

import type { PublicKeyCredentialRequestOptionsJSON } from "@simplewebauthn/server";
import { revalidatePath } from "next/cache";
import { safeAction } from "@/lib/actions/safe";
import { requireOrg, toOrgCtx } from "@/lib/auth/guards";
import {
	passkeySignOptions,
	verifyPasskeySignature,
} from "@/lib/auth/passkey-sign";
import { mutateOrg, readOrg } from "@/lib/db/with-org";
import { env } from "@/lib/env";
import {
	checkSeal,
	parseSignText,
	sealSignText,
} from "@/lib/signatures/canonical";
import {
	prepareSignText,
	SIGN_VALID_MS,
	storeSignatures,
} from "@/lib/signatures/service";
import { type ActionResult, fromZod } from "@/lib/validation/common";
import {
	prepareSignatureSchema,
	submitSignatureSchema,
} from "@/lib/validation/signatures";

// Nachweise per Passkey unterschreiben (N4): erst den kanonischen Text
// ausstellen (versiegelt, 10 min), dann die Assertion prüfen und anhängend
// speichern — eine Bestätigung je Unterschrift, auch für viele Nachweise.

async function prepareEvidenceSignatureImpl(input: unknown): Promise<
	ActionResult<{
		text: string;
		seal: string;
		options: PublicKeyCredentialRequestOptionsJSON;
	}>
> {
	const c = await requireOrg({ evidence: ["read"] });
	const parsed = prepareSignatureSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const prepared = await readOrg(toOrgCtx(c), (tx) =>
		prepareSignText(tx, {
			orgId: c.orgId,
			userId: c.userId,
			evidenceIds: parsed.data.evidenceIds,
			function: parsed.data.function,
			purpose: parsed.data.purpose,
		}),
	);
	if (!prepared) return { ok: false, error: "invalid" };
	const options = await passkeySignOptions(c.userId, prepared.text);
	if (!options) return { ok: false, error: "no_passkey" };
	return {
		ok: true,
		data: {
			text: prepared.text,
			seal: sealSignText(prepared.text, env().BETTER_AUTH_SECRET),
			options,
		},
	};
}

async function submitEvidenceSignatureImpl(
	input: unknown,
): Promise<ActionResult<{ count: number }>> {
	const c = await requireOrg({ evidence: ["read"] });
	const parsed = submitSignatureSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const { text, seal, evidenceIds, response } = parsed.data;
	const fields = parseSignText(text);
	const now = Date.now();
	if (
		!fields ||
		!checkSeal(text, seal, env().BETTER_AUTH_SECRET) ||
		fields.org !== c.orgId ||
		fields.signer !== c.userId
	)
		return { ok: false, error: "invalid" };
	const expires = Date.parse(fields.expires);
	if (!(expires > now) || expires > now + SIGN_VALID_MS + 60_000)
		return { ok: false, error: "expired" };
	const verified = await verifyPasskeySignature({
		userId: c.userId,
		signText: text,
		response,
	});
	if (!verified.ok) return { ok: false, error: "invalid" };
	const res = await mutateOrg(toOrgCtx(c), async (tx) => {
		const stored = await storeSignatures(tx, {
			orgId: c.orgId,
			fields,
			signText: text,
			signerName: c.name || c.email,
			evidenceIds,
			assertion: verified.assertion,
		});
		return stored
			? { result: stored.count, audit: stored.audit }
			: { result: null, audit: [] };
	});
	if (res === null) return { ok: false, error: "invalid" };
	revalidatePath("/controls", "layout");
	revalidatePath("/rahmenwerke", "layout");
	revalidatePath("/nachweise", "layout");
	return { ok: true, data: { count: res } };
}

export const prepareEvidenceSignature = safeAction(
	"prepareEvidenceSignature",
	prepareEvidenceSignatureImpl,
);
export const submitEvidenceSignature = safeAction(
	"submitEvidenceSignature",
	submitEvidenceSignatureImpl,
);
