import { and, eq } from "drizzle-orm";
import { roleAssignments } from "@/db/schema";
import type { RoleFunction } from "@/db/schema/enums";
import type { OrgTx } from "@/lib/db/with-org";

// Top-Management = Funktion „Leitungsorgan / Geschäftsleitung“
// (management_body) laut Organisation → Rollen & Leitung, inklusive
// benannter Vertretung — dieselbe Regel wie die Freigabe von Beschlüssen
// (lib/approvals/rules.ts, function:management_body).
export const TOP_MANAGEMENT_FUNCTION: RoleFunction = "management_body";

export function holdsFunction(
	assignments: readonly {
		function: RoleFunction;
		userId: string | null;
		deputyUserId: string | null;
	}[],
	userId: string,
	fn: RoleFunction = TOP_MANAGEMENT_FUNCTION,
): boolean {
	return assignments.some(
		(a) =>
			a.function === fn && (a.userId === userId || a.deputyUserId === userId),
	);
}

export async function topManagementOf(
	tx: OrgTx,
	orgId: string,
	userId: string,
): Promise<{ isTopManagement: boolean; anyAssigned: boolean }> {
	const rows = await tx
		.select({
			function: roleAssignments.function,
			userId: roleAssignments.userId,
			deputyUserId: roleAssignments.deputyUserId,
		})
		.from(roleAssignments)
		.where(
			and(
				eq(roleAssignments.organizationId, orgId),
				eq(roleAssignments.function, TOP_MANAGEMENT_FUNCTION),
			),
		);
	return {
		isTopManagement: holdsFunction(rows, userId),
		anyAssigned: rows.some((r) => r.userId || r.deputyUserId),
	};
}
