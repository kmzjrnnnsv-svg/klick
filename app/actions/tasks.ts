"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { tasks } from "@/db/schema";
import { requireOrg, toOrgCtx } from "@/lib/auth/guards";
import { mutateOrg } from "@/lib/db/with-org";
import { canTransition } from "@/lib/entities/status-machine";
import { TASK_STATUS } from "@/lib/entities/task";
import { notify } from "@/lib/notifications/notify";
import { type ActionResult, fromZod } from "@/lib/validation/common";
import { createTaskSchema, setTaskStatusSchema } from "@/lib/validation/grc";

export async function createTask(
	input: unknown,
): Promise<ActionResult<{ id: string }>> {
	const c = await requireOrg({ task: ["create"] });
	const parsed = createTaskSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const d = parsed.data;
	const id = await mutateOrg(toOrgCtx(c), async (tx) => {
		const [row] = await tx
			.insert(tasks)
			.values({
				organizationId: c.orgId,
				title: d.title,
				description: d.description ?? null,
				assigneeUserId: d.assigneeUserId ?? c.userId,
				createdByUserId: c.userId,
				dueAt: d.dueAt ?? null,
				priority: d.priority,
				entityType: d.entityType ?? null,
				entityId: d.entityId ?? null,
				sourceKind: d.sourceKind,
			})
			.returning({ id: tasks.id });
		if (!row) throw new Error("insert failed");
		await notify(tx, {
			orgId: c.orgId,
			recipients: [d.assigneeUserId],
			actorUserId: c.userId,
			kind: "task_assigned",
			title: `Neue Aufgabe: ${d.title}`,
			link: "/heute/aufgaben",
		});
		return {
			result: row.id,
			audit: {
				action: "task.create",
				target: `task:${row.id}`,
				after: {
					title: d.title,
					assigneeUserId: d.assigneeUserId ?? c.userId,
					dueAt: d.dueAt ?? null,
					entity: d.entityType ? `${d.entityType}:${d.entityId}` : null,
				},
			},
		};
	});
	revalidatePath("/heute", "layout");
	return { ok: true, data: { id } };
}

export async function setTaskStatus(input: unknown): Promise<ActionResult> {
	const c = await requireOrg({ task: ["update"] });
	const parsed = setTaskStatusSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const { taskId, status, note } = parsed.data;
	const res = await mutateOrg(toOrgCtx(c), async (tx) => {
		const [row] = await tx
			.select()
			.from(tasks)
			.where(and(eq(tasks.id, taskId), eq(tasks.organizationId, c.orgId)))
			.limit(1);
		if (!row) return { result: "notFound" as const, audit: [] };
		const check = canTransition(TASK_STATUS, row.status, status, {
			hasNote: Boolean(note && note.trim().length >= 3),
		});
		if (!check.ok)
			return { result: `transition_${check.reason}` as const, audit: [] };
		await tx
			.update(tasks)
			.set({
				status,
				completedAt: status === "done" ? new Date() : null,
				description: note?.trim()
					? `${row.description ?? ""}\n\n${note.trim()}`.trim()
					: row.description,
			})
			.where(eq(tasks.id, taskId));
		await notify(tx, {
			orgId: c.orgId,
			recipients: [row.createdByUserId, row.assigneeUserId],
			actorUserId: c.userId,
			kind: "entity_changed",
			title: `Aufgabe „${row.title}": ${status}`,
			link: "/heute/aufgaben",
		});
		return {
			result: "ok" as const,
			audit: {
				action: "task.status",
				target: `task:${taskId}`,
				before: { status: row.status },
				after: { status, title: row.title },
			},
		};
	});
	if (res !== "ok") return { ok: false, error: res };
	revalidatePath("/heute", "layout");
	return { ok: true, data: undefined };
}
