"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { assets, changeRequests, processes, risks, tasks } from "@/db/schema";
import { safeAction } from "@/lib/actions/safe";
import { GateBlocked } from "@/lib/approvals/gate-error";
import { gateApproval, withdrawOpenRequests } from "@/lib/approvals/service";
import { requireOrg, toOrgCtx } from "@/lib/auth/guards";
import { nextChangeCode } from "@/lib/compliance/change-requests";
import { mutateOrg } from "@/lib/db/with-org";
import { changeIdSchema, createChangeSchema } from "@/lib/validation/changes";
import { type ActionResult, fromZod } from "@/lib/validation/common";

const PATH = "/aenderungen";

// Neues Produkt, neuer Markt oder Vertriebsweg, wesentliche IT-Änderung
// (MaRisk AT 8): Antrag + Aufgabe für die Umsetzung; die Aufgabe ist
// blockiert, bis die Freigabe (change.request) durch ist.
async function createChangeRequestImpl(
	input: unknown,
): Promise<ActionResult<{ id: string; code: string; pending: boolean }>> {
	const c = await requireOrg({ task: ["create"] });
	const parsed = createChangeSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const d = parsed.data;
	try {
		const out = await mutateOrg<
			ActionResult<{ id: string; code: string; pending: boolean }>
		>(toOrgCtx(c), async (tx) => {
			// Bezüge nur aus der eigenen Org (RLS) — fremde IDs fallen heraus
			const [procs, ass, risk] = await Promise.all([
				d.processIds.length
					? tx
							.select({ id: processes.id })
							.from(processes)
							.where(
								and(
									eq(processes.organizationId, c.orgId),
									inArray(processes.id, d.processIds),
								),
							)
					: [],
				d.assetIds.length
					? tx
							.select({ id: assets.id })
							.from(assets)
							.where(
								and(
									eq(assets.organizationId, c.orgId),
									inArray(assets.id, d.assetIds),
								),
							)
					: [],
				d.riskId
					? tx
							.select({ id: risks.id })
							.from(risks)
							.where(
								and(eq(risks.organizationId, c.orgId), eq(risks.id, d.riskId)),
							)
					: [],
			]);
			if (
				procs.length !== d.processIds.length ||
				ass.length !== d.assetIds.length ||
				(d.riskId && risk.length === 0)
			)
				return { result: { ok: false, error: "notFound" }, audit: [] };
			const codes = await tx
				.select({ code: changeRequests.code })
				.from(changeRequests)
				.where(eq(changeRequests.organizationId, c.orgId));
			const code = nextChangeCode(codes.map((r) => r.code));
			const id = crypto.randomUUID();
			const [task] = await tx
				.insert(tasks)
				.values({
					organizationId: c.orgId,
					title: `${code}: ${d.title}`,
					description: d.description ?? null,
					assigneeUserId: d.assigneeUserId ?? c.userId,
					createdByUserId: c.userId,
					status: "blocked",
					entityType: "change_request",
					entityId: id,
					sourceKind: "change",
				})
				.returning({ id: tasks.id });
			await tx.insert(changeRequests).values({
				id,
				organizationId: c.orgId,
				code,
				title: d.title,
				kind: d.kind,
				description: d.description ?? null,
				processIds: d.processIds,
				assetIds: d.assetIds,
				riskId: d.riskId ?? null,
				taskId: task?.id ?? null,
				requestedByUserId: c.userId,
			});
			const gate = await gateApproval(
				tx,
				{ orgId: c.orgId, userId: c.userId, name: c.name },
				{
					trigger: "change.request",
					entityType: "change_request",
					entityId: id,
					entityOwnerUserId: c.userId,
					title: `${code} ${d.title}`,
					link: PATH,
					facts: { changeKind: d.kind },
				},
			);
			if (gate.status === "error")
				throw new GateBlocked(gate.error, gate.warnings);
			const pending = gate.status === "pending";
			if (!pending) {
				await tx
					.update(changeRequests)
					.set({ status: "approved", decidedAt: new Date() })
					.where(eq(changeRequests.id, id));
				if (task)
					await tx
						.update(tasks)
						.set({ status: "todo" })
						.where(eq(tasks.id, task.id));
			}
			return {
				result: { ok: true, data: { id, code, pending } },
				audit: {
					action: "change_request.create",
					target: `change_request:${id}`,
					after: {
						code,
						title: d.title,
						kind: d.kind,
						processIds: d.processIds,
						assetIds: d.assetIds,
						riskId: d.riskId ?? null,
						taskId: task?.id ?? null,
						status: pending ? "pending" : "approved",
					},
				},
			};
		});
		revalidatePath(PATH);
		return out;
	} catch (e) {
		if (e instanceof GateBlocked) return { ok: false, error: e.code };
		throw e;
	}
}

// Zurückziehen, solange die Freigabe läuft: Antrag und Aufgabe enden
async function withdrawChangeRequestImpl(
	input: unknown,
): Promise<ActionResult> {
	const c = await requireOrg({ task: ["create"] });
	const parsed = changeIdSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const res = await mutateOrg<ActionResult>(toOrgCtx(c), async (tx) => {
		const [row] = await tx
			.update(changeRequests)
			.set({ status: "withdrawn", decidedAt: new Date() })
			.where(
				and(
					eq(changeRequests.id, parsed.data.id),
					eq(changeRequests.organizationId, c.orgId),
					eq(changeRequests.status, "pending"),
				),
			)
			.returning();
		if (!row) return { result: { ok: false, error: "notFound" }, audit: [] };
		await withdrawOpenRequests(tx, c.orgId, "change_request", row.id);
		if (row.taskId)
			await tx
				.update(tasks)
				.set({ status: "done", completedAt: new Date() })
				.where(eq(tasks.id, row.taskId));
		return {
			result: { ok: true, data: undefined },
			audit: {
				action: "change_request.withdrawn",
				target: `change_request:${row.id}`,
				before: { status: "pending" },
				after: { status: "withdrawn" },
			},
		};
	});
	revalidatePath(PATH);
	return res;
}

export const createChangeRequest = safeAction(
	"createChangeRequest",
	createChangeRequestImpl,
);
export const withdrawChangeRequest = safeAction(
	"withdrawChangeRequest",
	withdrawChangeRequestImpl,
);
