"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import {
	controls,
	exceptions,
	lossEvents,
	orgSettings,
	riskAssets,
	riskControls,
	risks,
	riskTreatments,
	tasks,
} from "@/db/schema";
import { safeAction } from "@/lib/actions/safe";
import { requestApproval } from "@/lib/approvals/service";
import { requireOrg, toOrgCtx } from "@/lib/auth/guards";
import { assessRisk, nextRiskCode } from "@/lib/compliance/risk";
import { mutateOrg } from "@/lib/db/with-org";
import { RISK_STATUS } from "@/lib/entities/risk";
import { canTransition } from "@/lib/entities/status-machine";
import { notify } from "@/lib/notifications/notify";
import { type ActionResult, fromZod } from "@/lib/validation/common";
import {
	createExceptionSchema,
	createLossEventSchema,
	createRiskSchema,
	createTreatmentSchema,
	setRiskStatusSchema,
	updateRiskSchema,
} from "@/lib/validation/registers";

async function appetiteFor(
	tx: Parameters<Parameters<typeof mutateOrg>[1]>[0],
	orgId: string,
) {
	const [s] = await tx
		.select({
			riskAppetite: orgSettings.riskAppetite,
			reviewDefaults: orgSettings.reviewDefaults,
		})
		.from(orgSettings)
		.where(eq(orgSettings.organizationId, orgId))
		.limit(1);
	return s ?? null;
}

function plusMonths(months: number): string {
	const d = new Date();
	d.setMonth(d.getMonth() + months);
	return d.toISOString().slice(0, 10);
}

async function createRiskImpl(
	input: unknown,
): Promise<ActionResult<{ id: string; code: string }>> {
	const c = await requireOrg({ risk: ["create"] });
	const parsed = createRiskSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const d = parsed.data;
	const out = await mutateOrg(toOrgCtx(c), async (tx) => {
		const existing = await tx
			.select({ code: risks.code })
			.from(risks)
			.where(eq(risks.organizationId, c.orgId));
		const code = nextRiskCode(existing.map((r) => r.code));
		const settings = await appetiteFor(tx, c.orgId);
		const [row] = await tx
			.insert(risks)
			.values({
				organizationId: c.orgId,
				code,
				title: d.title,
				description: d.description ?? null,
				category: d.category,
				likelihood: d.likelihood,
				impact: d.impact,
				ownerUserId: d.ownerUserId ?? c.userId,
				reviewAt: plusMonths(settings?.reviewDefaults.risk ?? 3),
			})
			.returning({ id: risks.id });
		if (!row) throw new Error("insert failed");
		const a = assessRisk(
			{ id: row.id, likelihood: d.likelihood, impact: d.impact },
			settings?.riskAppetite ?? undefined,
		);
		if (a.aboveAppetite) {
			await notify(tx, {
				orgId: c.orgId,
				recipients: [d.ownerUserId ?? c.userId],
				actorUserId: null,
				kind: "risk_above_appetite",
				title: `${code} liegt über dem Risikoappetit (Score ${a.effective.score})`,
				link: `/risiken/${row.id}`,
			});
		}
		return {
			result: { id: row.id, code },
			audit: {
				action: "risk.create",
				target: `risk:${row.id}`,
				after: {
					code,
					title: d.title,
					likelihood: d.likelihood,
					impact: d.impact,
					category: d.category,
				},
			},
		};
	});
	revalidatePath("/risiken");
	return { ok: true, data: out };
}

async function updateRiskImpl(input: unknown): Promise<ActionResult> {
	const c = await requireOrg({ risk: ["update"] });
	const parsed = updateRiskSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const { riskId, controlCodes, assetIds, ...patch } = parsed.data;
	const ok = await mutateOrg(toOrgCtx(c), async (tx) => {
		const [before] = await tx
			.select()
			.from(risks)
			.where(and(eq(risks.id, riskId), eq(risks.organizationId, c.orgId)))
			.limit(1);
		if (!before) return { result: false, audit: [] };
		const set: Partial<typeof risks.$inferInsert> = {};
		for (const [k, v] of Object.entries(patch))
			if (v !== undefined) (set as Record<string, unknown>)[k] = v;
		if (Object.keys(set).length > 0)
			await tx.update(risks).set(set).where(eq(risks.id, riskId));
		if (controlCodes) {
			await tx.delete(riskControls).where(eq(riskControls.riskId, riskId));
			if (controlCodes.length > 0) {
				const ids = await tx
					.select({ id: controls.id })
					.from(controls)
					.where(inArrayCodes(controlCodes));
				if (ids.length > 0)
					await tx
						.insert(riskControls)
						.values(
							ids.map((x) => ({
								organizationId: c.orgId,
								riskId,
								controlId: x.id,
							})),
						)
						.onConflictDoNothing();
			}
		}
		if (assetIds) {
			await tx.delete(riskAssets).where(eq(riskAssets.riskId, riskId));
			if (assetIds.length > 0)
				await tx
					.insert(riskAssets)
					.values(
						assetIds.map((assetId) => ({
							organizationId: c.orgId,
							riskId,
							assetId,
						})),
					)
					.onConflictDoNothing();
		}
		const settings = await appetiteFor(tx, c.orgId);
		const merged = { ...before, ...set };
		const a = assessRisk(
			{
				id: riskId,
				likelihood: merged.likelihood,
				impact: merged.impact,
				residualLikelihood: merged.residualLikelihood,
				residualImpact: merged.residualImpact,
			},
			settings?.riskAppetite ?? undefined,
		);
		const wasAbove = assessRisk(
			{
				id: riskId,
				likelihood: before.likelihood,
				impact: before.impact,
				residualLikelihood: before.residualLikelihood,
				residualImpact: before.residualImpact,
			},
			settings?.riskAppetite ?? undefined,
		).aboveAppetite;
		if (a.aboveAppetite && !wasAbove) {
			await notify(tx, {
				orgId: c.orgId,
				recipients: [merged.ownerUserId],
				actorUserId: c.userId,
				kind: "risk_above_appetite",
				title: `${before.code} liegt über dem Risikoappetit (Score ${a.effective.score})`,
				link: `/risiken/${riskId}`,
			});
		}
		return {
			result: true,
			audit: {
				action: "risk.update",
				target: `risk:${riskId}`,
				before: pick(before, Object.keys(set)),
				after: { ...set, controlCodes, assetIds },
			},
		};
	});
	if (!ok) return { ok: false, error: "notFound" };
	revalidatePath("/risiken", "layout");
	return { ok: true, data: undefined };
}

function inArrayCodes(codes: string[]) {
	return inArray(controls.code, codes);
}

function pick(obj: Record<string, unknown>, keys: string[]) {
	return Object.fromEntries(keys.map((k) => [k, obj[k] ?? null]));
}

async function setRiskStatusImpl(
	input: unknown,
): Promise<ActionResult<{ status: string; approvalRequested: boolean }>> {
	const c = await requireOrg({ risk: ["update"] });
	const parsed = setRiskStatusSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const { riskId, status, note, selfApprovalReason } = parsed.data;
	const res = await mutateOrg<
		ActionResult<{ status: string; approvalRequested: boolean }>
	>(toOrgCtx(c), async (tx) => {
		const [row] = await tx
			.select()
			.from(risks)
			.where(and(eq(risks.id, riskId), eq(risks.organizationId, c.orgId)))
			.limit(1);
		if (!row) return { result: { ok: false, error: "notFound" }, audit: [] };
		const check = canTransition(RISK_STATUS, row.status, status, {
			hasNote: Boolean(note && note.trim().length >= 3),
		});
		if (!check.ok)
			return {
				result: { ok: false, error: `transition_${check.reason}` },
				audit: [],
			};

		// Akzeptanz über dem tolerierbaren Appetit → Workflow risk_acceptance.
		if (status === "accepted") {
			const settings = await appetiteFor(tx, c.orgId);
			const a = assessRisk(row, settings?.riskAppetite ?? undefined);
			if (a.aboveAppetite) {
				const r = await requestApproval(
					tx,
					{ orgId: c.orgId, userId: c.userId, name: c.name },
					{
						kind: "risk_acceptance",
						entityType: "risk",
						entityId: riskId,
						entityOwnerUserId: row.ownerUserId,
						title: `${row.code} · ${row.title}`,
						link: `/risiken/${riskId}`,
						selfApprovalReason,
					},
				);
				if (!r.ok) return { result: { ok: false, error: r.error }, audit: [] };
				if (r.status === "pending") {
					return {
						result: {
							ok: true,
							data: { status: row.status, approvalRequested: true },
						},
						audit: {
							action: "risk.acceptance_requested",
							target: `risk:${riskId}`,
							after: { requestId: r.requestId, note: note ?? null },
						},
					};
				}
				await tx
					.update(risks)
					.set({
						status: "accepted",
						acceptedByUserId: c.userId,
						acceptedAt: new Date(),
					})
					.where(eq(risks.id, riskId));
				return {
					result: {
						ok: true,
						data: { status: "accepted", approvalRequested: false },
					},
					audit: {
						action: r.selfApproved ? "approval.self_approved" : "risk.status",
						target: `risk:${riskId}`,
						before: { status: row.status },
						after: {
							status: "accepted",
							reason: selfApprovalReason ?? null,
							requestId: r.requestId,
						},
					},
				};
			}
		}
		await tx
			.update(risks)
			.set({
				status,
				...(status === "accepted"
					? { acceptedByUserId: c.userId, acceptedAt: new Date() }
					: {}),
				description: note?.trim()
					? `${row.description ?? ""}\n\n${note.trim()}`.trim()
					: row.description,
			})
			.where(eq(risks.id, riskId));
		return {
			result: { ok: true, data: { status, approvalRequested: false } },
			audit: {
				action: "risk.status",
				target: `risk:${riskId}`,
				before: { status: row.status },
				after: { status, note: note ?? null },
			},
		};
	});
	revalidatePath("/risiken", "layout");
	return res;
}

async function createTreatmentImpl(
	input: unknown,
): Promise<ActionResult<{ id: string }>> {
	const c = await requireOrg({ risk: ["update"] });
	const parsed = createTreatmentSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const d = parsed.data;
	const id = await mutateOrg(toOrgCtx(c), async (tx) => {
		const [risk] = await tx
			.select({ code: risks.code, title: risks.title, status: risks.status })
			.from(risks)
			.where(and(eq(risks.id, d.riskId), eq(risks.organizationId, c.orgId)))
			.limit(1);
		if (!risk) throw new Error("notFound");
		const [task] = await tx
			.insert(tasks)
			.values({
				organizationId: c.orgId,
				title: `${risk.code}: ${d.title}`,
				description: d.description ?? null,
				assigneeUserId: d.ownerUserId ?? c.userId,
				createdByUserId: c.userId,
				dueAt: d.dueAt ?? null,
				entityType: "risk",
				entityId: d.riskId,
				sourceKind: "treatment",
			})
			.returning({ id: tasks.id });
		const [row] = await tx
			.insert(riskTreatments)
			.values({
				organizationId: c.orgId,
				riskId: d.riskId,
				title: d.title,
				description: d.description ?? null,
				ownerUserId: d.ownerUserId ?? c.userId,
				dueAt: d.dueAt ?? null,
				taskId: task?.id ?? null,
			})
			.returning({ id: riskTreatments.id });
		if (!row) throw new Error("insert failed");
		if (risk.status === "open")
			await tx
				.update(risks)
				.set({ status: "in_treatment" })
				.where(eq(risks.id, d.riskId));
		await notify(tx, {
			orgId: c.orgId,
			recipients: [d.ownerUserId],
			actorUserId: c.userId,
			kind: "task_assigned",
			title: `Massnahme: ${d.title}`,
			link: `/risiken/${d.riskId}`,
		});
		return {
			result: row.id,
			audit: {
				action: "risk.treatment",
				target: `risk:${d.riskId}`,
				after: {
					title: d.title,
					dueAt: d.dueAt ?? null,
					taskId: task?.id ?? null,
				},
			},
		};
	});
	revalidatePath("/risiken", "layout");
	return { ok: true, data: { id } };
}

async function createExceptionImpl(
	input: unknown,
): Promise<ActionResult<{ id: string }>> {
	const c = await requireOrg({ risk: ["create"] });
	const parsed = createExceptionSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const d = parsed.data;
	const res = await mutateOrg<ActionResult<{ id: string }>>(
		toOrgCtx(c),
		async (tx) => {
			let controlId: string | null = null;
			if (d.controlCode) {
				const [ctl] = await tx
					.select({ id: controls.id })
					.from(controls)
					.where(eq(controls.code, d.controlCode))
					.limit(1);
				controlId = ctl?.id ?? null;
			}
			const [row] = await tx
				.insert(exceptions)
				.values({
					organizationId: c.orgId,
					title: d.title,
					controlId,
					documentId: d.documentId ?? null,
					justification: d.justification,
					compensatingControls: d.compensatingControls ?? null,
					riskId: d.riskId ?? null,
					ownerUserId: c.userId,
					validUntil: d.validUntil,
					status: "requested",
				})
				.returning({ id: exceptions.id });
			if (!row) throw new Error("insert failed");
			const r = await requestApproval(
				tx,
				{ orgId: c.orgId, userId: c.userId, name: c.name },
				{
					kind: "exception",
					entityType: "exception",
					entityId: row.id,
					entityOwnerUserId: c.userId,
					title: d.title,
					link: "/risiken?tab=ausnahmen",
					selfApprovalReason: d.selfApprovalReason,
				},
			);
			let approvalRequestId: string | null = null;
			let status: "requested" | "approved" = "requested";
			if (r.ok) {
				approvalRequestId = r.requestId;
				if (r.status === "approved") status = "approved";
			} else if (r.error !== "workflow_disabled") {
				return { result: { ok: false, error: r.error }, audit: [] };
			} else {
				status = "approved"; // Workflow aus → Ausnahme gilt mit Eigner-Verantwortung
			}
			await tx
				.update(exceptions)
				.set({ approvalRequestId, status })
				.where(eq(exceptions.id, row.id));
			return {
				result: { ok: true, data: { id: row.id } },
				audit: {
					action: "exception.create",
					target: `exception:${row.id}`,
					after: {
						title: d.title,
						controlCode: d.controlCode ?? null,
						validUntil: d.validUntil,
						status,
					},
				},
			};
		},
	);
	revalidatePath("/risiken");
	return res;
}

async function createLossEventImpl(
	input: unknown,
): Promise<ActionResult<{ id: string }>> {
	const c = await requireOrg({ risk: ["create"] });
	const parsed = createLossEventSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const d = parsed.data;
	const id = await mutateOrg(toOrgCtx(c), async (tx) => {
		const [row] = await tx
			.insert(lossEvents)
			.values({
				organizationId: c.orgId,
				occurredAt: d.occurredAt,
				detectedAt: d.detectedAt ?? null,
				amount: d.amount !== undefined ? String(d.amount) : null,
				recovery: d.recovery !== undefined ? String(d.recovery) : null,
				category: d.category,
				cause: d.cause ?? null,
				description: d.description ?? null,
				incidentId: d.incidentId ?? null,
				riskId: d.riskId ?? null,
				ownerUserId: c.userId,
			})
			.returning({ id: lossEvents.id });
		if (!row) throw new Error("insert failed");
		return {
			result: row.id,
			audit: {
				action: "loss_event.create",
				target: `loss_event:${row.id}`,
				after: {
					category: d.category,
					amount: d.amount ?? null,
					occurredAt: d.occurredAt,
				},
			},
		};
	});
	revalidatePath("/risiken");
	return { ok: true, data: { id } };
}

// Sicherheitsnetz: unerwartete Ausnahmen → { ok: false, error, ref } + Log
// statt Error-Boundary (lib/actions/safe.ts).
export const createRisk = safeAction("createRisk", createRiskImpl);
export const updateRisk = safeAction("updateRisk", updateRiskImpl);
export const setRiskStatus = safeAction("setRiskStatus", setRiskStatusImpl);
export const createTreatment = safeAction(
	"createTreatment",
	createTreatmentImpl,
);
export const createException = safeAction(
	"createException",
	createExceptionImpl,
);
export const createLossEvent = safeAction(
	"createLossEvent",
	createLossEventImpl,
);
