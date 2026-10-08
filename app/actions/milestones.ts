"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { controls, milestoneControls, milestones, tasks } from "@/db/schema";
import { safeAction } from "@/lib/actions/safe";
import type { AuditInput } from "@/lib/audit";
import { requireOrg, toOrgCtx } from "@/lib/auth/guards";
import { buildRoadmap } from "@/lib/compliance/catalog/roadmap";
import { mutateOrg, type OrgTx } from "@/lib/db/with-org";
import { notify } from "@/lib/notifications/notify";
import { type ActionResult, fromZod } from "@/lib/validation/common";
import {
	applyRoadmapSchema,
	milestoneSchema,
	milestoneTaskSchema,
	moveMilestoneSchema,
} from "@/lib/validation/roadmap";

const PATH = "/roadmap";

async function controlIdsByCode(
	tx: OrgTx,
	codes: readonly string[],
): Promise<Map<string, string>> {
	if (codes.length === 0) return new Map();
	const rows = await tx
		.select({ id: controls.id, code: controls.code })
		.from(controls)
		.where(inArray(controls.code, [...codes]));
	return new Map(rows.map((r) => [r.code, r.id]));
}

// Roadmap-Vorlage (Stufe 0–4) als Meilensteine anlegen — fehlende Codes nur.
async function applyRoadmapTemplateImpl(
	input: unknown,
): Promise<ActionResult<{ created: number }>> {
	const c = await requireOrg({ milestone: ["create"] });
	const parsed = applyRoadmapSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const { targetStage, startDate } = parsed.data;
	const start = startDate ? new Date(`${startDate}T00:00:00Z`) : new Date();
	const created = await mutateOrg(toOrgCtx(c), async (tx) => {
		const existing = await tx
			.select({ description: milestones.description, title: milestones.title })
			.from(milestones)
			.where(eq(milestones.organizationId, c.orgId));
		const titles = new Set(existing.map((m) => m.title));
		const plan = buildRoadmap(start, targetStage);
		const ids = await controlIdsByCode(
			tx,
			plan.flatMap((m) => m.controls),
		);
		let n = 0;
		const audits: AuditInput[] = [];
		for (const m of plan) {
			if (titles.has(m.title)) continue;
			const [row] = await tx
				.insert(milestones)
				.values({
					organizationId: c.orgId,
					title: m.title,
					description: `${m.code} · ${m.description}`,
					phase: m.phase,
					status: "todo",
					dueAt: m.dueAt,
					sortOrder: n * 10,
				})
				.returning({ id: milestones.id });
			if (!row) continue;
			for (const code of m.controls) {
				const controlId = ids.get(code);
				if (controlId)
					await tx
						.insert(milestoneControls)
						.values({ organizationId: c.orgId, milestoneId: row.id, controlId })
						.onConflictDoNothing();
			}
			n += 1;
			audits.push({
				action: "milestone.create",
				target: `milestone:${row.id}`,
				after: {
					title: m.title,
					phase: m.phase,
					dueAt: m.dueAt,
					via: "template",
				},
			});
		}
		audits.push({
			action: "roadmap.template_applied",
			target: `organization:${c.orgId}`,
			after: {
				targetStage,
				start: start.toISOString().slice(0, 10),
				created: n,
			},
		});
		return { result: n, audit: audits };
	});
	revalidatePath(PATH);
	return { ok: true, data: { created } };
}

async function upsertMilestoneImpl(
	input: unknown,
): Promise<ActionResult<{ id: string }>> {
	const c = await requireOrg({ milestone: ["create", "update"] });
	const parsed = milestoneSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const { id, controlCodes, ...d } = parsed.data;
	const res = await mutateOrg<ActionResult<{ id: string }>>(
		toOrgCtx(c),
		async (tx) => {
			let rowId: string;
			let before: typeof milestones.$inferSelect | undefined;
			if (id) {
				[before] = await tx
					.select()
					.from(milestones)
					.where(
						and(eq(milestones.id, id), eq(milestones.organizationId, c.orgId)),
					)
					.limit(1);
				if (!before)
					return { result: { ok: false, error: "notFound" }, audit: [] };
				await tx
					.update(milestones)
					.set({
						title: d.title,
						description: d.description ?? before.description,
						phase: d.phase === undefined ? before.phase : d.phase,
						dueAt: d.dueAt === undefined ? before.dueAt : d.dueAt,
						ownerUserId:
							d.ownerUserId === undefined ? before.ownerUserId : d.ownerUserId,
						assigneeUserId:
							d.assigneeUserId === undefined
								? before.assigneeUserId
								: d.assigneeUserId,
					})
					.where(eq(milestones.id, id));
				rowId = id;
			} else {
				const [row] = await tx
					.insert(milestones)
					.values({
						organizationId: c.orgId,
						title: d.title,
						description: d.description ?? null,
						phase: d.phase ?? null,
						dueAt: d.dueAt ?? null,
						ownerUserId: d.ownerUserId ?? c.userId,
						assigneeUserId: d.assigneeUserId ?? null,
						sortOrder: 9999,
					})
					.returning({ id: milestones.id });
				if (!row) throw new Error("insert failed");
				rowId = row.id;
			}
			if (controlCodes) {
				await tx
					.delete(milestoneControls)
					.where(eq(milestoneControls.milestoneId, rowId));
				const ids = await controlIdsByCode(tx, controlCodes);
				for (const controlId of ids.values())
					await tx
						.insert(milestoneControls)
						.values({ organizationId: c.orgId, milestoneId: rowId, controlId })
						.onConflictDoNothing();
			}
			if (d.assigneeUserId && d.assigneeUserId !== before?.assigneeUserId) {
				await notify(tx, {
					orgId: c.orgId,
					recipients: [d.assigneeUserId],
					actorUserId: c.userId,
					kind: "task_assigned",
					title: `Meilenstein: ${d.title}`,
					body: d.dueAt ? `Fällig ${d.dueAt}` : undefined,
					link: PATH,
				});
			}
			return {
				result: { ok: true, data: { id: rowId } },
				audit: {
					action: before ? "milestone.update" : "milestone.create",
					target: `milestone:${rowId}`,
					before: before
						? {
								title: before.title,
								dueAt: before.dueAt,
								assigneeUserId: before.assigneeUserId,
							}
						: undefined,
					after: {
						title: d.title,
						dueAt: d.dueAt ?? null,
						assigneeUserId: d.assigneeUserId ?? null,
					},
				},
			};
		},
	);
	revalidatePath(PATH);
	return res;
}

// Drag-and-drop: Status der Karte + Reihenfolge der Zielspalte.
async function moveMilestoneImpl(input: unknown): Promise<ActionResult> {
	const c = await requireOrg({ milestone: ["update"] });
	const parsed = moveMilestoneSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const { id, status, orderedIds } = parsed.data;
	const ok = await mutateOrg<boolean>(toOrgCtx(c), async (tx) => {
		const [row] = await tx
			.select({ status: milestones.status, title: milestones.title })
			.from(milestones)
			.where(and(eq(milestones.id, id), eq(milestones.organizationId, c.orgId)))
			.limit(1);
		if (!row) return { result: false, audit: [] };
		await tx.update(milestones).set({ status }).where(eq(milestones.id, id));
		// RLS begrenzt das Update auf eigene Zeilen; fremde IDs bleiben wirkungslos.
		for (const [idx, mid] of orderedIds.entries()) {
			await tx
				.update(milestones)
				.set({ sortOrder: idx * 10 })
				.where(
					and(eq(milestones.id, mid), eq(milestones.organizationId, c.orgId)),
				);
		}
		return {
			result: true,
			audit:
				row.status === status
					? []
					: {
							action: "milestone.status",
							target: `milestone:${id}`,
							before: { status: row.status },
							after: { status },
						},
		};
	});
	if (!ok) return { ok: false, error: "notFound" };
	revalidatePath(PATH);
	return { ok: true, data: undefined };
}

// Aufgabe aus Meilenstein (an Bearbeiter:in oder Verantwortliche:n).
async function createTaskFromMilestoneImpl(
	input: unknown,
): Promise<ActionResult<{ taskId: string }>> {
	const c = await requireOrg({ milestone: ["update"], task: ["create"] });
	const parsed = milestoneTaskSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const { id, assigneeUserId } = parsed.data;
	const res = await mutateOrg<ActionResult<{ taskId: string }>>(
		toOrgCtx(c),
		async (tx) => {
			const [m] = await tx
				.select()
				.from(milestones)
				.where(
					and(eq(milestones.id, id), eq(milestones.organizationId, c.orgId)),
				)
				.limit(1);
			if (!m) return { result: { ok: false, error: "notFound" }, audit: [] };
			const assignee =
				assigneeUserId ?? m.assigneeUserId ?? m.ownerUserId ?? c.userId;
			const [task] = await tx
				.insert(tasks)
				.values({
					organizationId: c.orgId,
					title: m.title,
					description: m.description,
					assigneeUserId: assignee,
					createdByUserId: c.userId,
					dueAt: m.dueAt,
					priority: "normal",
					entityType: "milestone",
					entityId: m.id,
					sourceKind: "manual",
				})
				.returning({ id: tasks.id });
			if (!task) throw new Error("insert failed");
			await notify(tx, {
				orgId: c.orgId,
				recipients: [assignee],
				actorUserId: c.userId,
				kind: "task_assigned",
				title: m.title,
				body: m.dueAt ? `Fällig ${m.dueAt}` : undefined,
				link: "/heute/aufgaben",
			});
			if (m.status === "todo")
				await tx
					.update(milestones)
					.set({ status: "doing" })
					.where(eq(milestones.id, m.id));
			return {
				result: { ok: true, data: { taskId: task.id } },
				audit: {
					action: "task.create",
					target: `task:${task.id}`,
					after: {
						title: m.title,
						assigneeUserId: assignee,
						milestoneId: m.id,
					},
				},
			};
		},
	);
	revalidatePath(PATH);
	revalidatePath("/heute");
	return res;
}

// Sicherheitsnetz: unerwartete Ausnahmen → { ok: false, error, ref } + Log
// statt Error-Boundary (lib/actions/safe.ts).
export const applyRoadmapTemplate = safeAction(
	"applyRoadmapTemplate",
	applyRoadmapTemplateImpl,
);
export const upsertMilestone = safeAction(
	"upsertMilestone",
	upsertMilestoneImpl,
);
export const moveMilestone = safeAction("moveMilestone", moveMilestoneImpl);
export const createTaskFromMilestone = safeAction(
	"createTaskFromMilestone",
	createTaskFromMilestoneImpl,
);
