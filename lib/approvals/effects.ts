import type { AuditInput } from "@/lib/audit";
import { resolutionForApproval } from "@/lib/compliance/decision-service";
import type { OrgTx } from "@/lib/db/with-org";
import { applyApprovalOutcome } from "./outcomes";
import type { DecideResult } from "./service";

// Nach einer Entscheidung, die den Antrag abschließt: Wirkung auf die
// Entität (outcomes.ts) und — bei einer Entscheidung der Geschäftsleitung —
// genau ein Beschluss (E1). Gemeinsam für „Freigeben“ und „Freigeben und
// unterschreiben“.
export async function approvalEffects(
	tx: OrgTx,
	ctx: { orgId: string; userId: string; name: string },
	r: Extract<DecideResult, { ok: true }>,
	requestId: string,
): Promise<AuditInput[]> {
	if (r.status === "pending") return [];
	return [
		...(await applyApprovalOutcome(
			tx,
			{ orgId: ctx.orgId, userId: ctx.userId },
			r,
		)),
		...(await resolutionForApproval(tx, ctx, requestId)),
	];
}
