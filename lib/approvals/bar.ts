import { and, eq, inArray } from "drizzle-orm";
import { approvalRequests } from "@/db/schema";
import type { EntityKind } from "@/db/schema/enums";
import { userNames } from "@/lib/compliance/queries";
import type { OrgTx } from "@/lib/db/with-org";
import { canDecideNow } from "./rules";
import { activeDelegations, latestRequestFor, loadCandidates } from "./service";

// Daten der Freigabe-Leiste einer Entität: letzter Antrag, ob die Person
// jetzt entscheiden darf, Namen für die Entscheidungen.
export async function approvalBarFor(
	tx: OrgTx,
	orgId: string,
	userId: string,
	entity: { type: EntityKind; id: string; ownerUserId: string | null },
) {
	const approval = await latestRequestFor(tx, orgId, entity.type, entity.id);
	if (!approval)
		return { data: null, eligible: false, names: new Map<string, string>() };
	const [candidates, dels, names] = await Promise.all([
		loadCandidates(tx, orgId),
		activeDelegations(tx, orgId),
		userNames(tx, [
			approval.requestedByUserId,
			...approval.decisions.map((d) => d.approverUserId),
		]),
	]);
	const me = candidates.find((c) => c.userId === userId);
	const step = approval.steps.find((s) => s.order === approval.currentStep);
	const eligible = Boolean(
		approval.status === "pending" &&
			step &&
			me &&
			canDecideNow(
				step,
				me,
				{
					requesterUserId: approval.requestedByUserId,
					entityOwnerUserId: entity.ownerUserId,
					delegations: dels,
				},
				candidates,
				approval.decisions.filter((d) => d.step === approval.currentStep),
			),
	);
	return {
		data: {
			...approval,
			decisions: approval.decisions.map((d) => ({
				step: d.step,
				approverUserId: d.approverUserId,
				decision: d.decision,
				rule: d.rule,
				note: d.note,
				decidedAt: d.decidedAt,
			})),
		},
		eligible,
		names,
	};
}

// Einträge eines Registers mit offenem Antrag (Badge „Wartet auf Freigabe“)
export async function pendingApprovalIds(
	tx: OrgTx,
	orgId: string,
	entityType: EntityKind,
	ids?: readonly string[],
): Promise<Set<string>> {
	if (ids && ids.length === 0) return new Set();
	const rows = await tx
		.select({ entityId: approvalRequests.entityId })
		.from(approvalRequests)
		.where(
			and(
				eq(approvalRequests.organizationId, orgId),
				eq(approvalRequests.entityType, entityType),
				eq(approvalRequests.status, "pending"),
				ids ? inArray(approvalRequests.entityId, [...ids]) : undefined,
			),
		);
	return new Set(rows.map((r) => r.entityId));
}
