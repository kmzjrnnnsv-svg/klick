"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { approvalWorkflows, delegations } from "@/db/schema";
import { applyApprovalOutcome } from "@/lib/approvals/outcomes";
import { type DecideResult, decide, withdraw } from "@/lib/approvals/service";
import { requireOrg, requireStepUp, toOrgCtx } from "@/lib/auth/guards";
import { AuthError } from "@/lib/auth/session-rules";
import { mutateOrg } from "@/lib/db/with-org";
import { type ActionResult, fromZod } from "@/lib/validation/common";
import {
	decideApprovalSchema,
	delegationSchema,
} from "@/lib/validation/registers";

// Freigabe-Entscheidungen: Vier-Augen und Funktionsprüfung in lib/approvals,
// Step-up (frische MFA) für die Entscheidung selbst. Jede Entscheidung ist ein
// Audit-Eintrag; der Ausgang wird auf die Entität angewendet (outcomes.ts).

export async function decideApproval(
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
	const res = await mutateOrg<DecideResult>(toOrgCtx(c), async (tx) => {
		const r = await decide(
			tx,
			{ orgId: c.orgId, userId: c.userId, name: c.name },
			d,
		);
		if (!r.ok) return { result: r, audit: [] };
		const extra =
			r.status !== "pending"
				? await applyApprovalOutcome(
						tx,
						{ orgId: c.orgId, userId: c.userId },
						r,
					)
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

export async function withdrawApproval(
	requestId: string,
): Promise<ActionResult> {
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

export async function createDelegation(input: unknown): Promise<ActionResult> {
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

export async function setWorkflowEnabled(
	input: unknown,
): Promise<ActionResult> {
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
