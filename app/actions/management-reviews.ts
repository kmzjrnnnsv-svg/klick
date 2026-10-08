"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { managementReviews, tasks } from "@/db/schema";
import { safeAction } from "@/lib/actions/safe";
import { requireOrg, toOrgCtx } from "@/lib/auth/guards";
import {
	applicableReviewInputs,
	reviewComplete,
} from "@/lib/compliance/catalog/management-review-inputs";
import { getOrgProfile } from "@/lib/compliance/queries";
import { mutateOrg } from "@/lib/db/with-org";
import { notify } from "@/lib/notifications/notify";
import { type ActionResult, fromZod } from "@/lib/validation/common";
import {
	completeReviewSchema,
	managementReviewSchema,
	reviewInputsSchema,
} from "@/lib/validation/governance";

const PATH = "/managementbewertung";

async function upsertManagementReviewImpl(
	input: unknown,
): Promise<ActionResult<{ id: string }>> {
	const c = await requireOrg({ management_review: ["create", "update"] });
	const parsed = managementReviewSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const { id, ...d } = parsed.data;
	const res = await mutateOrg<string | null>(toOrgCtx(c), async (tx) => {
		const values = {
			heldAt: d.heldAt,
			attendeeUserIds: d.attendeeUserIds ?? [],
			summary: d.summary ?? null,
			decisions: d.decisions ?? null,
			minutesEvidenceId: d.minutesEvidenceId ?? null,
		};
		if (id) {
			const [before] = await tx
				.select()
				.from(managementReviews)
				.where(
					and(
						eq(managementReviews.id, id),
						eq(managementReviews.organizationId, c.orgId),
					),
				)
				.limit(1);
			if (!before) return { result: null, audit: [] };
			await tx
				.update(managementReviews)
				.set({ ...values, ownerUserId: d.ownerUserId ?? before.ownerUserId })
				.where(eq(managementReviews.id, id));
			return {
				result: id,
				audit: {
					action: "management_review.update",
					target: `management_review:${id}`,
					before: { heldAt: before.heldAt, status: before.status },
					after: { heldAt: d.heldAt, attendees: values.attendeeUserIds.length },
				},
			};
		}
		const [row] = await tx
			.insert(managementReviews)
			.values({
				organizationId: c.orgId,
				...values,
				ownerUserId: d.ownerUserId ?? c.userId,
			})
			.returning({ id: managementReviews.id });
		if (!row) throw new Error("insert failed");
		return {
			result: row.id,
			audit: {
				action: "management_review.create",
				target: `management_review:${row.id}`,
				after: { heldAt: d.heldAt },
			},
		};
	});
	revalidatePath(PATH);
	return res
		? { ok: true, data: { id: res } }
		: { ok: false, error: "notFound" };
}

async function saveReviewInputsImpl(input: unknown): Promise<ActionResult> {
	const c = await requireOrg({ management_review: ["update"] });
	const parsed = reviewInputsSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const { reviewId, inputs } = parsed.data;
	const ok = await mutateOrg<boolean>(toOrgCtx(c), async (tx) => {
		const [before] = await tx
			.select({ inputs: managementReviews.inputs })
			.from(managementReviews)
			.where(
				and(
					eq(managementReviews.id, reviewId),
					eq(managementReviews.organizationId, c.orgId),
				),
			)
			.limit(1);
		if (!before) return { result: false, audit: [] };
		await tx
			.update(managementReviews)
			.set({ inputs })
			.where(eq(managementReviews.id, reviewId));
		return {
			result: true,
			audit: {
				action: "management_review.inputs",
				target: `management_review:${reviewId}`,
				before: {
					done: Object.values(before.inputs).filter((x) => x.done).length,
				},
				after: { done: Object.values(inputs).filter((x) => x.done).length },
			},
		};
	});
	revalidatePath(PATH);
	return ok ? { ok: true, data: undefined } : { ok: false, error: "notFound" };
}

// Status setzen; „done" nur mit allen anwendbaren Pflicht-Inputs. Beschlüsse
// der Bewertung werden als Aufgaben vergeben.
async function completeReviewImpl(
	input: unknown,
): Promise<ActionResult<{ status: string; tasks: number }>> {
	const c = await requireOrg({ management_review: ["update"] });
	const parsed = completeReviewSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const { reviewId, status, actions } = parsed.data;
	const res = await mutateOrg<ActionResult<{ status: string; tasks: number }>>(
		toOrgCtx(c),
		async (tx) => {
			const [row] = await tx
				.select()
				.from(managementReviews)
				.where(
					and(
						eq(managementReviews.id, reviewId),
						eq(managementReviews.organizationId, c.orgId),
					),
				)
				.limit(1);
			if (!row) return { result: { ok: false, error: "notFound" }, audit: [] };
			if (status === "done") {
				const profile = await getOrgProfile(tx, c.orgId);
				const applicable = applicableReviewInputs(profile?.frameworks ?? []);
				const check = reviewComplete(row.inputs, applicable);
				if (!check.complete)
					return {
						result: {
							ok: false,
							error: `inputs_missing:${check.missing.join(",")}`,
						},
						audit: [],
					};
			}
			let created = 0;
			for (const a of actions ?? []) {
				const assignee = a.assigneeUserId ?? row.ownerUserId ?? c.userId;
				await tx.insert(tasks).values({
					organizationId: c.orgId,
					title: a.title,
					assigneeUserId: assignee,
					createdByUserId: c.userId,
					dueAt: a.dueAt ?? null,
					priority: "normal",
					entityType: "management_review",
					entityId: row.id,
					sourceKind: "review",
				});
				created += 1;
				await notify(tx, {
					orgId: c.orgId,
					recipients: [assignee],
					actorUserId: c.userId,
					kind: "task_assigned",
					title: a.title,
					body: "Beschluss aus der Managementbewertung",
					link: "/heute/aufgaben",
				});
			}
			await tx
				.update(managementReviews)
				.set({ status })
				.where(eq(managementReviews.id, row.id));
			return {
				result: { ok: true, data: { status, tasks: created } },
				audit: {
					action: "management_review.status",
					target: `management_review:${row.id}`,
					before: { status: row.status },
					after: { status, tasks: created },
				},
			};
		},
	);
	revalidatePath(PATH);
	return res;
}

// Sicherheitsnetz: unerwartete Ausnahmen → { ok: false, error, ref } + Log
// statt Error-Boundary (lib/actions/safe.ts).
export const upsertManagementReview = safeAction(
	"upsertManagementReview",
	upsertManagementReviewImpl,
);
export const saveReviewInputs = safeAction(
	"saveReviewInputs",
	saveReviewInputsImpl,
);
export const completeReview = safeAction("completeReview", completeReviewImpl);
