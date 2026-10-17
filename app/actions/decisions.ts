"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { decisionRequests, orgSettings } from "@/db/schema";
import { safeAction } from "@/lib/actions/safe";
import {
	ensureOrgWorkflows,
	requestApproval,
	withdraw,
} from "@/lib/approvals/service";
import type { AuditInput } from "@/lib/audit";
import { requireOrg, toOrgCtx } from "@/lib/auth/guards";
import { REQUIREMENT_BY_KEY } from "@/lib/compliance/catalog";
import { nextDecisionCode } from "@/lib/compliance/decision-resolutions";
import {
	createDecisionResolution,
	entityFrameworkRefs,
} from "@/lib/compliance/decision-service";
import { mutateOrg } from "@/lib/db/with-org";
import { type ActionResult, fromZod } from "@/lib/validation/common";
import { decisionRequestSchema } from "@/lib/validation/governance";

// Entscheidung beim Management anfragen (E2): Frage + Ausgangslage +
// Optionen + Frist, Bezug zur Entität und zu Anforderungen. Entschieden wird
// über den Workflow management_decision (/heute/freigaben); das Ergebnis
// wird automatisch ein Beschluss (lib/compliance/decision-service.ts).

async function createDecisionRequestImpl(
	input: unknown,
): Promise<ActionResult<{ id: string; code: string; status: string }>> {
	const c = await requireOrg({ task: ["create"] });
	const parsed = decisionRequestSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const d = parsed.data;
	const res = await mutateOrg<
		ActionResult<{ id: string; code: string; status: string }>
	>(toOrgCtx(c), async (tx) => {
		const [settings] = await tx
			.select({ stage: orgSettings.licenceStage })
			.from(orgSettings)
			.where(eq(orgSettings.organizationId, c.orgId))
			.limit(1);
		await ensureOrgWorkflows(tx, c.orgId, settings?.stage ?? "0_vorbereitung");
		const refs = await entityFrameworkRefs(
			tx,
			c.orgId,
			d.linkedEntityType,
			d.linkedEntityId,
		);
		const chosen = d.requirementKeys.filter((k) => REQUIREMENT_BY_KEY.has(k));
		const keys = [...new Set([...chosen, ...refs.requirementKeys])].slice(
			0,
			20,
		);
		const fws = [
			...new Set([
				...refs.frameworks,
				...keys.map((k) => k.split(":")[0] ?? ""),
			]),
		];
		const existing = await tx
			.select({ code: decisionRequests.code })
			.from(decisionRequests)
			.where(eq(decisionRequests.organizationId, c.orgId));
		const code = nextDecisionCode(
			existing.map((e) => e.code),
			new Date().getFullYear(),
		);
		const [row] = await tx
			.insert(decisionRequests)
			.values({
				organizationId: c.orgId,
				code,
				question: d.question,
				context: d.context ?? null,
				recommendation: d.recommendation ?? null,
				options: d.options,
				dueAt: d.dueAt ?? null,
				linkedEntityType: d.linkedEntityType ?? null,
				linkedEntityId: d.linkedEntityId ?? null,
				frameworks: fws,
				requirementKeys: keys,
				requestedByUserId: c.userId,
			})
			.returning({ id: decisionRequests.id });
		if (!row) throw new Error("insert failed");
		const actor = { orgId: c.orgId, userId: c.userId, name: c.name };
		const r = await requestApproval(tx, actor, {
			kind: "management_decision",
			entityType: "decision_request",
			entityId: row.id,
			entityOwnerUserId: c.userId,
			title: `${code} · ${d.question}`,
			link: "/beschluesse?tab=anfragen",
			selfApprovalReason: d.selfApprovalReason,
		});
		if (!r.ok) {
			// nichts halb Angelegtes zurücklassen
			await tx.delete(decisionRequests).where(eq(decisionRequests.id, row.id));
			return { result: { ok: false, error: r.error }, audit: [] };
		}
		await tx
			.update(decisionRequests)
			.set({ approvalRequestId: r.requestId })
			.where(eq(decisionRequests.id, row.id));
		const audit: AuditInput[] = [
			{
				action: "decision_request.create",
				target: `decision_request:${row.id}`,
				after: {
					code,
					question: d.question,
					linked: d.linkedEntityType
						? `${d.linkedEntityType}:${d.linkedEntityId}`
						: null,
					frameworks: fws,
					requirementKeys: keys,
				},
			},
		];
		// Solo-Modus: sofort selbst entschieden → Beschluss
		if (r.status === "approved") {
			await tx
				.update(decisionRequests)
				.set({
					status: "decided",
					outcome: "approved",
					decidedByUserId: c.userId,
					decidedAt: new Date(),
				})
				.where(eq(decisionRequests.id, row.id));
			audit.push(
				...(await createDecisionResolution(tx, actor, {
					workflowKind: "management_decision",
					workflowName: "Managemententscheidung",
					entityType: "decision_request",
					entityId: row.id,
					outcome: "approved",
					note: d.selfApprovalReason ?? null,
					requestId: r.requestId,
				})),
			);
		}
		return {
			result: { ok: true, data: { id: row.id, code, status: r.status } },
			audit,
		};
	});
	revalidatePath("/beschluesse");
	return res;
}

async function withdrawDecisionRequestImpl(id: string): Promise<ActionResult> {
	const c = await requireOrg({ task: ["create"] });
	const done = await mutateOrg(toOrgCtx(c), async (tx) => {
		const [q] = await tx
			.select({
				status: decisionRequests.status,
				requestedByUserId: decisionRequests.requestedByUserId,
				approvalRequestId: decisionRequests.approvalRequestId,
			})
			.from(decisionRequests)
			.where(
				and(
					eq(decisionRequests.id, id),
					eq(decisionRequests.organizationId, c.orgId),
				),
			)
			.limit(1);
		if (!q || q.status !== "open" || q.requestedByUserId !== c.userId)
			return { result: false, audit: [] };
		if (q.approvalRequestId)
			await withdraw(
				tx,
				{ orgId: c.orgId, userId: c.userId },
				q.approvalRequestId,
			);
		await tx
			.update(decisionRequests)
			.set({ status: "withdrawn" })
			.where(eq(decisionRequests.id, id));
		return {
			result: true,
			audit: {
				action: "decision_request.withdrawn",
				target: `decision_request:${id}`,
			},
		};
	});
	if (!done) return { ok: false, error: "notFound" };
	revalidatePath("/beschluesse");
	return { ok: true, data: undefined };
}

export const createDecisionRequest = safeAction(
	"createDecisionRequest",
	createDecisionRequestImpl,
);
export const withdrawDecisionRequest = safeAction(
	"withdrawDecisionRequest",
	withdrawDecisionRequestImpl,
);
