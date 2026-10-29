"use server";

import type { PublicKeyCredentialRequestOptionsJSON } from "@simplewebauthn/server";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { approvalRequests } from "@/db/schema";
import { safeAction } from "@/lib/actions/safe";
import { approvalEffects } from "@/lib/approvals/effects";
import { decide, latestRequestFor } from "@/lib/approvals/service";
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
	prepareDocumentSignText,
	storeDocumentSignature,
} from "@/lib/signatures/document";
import { holdsFunction, SIGN_VALID_MS } from "@/lib/signatures/service";
import { type ActionResult, fromZod } from "@/lib/validation/common";
import {
	prepareDocumentSignatureSchema,
	submitDocumentSignatureSchema,
} from "@/lib/validation/signatures";

// „Freigeben und unterschreiben“ im Umlauf (Dokumentenlenkung, ISO 27001
// 7.5/A.5.1): die Unterschrift per Passkey über die eingereichte Fassung
// zählt als Zustimmung in der Freigabe-Stufe. Erst ausstellen (versiegelt,
// 10 min), dann Assertion prüfen, Unterschrift anhängend speichern und in
// derselben Transaktion zustimmen — scheitert die Zustimmung, bleibt auch
// keine Unterschrift stehen.

class DecisionFailed extends Error {
	constructor(readonly code: string) {
		super(code);
	}
}

async function prepareDocumentSignatureImpl(input: unknown): Promise<
	ActionResult<{
		text: string;
		seal: string;
		options: PublicKeyCredentialRequestOptionsJSON;
	}>
> {
	const c = await requireOrg({ approval: ["decide"] });
	const parsed = prepareDocumentSignatureSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const prepared = await readOrg(toOrgCtx(c), async (tx) => {
		// Funktion der Unterschrift: die der laufenden Freigabestufe (z. B.
		// Geschäftsleitung), wenn die Person sie hält; sonst ohne
		let fn = parsed.data.function;
		if (fn === "-") {
			const req = await latestRequestFor(
				tx,
				c.orgId,
				"document",
				parsed.data.documentId,
			);
			const step = req?.steps.find((s) => s.order === req.currentStep);
			const rules = step?.expandedFrom ?? step?.approvers ?? [];
			for (const r of rules) {
				const f = r.startsWith("function:") ? r.slice(9) : null;
				if (f && (await holdsFunction(tx, c.orgId, c.userId, f))) {
					fn = f;
					break;
				}
			}
		}
		return prepareDocumentSignText(tx, {
			orgId: c.orgId,
			userId: c.userId,
			documentId: parsed.data.documentId,
			function: fn,
		});
	});
	if (!prepared) return { ok: false, error: "not_in_review" };
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

async function submitDocumentSignatureImpl(
	input: unknown,
): Promise<ActionResult<{ status: string }>> {
	const c = await requireOrg({ approval: ["decide"] });
	const parsed = submitDocumentSignatureSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const { text, seal, documentId, response } = parsed.data;
	const fields = parseSignText(text);
	const now = Date.now();
	if (
		!fields ||
		!fields.target.startsWith("docver:") ||
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

	try {
		const status = await mutateOrg(toOrgCtx(c), async (tx) => {
			const [req] = await tx
				.select({
					id: approvalRequests.id,
					versionRef: approvalRequests.entityVersionRef,
				})
				.from(approvalRequests)
				.where(
					and(
						eq(approvalRequests.organizationId, c.orgId),
						eq(approvalRequests.entityType, "document"),
						eq(approvalRequests.entityId, documentId),
						eq(approvalRequests.status, "pending"),
					),
				)
				.limit(1);
			if (!req) throw new DecisionFailed("not_pending");
			const stored = await storeDocumentSignature(tx, {
				orgId: c.orgId,
				documentId,
				fields,
				signText: text,
				signerName: c.name || c.email,
				assertion: verified.assertion,
				approvalRequestId: req.id,
			});
			if (!stored) throw new DecisionFailed("invalid");
			// Antrag gilt genau der eingereichten Fassung
			if (req.versionRef && req.versionRef !== stored.target.version)
				throw new DecisionFailed("not_pending");
			const r = await decide(
				tx,
				{ orgId: c.orgId, userId: c.userId, name: c.name },
				{ requestId: req.id, decision: "approved", signed: true },
			);
			if (!r.ok) throw new DecisionFailed(r.error);
			const effects = await approvalEffects(
				tx,
				{ orgId: c.orgId, userId: c.userId, name: c.name },
				r,
				req.id,
			);
			return {
				result: r.status,
				audit: [
					stored.audit,
					{
						action: "approval.approved",
						target: `document:${documentId}`,
						after: {
							requestId: req.id,
							decision: "approved",
							signed: true,
							outcome: r.status,
							onBehalfOf: r.onBehalfOf ?? null,
						},
					},
					...effects,
				],
			};
		});
		revalidatePath("/dokumente", "layout");
		revalidatePath("/heute", "layout");
		return { ok: true, data: { status } };
	} catch (e) {
		if (e instanceof DecisionFailed) return { ok: false, error: e.code };
		throw e;
	}
}

export const prepareDocumentSignature = safeAction(
	"prepareDocumentSignature",
	prepareDocumentSignatureImpl,
);
export const submitDocumentSignature = safeAction(
	"submitDocumentSignature",
	submitDocumentSignatureImpl,
);
