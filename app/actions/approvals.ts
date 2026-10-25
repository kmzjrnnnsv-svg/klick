"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
	approvalRequests,
	approvalWorkflows,
	decisionRequests,
	delegations,
	roleAssignments,
} from "@/db/schema";
import { safeAction } from "@/lib/actions/safe";
import { applyApprovalOutcome } from "@/lib/approvals/outcomes";
import { type DecideResult, decide, withdraw } from "@/lib/approvals/service";
import { triggerOf } from "@/lib/approvals/triggers";
import type { AuditInput } from "@/lib/audit";
import { requireOrg, requireStepUp, toOrgCtx } from "@/lib/auth/guards";
import { AuthError } from "@/lib/auth/session-rules";
import { effectiveAssignment } from "@/lib/compliance/appointments";
import {
	createAppointmentsResolution,
	resolutionForApproval,
} from "@/lib/compliance/decision-service";
import { topManagementOf } from "@/lib/compliance/top-management";
import { mutateOrg } from "@/lib/db/with-org";
import { type ActionResult, fromZod } from "@/lib/validation/common";
import {
	decideApprovalSchema,
	delegationSchema,
} from "@/lib/validation/registers";

// Offene Managementanfrage hinter einem Antrag (Optionen prüfen)
async function decisionRequestFor(
	tx: Parameters<Parameters<typeof mutateOrg>[1]>[0],
	orgId: string,
	requestId: string,
) {
	const [req] = await tx
		.select({
			entityType: approvalRequests.entityType,
			entityId: approvalRequests.entityId,
		})
		.from(approvalRequests)
		.where(
			and(
				eq(approvalRequests.id, requestId),
				eq(approvalRequests.organizationId, orgId),
			),
		)
		.limit(1);
	if (req?.entityType !== "decision_request") return null;
	const [q] = await tx
		.select({ id: decisionRequests.id, options: decisionRequests.options })
		.from(decisionRequests)
		.where(
			and(
				eq(decisionRequests.id, req.entityId),
				eq(decisionRequests.organizationId, orgId),
			),
		)
		.limit(1);
	return q ?? null;
}

// Freigabe-Entscheidungen: Vier-Augen und Funktionsprüfung in lib/approvals,
// Step-up (frische MFA) für die Entscheidung selbst. Jede Entscheidung ist ein
// Audit-Eintrag; der Ausgang wird auf die Entität angewendet (outcomes.ts).

async function decideApprovalImpl(
	input: unknown,
): Promise<ActionResult<{ status: string }>> {
	let c: Awaited<ReturnType<typeof requireStepUp>>;
	try {
		c = await requireStepUp({ approval: ["decide"] });
	} catch (e) {
		if (e instanceof AuthError && e.code === "step_up_required")
			return { ok: false, error: "step_up_required" };
		throw e;
	}
	const parsed = decideApprovalSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const d = parsed.data;
	const res = await mutateOrg<
		DecideResult | { ok: false; error: "optionRequired" | "invalidOption" }
	>(toOrgCtx(c), async (tx) => {
		// Managementanfrage: Zustimmung nennt die gewählte Option; sie steht
		// in der Entscheidung und damit im Beschluss (E2)
		const question = await decisionRequestFor(tx, c.orgId, d.requestId);
		let note = d.note;
		if (question && d.decision === "approved") {
			if (question.options.length > 0 && !d.chosenOption)
				return { result: { ok: false, error: "optionRequired" }, audit: [] };
			if (d.chosenOption && !question.options.includes(d.chosenOption))
				return { result: { ok: false, error: "invalidOption" }, audit: [] };
			if (d.chosenOption)
				note = `Gewählt: ${d.chosenOption}${d.note ? ` — ${d.note}` : ""}`;
		}
		const r = await decide(
			tx,
			{ orgId: c.orgId, userId: c.userId, name: c.name },
			{ requestId: d.requestId, decision: d.decision, note },
		);
		if (!r.ok) return { result: r, audit: [] };
		if (question && d.decision === "approved" && d.chosenOption)
			await tx
				.update(decisionRequests)
				.set({ chosenOption: d.chosenOption, decisionNote: d.note ?? null })
				.where(eq(decisionRequests.id, question.id));
		const extra =
			r.status !== "pending"
				? [
						...(await applyApprovalOutcome(
							tx,
							{ orgId: c.orgId, userId: c.userId },
							r,
						)),
						// Entscheidung der Geschäftsleitung → Beschluss (E1)
						...(await resolutionForApproval(
							tx,
							{ orgId: c.orgId, userId: c.userId, name: c.name },
							d.requestId,
						)),
					]
				: [];
		return {
			result: r,
			audit: [
				{
					action: `approval.${d.decision}`,
					target: `${r.entityType}:${r.entityId}`,
					after: {
						requestId: d.requestId,
						decision: d.decision,
						note: d.note ?? null,
						chosenOption: d.chosenOption ?? null,
						outcome: r.status,
						onBehalfOf: r.onBehalfOf ?? null,
					},
				},
				...extra,
			],
		};
	});
	if (!res.ok) return { ok: false, error: res.error };
	revalidatePath("/heute", "layout");
	return { ok: true, data: { status: res.status } };
}

async function withdrawApprovalImpl(requestId: string): Promise<ActionResult> {
	const c = await requireOrg({ approval: ["read"] });
	const ok = await mutateOrg(toOrgCtx(c), async (tx) => {
		const done = await withdraw(
			tx,
			{ orgId: c.orgId, userId: c.userId },
			requestId,
		);
		return {
			result: done,
			audit: done
				? {
						action: "approval.withdrawn",
						target: `approval_request:${requestId}`,
					}
				: [],
		};
	});
	if (!ok) return { ok: false, error: "notFound" };
	revalidatePath("/heute", "layout");
	return { ok: true, data: undefined };
}

async function createDelegationImpl(input: unknown): Promise<ActionResult> {
	const c = await requireOrg({ approval: ["decide"] });
	const parsed = delegationSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	if (parsed.data.toUserId === c.userId) return { ok: false, error: "self" };
	await mutateOrg(toOrgCtx(c), async (tx) => {
		await tx.insert(delegations).values({
			organizationId: c.orgId,
			fromUserId: c.userId,
			toUserId: parsed.data.toUserId,
			scope: "approvals",
			validUntil: parsed.data.validUntil,
		});
		return {
			result: null,
			audit: {
				action: "approval.delegation",
				target: `user:${c.userId}`,
				after: {
					toUserId: parsed.data.toUserId,
					validUntil: parsed.data.validUntil,
				},
			},
		};
	});
	revalidatePath("/heute/freigaben");
	return { ok: true, data: undefined };
}

const toggleSchema = z.object({
	kind: z.string().min(1),
	enabled: z.boolean(),
});

async function setWorkflowEnabledImpl(input: unknown): Promise<ActionResult> {
	let c: Awaited<ReturnType<typeof requireStepUp>>;
	try {
		c = await requireStepUp({ settings: ["update"] });
	} catch (e) {
		if (e instanceof AuthError && e.code === "step_up_required")
			return { ok: false, error: "step_up_required" };
		throw e;
	}
	const parsed = toggleSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	await mutateOrg(toOrgCtx(c), async (tx) => {
		const [before] = await tx
			.select({ enabled: approvalWorkflows.enabled })
			.from(approvalWorkflows)
			.where(
				and(
					eq(approvalWorkflows.organizationId, c.orgId),
					eq(approvalWorkflows.kind, parsed.data.kind),
				),
			)
			.limit(1);
		await tx
			.update(approvalWorkflows)
			.set({ enabled: parsed.data.enabled })
			.where(
				and(
					eq(approvalWorkflows.organizationId, c.orgId),
					eq(approvalWorkflows.kind, parsed.data.kind),
				),
			);
		return {
			result: null,
			audit: {
				action: "settings.workflow",
				target: `approval_workflow:${parsed.data.kind}`,
				before: { enabled: before?.enabled ?? null },
				after: { enabled: parsed.data.enabled },
			},
		};
	});
	revalidatePath("/einstellungen");
	return { ok: true, data: undefined };
}

// Sicherheitsnetz: unerwartete Ausnahmen → { ok: false, error, ref } + Log
// statt Error-Boundary (lib/actions/safe.ts).
// Posteingang „Alle Bestellungen freigeben“: jede Bestellung wie einzeln
// entschieden (Vier-Augen, alle Personen der GL); was dabei endgültig
// bestellt ist, kommt in einen gemeinsamen Beschluss — die
// Geldwäschebeauftragte bleibt ein eigener (Pflichtbeschluss RES-GWG-AMLO).
const bulkSchema = z.object({
	requestIds: z.array(z.string().uuid()).min(1).max(50),
});

async function decideAppointmentsImpl(
	input: unknown,
): Promise<ActionResult<{ decided: number; appointed: number }>> {
	let c: Awaited<ReturnType<typeof requireStepUp>>;
	try {
		c = await requireStepUp({ approval: ["decide"] });
	} catch (e) {
		if (e instanceof AuthError && e.code === "step_up_required")
			return { ok: false, error: "step_up_required" };
		throw e;
	}
	const parsed = bulkSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const actor = { orgId: c.orgId, userId: c.userId, name: c.name };
	const res = await mutateOrg(toOrgCtx(c), async (tx) => {
		const reqs = await tx
			.select({
				id: approvalRequests.id,
				entityId: approvalRequests.entityId,
				trigger: approvalWorkflows.trigger,
				kind: approvalWorkflows.kind,
			})
			.from(approvalRequests)
			.innerJoin(
				approvalWorkflows,
				eq(approvalWorkflows.id, approvalRequests.workflowId),
			)
			.where(
				and(
					eq(approvalRequests.organizationId, c.orgId),
					inArray(approvalRequests.id, parsed.data.requestIds),
					eq(approvalRequests.status, "pending"),
				),
			);
		const audit: AuditInput[] = [];
		const finals: { id: string; entityId: string }[] = [];
		let decided = 0;
		for (const q of reqs) {
			if (triggerOf(q) !== "role.appoint") continue;
			const r = await decide(tx, actor, {
				requestId: q.id,
				decision: "approved",
			});
			if (!r.ok) continue;
			decided += 1;
			audit.push({
				action: "approval.approved",
				target: `${r.entityType}:${r.entityId}`,
				after: { requestId: q.id, outcome: r.status, bulk: true },
			});
			if (r.status === "approved") {
				audit.push(
					...(await applyApprovalOutcome(
						tx,
						{ orgId: c.orgId, userId: c.userId },
						r,
					)),
				);
				finals.push({ id: q.id, entityId: q.entityId });
			}
		}
		// Beschluss: GWB einzeln, übrige gemeinsam (bei einem: wie einzeln)
		const fns = new Map(
			(finals.length === 0
				? []
				: await tx
						.select({ id: roleAssignments.id, fn: roleAssignments.function })
						.from(roleAssignments)
						.where(
							and(
								inArray(
									roleAssignments.id,
									finals.map((f) => f.entityId),
								),
								effectiveAssignment(),
							),
						)
			).map((r) => [r.id, r.fn]),
		);
		const single = finals.filter(
			(f) => fns.get(f.entityId) === "aml_officer" || finals.length === 1,
		);
		const together = finals.filter((f) => !single.includes(f));
		for (const f of single)
			audit.push(...(await resolutionForApproval(tx, actor, f.id)));
		if (
			together.length > 0 &&
			(await topManagementOf(tx, c.orgId, c.userId)).isTopManagement
		)
			audit.push(
				...(await createAppointmentsResolution(
					tx,
					actor,
					together.map((f) => f.id),
				)),
			);
		else
			for (const f of together)
				audit.push(...(await resolutionForApproval(tx, actor, f.id)));
		return { result: { decided, appointed: finals.length }, audit };
	});
	revalidatePath("/heute/freigaben");
	revalidatePath("/organisation");
	revalidatePath("/beschluesse");
	return { ok: true, data: res };
}

export const decideApproval = safeAction("decideApproval", decideApprovalImpl);
export const decideAppointments = safeAction(
	"decideAppointments",
	decideAppointmentsImpl,
);
export const withdrawApproval = safeAction(
	"withdrawApproval",
	withdrawApprovalImpl,
);
export const createDelegation = safeAction(
	"createDelegation",
	createDelegationImpl,
);
export const setWorkflowEnabled = safeAction(
	"setWorkflowEnabled",
	setWorkflowEnabledImpl,
);
