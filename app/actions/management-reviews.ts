"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { managementReviews, tasks } from "@/db/schema";
import { safeAction } from "@/lib/actions/safe";
import type { AuditInput } from "@/lib/audit";
import { requireOrg, toOrgCtx } from "@/lib/auth/guards";
import { roleAllows } from "@/lib/auth/permissions";
import {
	applicableReviewInputs,
	reviewComplete,
} from "@/lib/compliance/catalog/management-review-inputs";
import {
	NC_DUE_DAYS,
	NC_EFFECTIVENESS_DAYS,
} from "@/lib/compliance/nonconformity";
import { createNonconformity } from "@/lib/compliance/nonconformity-service";
import { getOrgProfile } from "@/lib/compliance/queries";
import { insertResolution } from "@/lib/compliance/resolutions-service";
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

type ReviewOutcome = {
	status: string;
	tasks: number;
	resolutions: number;
	nonconformities: number;
};

function plusDays(days: number): string {
	return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}

// Status setzen; „done" nur mit allen anwendbaren Pflicht-Inputs. Ergebnisse
// der Bewertung werden zu Aufgaben, Beschlüssen (Register + Freigabe durch
// die Geschäftsleitung, Bezug auf die Bewertung) oder Abweichungen.
async function completeReviewImpl(
	input: unknown,
): Promise<ActionResult<ReviewOutcome>> {
	const c = await requireOrg({ management_review: ["update"] });
	const parsed = completeReviewSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const { reviewId, status, actions } = parsed.data;
	const res = await mutateOrg<ActionResult<ReviewOutcome>>(
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
			const canResolve = roleAllows(c.orgRole, { resolution: ["create"] });
			const canNc = roleAllows(c.orgRole, { nonconformity: ["create"] });
			if (
				(actions ?? []).some(
					(a) =>
						(a.kind === "resolution" && !canResolve) ||
						(a.kind === "nonconformity" && !canNc),
				)
			)
				return { result: { ok: false, error: "forbidden" }, audit: [] };
			const extraAudit: AuditInput[] = [];
			const counts = { tasks: 0, resolutions: 0, nonconformities: 0 };
			const heldAt = row.heldAt;
			for (const a of actions ?? []) {
				const assignee = a.assigneeUserId ?? row.ownerUserId ?? c.userId;
				if (a.kind === "resolution") {
					const r = await insertResolution(
						tx,
						{ orgId: c.orgId, userId: c.userId, name: c.name },
						{
							subject: a.title,
							decisionText: a.text?.trim() || a.title,
							body: "management",
							date: heldAt,
							linkedEntityType: "management_review",
							linkedEntityId: row.id,
							attendeeUserIds: row.attendeeUserIds,
							requestApproval: true,
						},
					);
					if (!r.ok)
						return { result: { ok: false, error: r.error }, audit: [] };
					extraAudit.push(r.audit);
					counts.resolutions += 1;
					continue;
				}
				if (a.kind === "nonconformity") {
					const nc = await createNonconformity(
						tx,
						{ orgId: c.orgId, userId: c.userId },
						{
							source: "management_review",
							sourceRefId: row.id,
							title: a.title,
							description: a.text?.trim() || null,
							rootCause: null,
							ownerUserId: assignee,
							dueAt: a.dueAt ?? plusDays(NC_DUE_DAYS),
							effectivenessCheckAt: plusDays(NC_EFFECTIVENESS_DAYS),
						},
					);
					extraAudit.push(nc.audit);
					counts.nonconformities += 1;
					continue;
				}
				await tx.insert(tasks).values({
					organizationId: c.orgId,
					title: a.title,
					description: a.text?.trim() || null,
					assigneeUserId: assignee,
					createdByUserId: c.userId,
					dueAt: a.dueAt ?? null,
					priority: "normal",
					entityType: "management_review",
					entityId: row.id,
					sourceKind: "review",
				});
				counts.tasks += 1;
				await notify(tx, {
					orgId: c.orgId,
					recipients: [assignee],
					actorUserId: c.userId,
					kind: "task_assigned",
					title: a.title,
					body: "Maßnahme aus der Managementbewertung",
					link: "/heute/aufgaben",
				});
			}
			await tx
				.update(managementReviews)
				.set({ status })
				.where(eq(managementReviews.id, row.id));
			return {
				result: { ok: true, data: { status, ...counts } },
				audit: [
					...extraAudit,
					{
						action: "management_review.status",
						target: `management_review:${row.id}`,
						before: { status: row.status },
						after: { status, ...counts },
					},
				],
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
