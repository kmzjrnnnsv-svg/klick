"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { decisionRequests } from "@/db/schema";
import { safeAction } from "@/lib/actions/safe";
import { withdraw } from "@/lib/approvals/service";
import { requireOrg, toOrgCtx } from "@/lib/auth/guards";
import { openDecisionRequest } from "@/lib/compliance/decision-service";
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
	const c = await requireOrg({ decision: ["create"] });
	const parsed = decisionRequestSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const d = parsed.data;
	const res = await mutateOrg<
		ActionResult<{ id: string; code: string; status: string }>
	>(toOrgCtx(c), async (tx) => {
		const r = await openDecisionRequest(
			tx,
			{ orgId: c.orgId, userId: c.userId, name: c.name },
			d,
		);
		return r.ok
			? {
					result: {
						ok: true,
						data: { id: r.id, code: r.code, status: r.status },
					},
					audit: r.audit,
				}
			: { result: { ok: false, error: r.error }, audit: [] };
	});
	revalidatePath("/beschluesse");
	return res;
}

async function withdrawDecisionRequestImpl(id: string): Promise<ActionResult> {
	const c = await requireOrg({ decision: ["create"] });
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
