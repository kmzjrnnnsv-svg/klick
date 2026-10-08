"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { nonconformities, tasks } from "@/db/schema";
import { safeAction } from "@/lib/actions/safe";
import { requireOrg, toOrgCtx } from "@/lib/auth/guards";
import { roleAllows } from "@/lib/auth/permissions";
import {
	NC_DUE_DAYS,
	NC_EFFECTIVENESS_DAYS,
} from "@/lib/compliance/nonconformity";
import { createNonconformity } from "@/lib/compliance/nonconformity-service";
import { mutateOrg } from "@/lib/db/with-org";
import { NONCONFORMITY_STATUS } from "@/lib/entities/nonconformity";
import { canTransition } from "@/lib/entities/status-machine";
import { notify } from "@/lib/notifications/notify";
import { type ActionResult, fromZod } from "@/lib/validation/common";
import {
	effectivenessSchema,
	nonconformitySchema,
	setNonconformityStatusSchema,
} from "@/lib/validation/governance";

const PATH = "/abweichungen";

function plusDays(days: number): string {
	return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}

async function upsertNonconformityImpl(
	input: unknown,
): Promise<ActionResult<{ id: string; code: string }>> {
	const c = await requireOrg({ nonconformity: ["create", "update"] });
	const parsed = nonconformitySchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const { id, ...d } = parsed.data;
	const res = await mutateOrg<{ id: string; code: string } | null>(
		toOrgCtx(c),
		async (tx) => {
			if (id) {
				const [before] = await tx
					.select()
					.from(nonconformities)
					.where(
						and(
							eq(nonconformities.id, id),
							eq(nonconformities.organizationId, c.orgId),
						),
					)
					.limit(1);
				if (!before) return { result: null, audit: [] };
				const set = {
					title: d.title,
					description: d.description ?? null,
					rootCause: d.rootCause ?? null,
					correction: d.correction ?? null,
					correctiveAction: d.correctiveAction ?? null,
					ownerUserId: d.ownerUserId ?? before.ownerUserId,
					assigneeUserId: d.assigneeUserId ?? before.assigneeUserId,
					dueAt: d.dueAt ?? before.dueAt,
					effectivenessCheckAt:
						d.effectivenessCheckAt ?? before.effectivenessCheckAt,
				};
				await tx
					.update(nonconformities)
					.set(set)
					.where(eq(nonconformities.id, id));
				if (
					set.assigneeUserId &&
					set.assigneeUserId !== before.assigneeUserId
				) {
					await notify(tx, {
						orgId: c.orgId,
						recipients: [set.assigneeUserId],
						actorUserId: c.userId,
						kind: "task_assigned",
						title: `${before.code}: ${d.title}`,
						link: `${PATH}/${id}`,
					});
				}
				return {
					result: { id, code: before.code },
					audit: {
						action: "nonconformity.update",
						target: `nonconformity:${id}`,
						before: {
							title: before.title,
							rootCause: before.rootCause,
							correctiveAction: before.correctiveAction,
							dueAt: before.dueAt,
							ownerUserId: before.ownerUserId,
						},
						after: {
							title: set.title,
							rootCause: set.rootCause,
							correctiveAction: set.correctiveAction,
							dueAt: set.dueAt,
							ownerUserId: set.ownerUserId,
						},
					},
				};
			}
			const nc = await createNonconformity(
				tx,
				{ orgId: c.orgId, userId: c.userId },
				{
					source: d.source,
					sourceRefId: null,
					title: d.title,
					description: d.description ?? null,
					rootCause: d.rootCause ?? null,
					ownerUserId: d.ownerUserId ?? c.userId,
					dueAt: d.dueAt ?? plusDays(NC_DUE_DAYS),
					effectivenessCheckAt:
						d.effectivenessCheckAt ?? plusDays(NC_EFFECTIVENESS_DAYS),
				},
			);
			if (d.correction || d.correctiveAction)
				await tx
					.update(nonconformities)
					.set({
						correction: d.correction ?? null,
						correctiveAction: d.correctiveAction ?? null,
					})
					.where(eq(nonconformities.id, nc.id));
			return { result: { id: nc.id, code: nc.code }, audit: nc.audit };
		},
	);
	revalidatePath(PATH, "layout");
	return res ? { ok: true, data: res } : { ok: false, error: "notFound" };
}

async function setNonconformityStatusImpl(
	input: unknown,
): Promise<ActionResult<{ status: string; approvalRequested: boolean }>> {
	const c = await requireOrg({ nonconformity: ["update"] });
	const parsed = setNonconformityStatusSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const { nonconformityId, status, note } = parsed.data;
	if (
		status === "closed" &&
		!roleAllows(c.orgRole, { nonconformity: ["close"] })
	)
		return { ok: false, error: "forbidden" };
	const res = await mutateOrg<
		ActionResult<{ status: string; approvalRequested: boolean }>
	>(toOrgCtx(c), async (tx) => {
		const [row] = await tx
			.select()
			.from(nonconformities)
			.where(
				and(
					eq(nonconformities.id, nonconformityId),
					eq(nonconformities.organizationId, c.orgId),
				),
			)
			.limit(1);
		if (!row) return { result: { ok: false, error: "notFound" }, audit: [] };
		const check = canTransition(NONCONFORMITY_STATUS, row.status, status, {
			hasNote: Boolean(note && note.trim().length >= 3),
			approvalsSatisfied: true,
		});
		if (!check.ok)
			return {
				result: { ok: false, error: `transition_${check.reason}` },
				audit: [],
			};
		// Abschluss nur mit positiver Wirksamkeitsprüfung (ISO 10.2 d)
		if (status === "closed" && row.effectivenessResult !== "effective")
			return {
				result: { ok: false, error: "effectivenessRequired" },
				audit: [],
			};
		if (status === "verified" && !row.correctiveAction)
			return {
				result: { ok: false, error: "correctiveActionRequired" },
				audit: [],
			};
		await tx
			.update(nonconformities)
			.set({ status })
			.where(eq(nonconformities.id, row.id));
		if (status === "closed") {
			await tx
				.update(tasks)
				.set({ status: "done", completedAt: new Date() })
				.where(
					and(
						eq(tasks.entityType, "nonconformity"),
						eq(tasks.entityId, row.id),
					),
				);
		}
		return {
			result: { ok: true, data: { status, approvalRequested: false } },
			audit: {
				action: "nonconformity.status",
				target: `nonconformity:${row.id}`,
				before: { status: row.status },
				after: { status, note: note ?? null },
			},
		};
	});
	revalidatePath(PATH, "layout");
	return res;
}

async function recordEffectivenessImpl(input: unknown): Promise<ActionResult> {
	const c = await requireOrg({ nonconformity: ["update"] });
	const parsed = effectivenessSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const { nonconformityId, result, note } = parsed.data;
	const ok = await mutateOrg<boolean>(toOrgCtx(c), async (tx) => {
		const [row] = await tx
			.select()
			.from(nonconformities)
			.where(
				and(
					eq(nonconformities.id, nonconformityId),
					eq(nonconformities.organizationId, c.orgId),
				),
			)
			.limit(1);
		if (!row) return { result: false, audit: [] };
		await tx
			.update(nonconformities)
			.set({
				effectivenessResult: result,
				effectivenessCheckAt: new Date().toISOString().slice(0, 10),
				// nicht wirksam → zurück in Bearbeitung mit neuer Frist
				status: result === "ineffective" ? "in_progress" : row.status,
				dueAt: result === "ineffective" ? plusDays(NC_DUE_DAYS) : row.dueAt,
			})
			.where(eq(nonconformities.id, row.id));
		if (result === "ineffective") {
			await tx.insert(tasks).values({
				organizationId: c.orgId,
				title: `${row.code}: Korrekturmaßnahme nicht wirksam — nachschärfen`,
				description: note ?? null,
				assigneeUserId: row.assigneeUserId ?? row.ownerUserId,
				createdByUserId: c.userId,
				dueAt: plusDays(NC_DUE_DAYS),
				priority: "high",
				entityType: "nonconformity",
				entityId: row.id,
				sourceKind: "remediation",
			});
		}
		return {
			result: true,
			audit: {
				action: "nonconformity.effectiveness",
				target: `nonconformity:${row.id}`,
				before: { effectivenessResult: row.effectivenessResult },
				after: { effectivenessResult: result, note: note ?? null },
			},
		};
	});
	revalidatePath(PATH, "layout");
	return ok ? { ok: true, data: undefined } : { ok: false, error: "notFound" };
}

// Sicherheitsnetz: unerwartete Ausnahmen → { ok: false, error, ref } + Log
// statt Error-Boundary (lib/actions/safe.ts).
export const upsertNonconformity = safeAction(
	"upsertNonconformity",
	upsertNonconformityImpl,
);
export const setNonconformityStatus = safeAction(
	"setNonconformityStatus",
	setNonconformityStatusImpl,
);
export const recordEffectiveness = safeAction(
	"recordEffectiveness",
	recordEffectivenessImpl,
);
