"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { member } from "@/db/auth-schema";
import { trainingAssignments, trainingRequirements } from "@/db/schema";
import { safeAction } from "@/lib/actions/safe";
import { requireOrg, toOrgCtx } from "@/lib/auth/guards";
import { mutateOrg } from "@/lib/db/with-org";
import { notify } from "@/lib/notifications/notify";
import { completeAssignments } from "@/lib/trainings/assignments";
import { type ActionResult, fromZod } from "@/lib/validation/common";
import { deleteByIdSchema } from "@/lib/validation/governance";
import {
	assignTrainingSchema,
	completeTrainingSchema,
	trainingRequirementSchema,
} from "@/lib/validation/registers";

// Schulungen (ISO 27001 7.2/7.3, DORA Art. 13(6), GwG § 6 Abs. 2 Nr. 6):
// Pflichtschulungen pflegen (inkl. Kurs-Link), Personen gezielt zuweisen,
// Abschluss selbst bestätigen. Rechte wie „Schulung erfassen“ (task:create);
// den eigenen Abschluss darf jedes Mitglied bestätigen.

const PATH = "/schulungen";

function today(): string {
	return new Date().toISOString().slice(0, 10);
}

function codeFrom(title: string): string {
	const base = title
		.normalize("NFKD")
		.replace(/[̀-ͯ]/g, "")
		.toUpperCase()
		.replace(/[^A-Z0-9]+/g, "-")
		.replace(/^-|-$/g, "")
		.slice(0, 24);
	return base || "SCHULUNG";
}

async function upsertTrainingRequirementImpl(
	input: unknown,
): Promise<ActionResult<{ id: string }>> {
	const c = await requireOrg({ task: ["create"] });
	const parsed = trainingRequirementSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const { id, ...d } = parsed.data;
	const values = {
		title: d.title,
		description: d.description ?? null,
		courseUrl: d.courseUrl ?? null,
		frequencyMonths: d.frequencyMonths,
		function: d.function ?? null,
		orgRole: d.orgRole ?? null,
		legalBasis: d.legalBasis ?? null,
	};
	const res = await mutateOrg<string | null>(toOrgCtx(c), async (tx) => {
		if (id) {
			const [before] = await tx
				.select()
				.from(trainingRequirements)
				.where(
					and(
						eq(trainingRequirements.id, id),
						eq(trainingRequirements.organizationId, c.orgId),
					),
				)
				.limit(1);
			if (!before) return { result: null, audit: [] };
			await tx
				.update(trainingRequirements)
				.set(values)
				.where(eq(trainingRequirements.id, id));
			return {
				result: id,
				audit: {
					action: "training.requirement_update",
					target: `training_requirement:${id}`,
					before: {
						title: before.title,
						courseUrl: before.courseUrl,
						frequencyMonths: before.frequencyMonths,
						function: before.function,
						orgRole: before.orgRole,
					},
					after: values,
				},
			};
		}
		const taken = new Set(
			(
				await tx
					.select({ code: trainingRequirements.code })
					.from(trainingRequirements)
					.where(eq(trainingRequirements.organizationId, c.orgId))
			).map((r) => r.code),
		);
		const base = codeFrom(d.title);
		let code = base;
		for (let i = 2; taken.has(code); i++) code = `${base}-${i}`;
		const [row] = await tx
			.insert(trainingRequirements)
			.values({ organizationId: c.orgId, code, ...values })
			.returning({ id: trainingRequirements.id });
		if (!row) throw new Error("insert failed");
		return {
			result: row.id,
			audit: {
				action: "training.requirement_create",
				target: `training_requirement:${row.id}`,
				after: { code, ...values },
			},
		};
	});
	revalidatePath(PATH);
	return res
		? { ok: true, data: { id: res } }
		: { ok: false, error: "notFound" };
}

// Gezielt zuweisen: je Person eine offene Zuweisung (vorhandene offene
// Zuweisungen bekommen die neue Frist, keine Dubletten).
async function assignTrainingImpl(
	input: unknown,
): Promise<ActionResult<{ assigned: number }>> {
	const c = await requireOrg({ task: ["create"] });
	const parsed = assignTrainingSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const d = parsed.data;
	const res = await mutateOrg<number | null>(toOrgCtx(c), async (tx) => {
		const [req] = await tx
			.select()
			.from(trainingRequirements)
			.where(
				and(
					eq(trainingRequirements.id, d.requirementId),
					eq(trainingRequirements.organizationId, c.orgId),
				),
			)
			.limit(1);
		if (!req) return { result: null, audit: [] };
		// Nur Mitglieder dieser Organisation (member hat kein RLS → explizit filtern).
		const members = new Set(
			(
				await tx
					.select({ userId: member.userId })
					.from(member)
					.where(
						and(
							eq(member.organizationId, c.orgId),
							inArray(member.userId, d.userIds),
						),
					)
			).map((m) => m.userId),
		);
		const userIds = d.userIds.filter((u) => members.has(u));
		const open = await tx
			.select({
				id: trainingAssignments.id,
				userId: trainingAssignments.userId,
			})
			.from(trainingAssignments)
			.where(
				and(
					eq(trainingAssignments.organizationId, c.orgId),
					eq(trainingAssignments.requirementId, req.id),
					inArray(trainingAssignments.status, ["due", "overdue"]),
				),
			);
		const openByUser = new Map(open.map((o) => [o.userId, o.id]));
		let assigned = 0;
		for (const userId of userIds) {
			const existing = openByUser.get(userId);
			if (existing) {
				await tx
					.update(trainingAssignments)
					.set({ dueAt: d.dueAt, status: "due", assignedByUserId: c.userId })
					.where(eq(trainingAssignments.id, existing));
			} else {
				await tx.insert(trainingAssignments).values({
					organizationId: c.orgId,
					requirementId: req.id,
					userId,
					dueAt: d.dueAt,
					status: "due",
					assignedByUserId: c.userId,
				});
			}
			assigned += 1;
		}
		await notify(tx, {
			orgId: c.orgId,
			recipients: userIds,
			actorUserId: c.userId,
			kind: "task_assigned",
			title: `Schulung zugewiesen: ${req.title}`,
			body: `Fällig bis ${d.dueAt}`,
			link: `${PATH}?tab=meine`,
		});
		return {
			result: assigned,
			audit: {
				action: "training.assign",
				target: `training_requirement:${req.id}`,
				after: { userIds, dueAt: d.dueAt },
			},
		};
	});
	revalidatePath(PATH);
	revalidatePath("/heute");
	return res === null
		? { ok: false, error: "notFound" }
		: { ok: true, data: { assigned: res } };
}

// Selbstbestätigung: nur die eigene, offene Zuweisung. Legt den Folgezyklus an.
async function completeMyTrainingImpl(
	input: unknown,
): Promise<ActionResult<{ nextDueAt: string | null }>> {
	const c = await requireOrg();
	const parsed = completeTrainingSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const d = parsed.data;
	const res = await mutateOrg<ActionResult<{ nextDueAt: string | null }>>(
		toOrgCtx(c),
		async (tx) => {
			const [row] = await tx
				.select({ a: trainingAssignments, req: trainingRequirements })
				.from(trainingAssignments)
				.innerJoin(
					trainingRequirements,
					eq(trainingRequirements.id, trainingAssignments.requirementId),
				)
				.where(
					and(
						eq(trainingAssignments.id, d.assignmentId),
						eq(trainingAssignments.organizationId, c.orgId),
					),
				)
				.limit(1);
			if (!row) return { result: { ok: false, error: "notFound" }, audit: [] };
			if (row.a.userId !== c.userId)
				return { result: { ok: false, error: "forbidden" }, audit: [] };
			if (row.a.status === "done")
				return { result: { ok: false, error: "already_done" }, audit: [] };
			const completedAt = today();
			await completeAssignments(tx, c.orgId, row.req, [c.userId], completedAt, {
				note: d.note ?? null,
			});
			const [next] = await tx
				.select({ dueAt: trainingAssignments.dueAt })
				.from(trainingAssignments)
				.where(
					and(
						eq(trainingAssignments.requirementId, row.req.id),
						eq(trainingAssignments.userId, c.userId),
						eq(trainingAssignments.status, "due"),
					),
				)
				.limit(1);
			return {
				result: { ok: true, data: { nextDueAt: next?.dueAt ?? null } },
				audit: {
					action: "training.self_completed",
					target: `training_assignment:${row.a.id}`,
					before: { status: row.a.status, dueAt: row.a.dueAt },
					after: {
						status: "done",
						completedAt,
						requirement: row.req.code,
						note: d.note ? "provided" : null,
					},
				},
			};
		},
	);
	revalidatePath(PATH);
	revalidatePath("/heute");
	return res;
}

async function unassignTrainingImpl(input: unknown): Promise<ActionResult> {
	const c = await requireOrg({ task: ["create"] });
	const parsed = deleteByIdSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const ok = await mutateOrg<boolean>(toOrgCtx(c), async (tx) => {
		const [row] = await tx
			.select()
			.from(trainingAssignments)
			.where(
				and(
					eq(trainingAssignments.id, parsed.data.id),
					eq(trainingAssignments.organizationId, c.orgId),
				),
			)
			.limit(1);
		if (!row || row.status === "done") return { result: false, audit: [] };
		await tx
			.delete(trainingAssignments)
			.where(eq(trainingAssignments.id, row.id));
		return {
			result: true,
			audit: {
				action: "training.unassign",
				target: `training_assignment:${row.id}`,
				before: {
					userId: row.userId,
					requirementId: row.requirementId,
					dueAt: row.dueAt,
				},
			},
		};
	});
	revalidatePath(PATH);
	return ok ? { ok: true, data: undefined } : { ok: false, error: "notFound" };
}

// Sicherheitsnetz: unerwartete Ausnahmen → { ok: false, error, ref } + Log
// statt Error-Boundary (lib/actions/safe.ts).
export const upsertTrainingRequirement = safeAction(
	"upsertTrainingRequirement",
	upsertTrainingRequirementImpl,
);
export const assignTraining = safeAction("assignTraining", assignTrainingImpl);
export const completeMyTraining = safeAction(
	"completeMyTraining",
	completeMyTrainingImpl,
);
export const unassignTraining = safeAction(
	"unassignTraining",
	unassignTrainingImpl,
);
