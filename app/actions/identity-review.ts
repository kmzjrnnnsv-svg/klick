"use server";

import { revalidatePath } from "next/cache";
import type { z } from "zod";
import { safeAction } from "@/lib/actions/safe";
import { requireOrg, toOrgCtx } from "@/lib/auth/guards";
import { restrictedView } from "@/lib/auth/visibility";
import { mutateOrg, type OrgTx } from "@/lib/db/with-org";
import { createDraft } from "@/lib/evidence-authoring/service";
import { berlinToday } from "@/lib/evidence-studio/queries";
import { reviewEvidenceContent } from "@/lib/identity/review-evidence";
import { accessReviewDetail } from "@/lib/identity/review-queries";
import {
	closeAccessReview,
	confirmAllOpen,
	decideAccessReviewItem,
	type ReviewResult,
	startAccessReview,
} from "@/lib/identity/review-service";
import { IDENTITY_CHECKS } from "@/lib/identity/types";
import { type ActionResult, fromZod } from "@/lib/validation/common";
import {
	accessReviewIdSchema,
	decideAccessReviewSchema,
	startAccessReviewSchema,
} from "@/lib/validation/identity";

// Zugriffsprüfung (Teil D I2): starten und abschließen mit identity:update,
// entscheiden mit identity:review (eigene Einträge; Inhaber:innen alle).
// In Impersonation-Sitzungen nur lesen (identity in IMPERSONATION_READ_ONLY).

const BASE = "/team/zugriffspruefung";

async function run<T, D>(
	perm: "update" | "review",
	schema: z.ZodType<T>,
	input: unknown,
	fn: (
		tx: OrgTx,
		ctx: { orgId: string; userId: string; isOwner: boolean },
		data: T,
	) => Promise<ReviewResult<D>>,
	paths: (data: T, result: D) => string[],
): Promise<ActionResult<D>> {
	const c = await requireOrg({ identity: [perm] });
	const parsed = schema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const data = parsed.data;
	const res = await mutateOrg(toOrgCtx(c), async (tx) => {
		const r = await fn(
			tx,
			{ orgId: c.orgId, userId: c.userId, isOwner: c.orgRole === "owner" },
			data,
		);
		return { result: r, audit: r.ok ? r.audit : [] };
	});
	if (!res.ok) return res;
	for (const p of paths(data, res.data)) revalidatePath(p);
	return { ok: true, data: res.data };
}

async function startAccessReviewImpl(
	input: unknown,
): Promise<ActionResult<{ id: string; items: number }>> {
	return run(
		"update",
		startAccessReviewSchema,
		input,
		(tx, ctx, d) => startAccessReview(tx, ctx, { ...d, now: new Date() }),
		(_d, r) => [BASE, `${BASE}/${r.id}`],
	);
}

async function decideAccessReviewItemImpl(
	input: unknown,
): Promise<ActionResult> {
	return run(
		"review",
		decideAccessReviewSchema,
		input,
		(tx, ctx, d) => decideAccessReviewItem(tx, ctx, { ...d, now: new Date() }),
		() => [BASE],
	);
}

async function confirmAllOpenImpl(
	input: unknown,
): Promise<ActionResult<{ count: number }>> {
	return run(
		"review",
		accessReviewIdSchema,
		input,
		(tx, ctx, d) =>
			confirmAllOpen(tx, ctx, { reviewId: d.reviewId, now: new Date() }),
		(d) => [`${BASE}/${d.reviewId}`],
	);
}

async function closeAccessReviewImpl(
	input: unknown,
): Promise<ActionResult<{ tasks: number; testId: string | null }>> {
	return run(
		"update",
		accessReviewIdSchema,
		input,
		(tx, ctx, d) =>
			closeAccessReview(tx, ctx, { reviewId: d.reviewId, now: new Date() }),
		(d) => [BASE, `${BASE}/${d.reviewId}`, "/team/konten"],
	);
}

// Nachweis „Rezertifizierung von Zugriffsrechten“ aus der abgeschlossenen
// Prüfung vorbelegen; geprüft, unterschrieben und abgeschlossen wird er im
// Editor der Rohlinge
async function createAccessReviewEvidenceImpl(
	input: unknown,
): Promise<ActionResult<{ id: string }>> {
	const c = await requireOrg({ identity: ["read"], evidence: ["create"] });
	if (restrictedView(c)) return { ok: false, error: "forbidden" };
	const parsed = accessReviewIdSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const me = c.name || c.email;
	return mutateOrg<ActionResult<{ id: string }>>(toOrgCtx(c), async (tx) => {
		const detail = await accessReviewDetail(tx, c.orgId, parsed.data.reviewId, {
			view: "alle",
			userId: c.userId,
			q: null,
			limit: 50_000,
			offset: 0,
		});
		if (!detail || detail.review.status !== "closed")
			return { result: { ok: false, error: "notFound" }, audit: [] };
		const created = await createDraft(
			tx,
			{ orgId: c.orgId, userId: c.userId, name: me },
			{
				template: "rezertifizierung",
				title: `Rezertifizierung: ${detail.review.title}`.slice(0, 200),
				controlCodes: [IDENTITY_CHECKS.recert],
				content: reviewEvidenceContent({
					review: detail.review,
					progress: detail.progress,
					items: detail.items,
					me,
					today: berlinToday(),
				}),
			},
		);
		if (!created)
			return { result: { ok: false, error: "notFound" }, audit: [] };
		return {
			result: { ok: true, data: created },
			audit: {
				action: "evidence.draft_created",
				target: `evidence_draft:${created.id}`,
				after: {
					template: "rezertifizierung",
					accessReview: parsed.data.reviewId,
				},
			},
		};
	});
}

export const startAccessReviewAction = safeAction(
	"startAccessReview",
	startAccessReviewImpl,
);
export const decideAccessReviewItemAction = safeAction(
	"decideAccessReviewItem",
	decideAccessReviewItemImpl,
);
export const confirmAllOpenAction = safeAction(
	"confirmAllOpen",
	confirmAllOpenImpl,
);
export const closeAccessReviewAction = safeAction(
	"closeAccessReview",
	closeAccessReviewImpl,
);
export const createAccessReviewEvidence = safeAction(
	"createAccessReviewEvidence",
	createAccessReviewEvidenceImpl,
);
