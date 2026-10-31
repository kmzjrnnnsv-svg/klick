"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { orgSettings } from "@/db/schema";
import { safeAction } from "@/lib/actions/safe";
import { requireStepUp, toOrgCtx } from "@/lib/auth/guards";
import { mutateOrg } from "@/lib/db/with-org";
import { requestApplyChange } from "@/lib/security-changes/service";
import {
	type SignaturePolicy,
	signaturePolicyOf,
	signaturePolicyRelaxed,
} from "@/lib/signatures/policy";
import { orgSignaturePolicy } from "@/lib/signatures/policy-server";
import { type ActionResult, fromZod } from "@/lib/validation/common";

// Unterschriften nur mit Sicherheitsschlüssel (AP9.1b): Inhaber:in mit
// Step-up; einschalten wirkt sofort, ausschalten nur über Vier-Augen bzw.
// 24 h Wartezeit (Art signature_policy, ADR-028).

const PATH = "/einstellungen";

async function saveSignaturePolicyImpl(
	input: unknown,
): Promise<ActionResult<{ status: "saved" }>> {
	const c = await requireStepUp({ settings: ["update"] });
	if (c.orgRole !== "owner") return { ok: false, error: "forbidden" };
	const parsed = z.object({ securityKeysOnly: z.boolean() }).safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const current = await orgSignaturePolicy(toOrgCtx(c));
	const next: SignaturePolicy = signaturePolicyOf(parsed.data);
	if (next.securityKeysOnly === current.securityKeysOnly)
		return { ok: true, data: { status: "saved" } };
	// Antwort ist ein Hinweis-Code four_eyes_* (UI: isFourEyesNotice)
	if (signaturePolicyRelaxed(current, next))
		return requestApplyChange(c, {
			kind: "signature_policy",
			targetKey: null,
			summary: "Unterschriften auch mit synchronisierten Passkeys zulassen",
			payload: { value: next },
			before: current,
		});
	await mutateOrg(toOrgCtx(c), async (tx) => {
		await tx
			.update(orgSettings)
			.set({ signaturePolicy: next })
			.where(eq(orgSettings.organizationId, c.orgId));
		return {
			result: null,
			audit: {
				action: "settings.signature_policy",
				target: `organization:${c.orgId}`,
				before: current,
				after: next,
			},
		};
	});
	revalidatePath(PATH);
	return { ok: true, data: { status: "saved" } };
}

export const saveSignaturePolicy = safeAction(
	"saveSignaturePolicy",
	saveSignaturePolicyImpl,
);
