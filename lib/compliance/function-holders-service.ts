import { eq } from "drizzle-orm";
import { roleAssignments } from "@/db/schema";
import type { RoleFunction } from "@/db/schema/enums";
import {
	type FunctionAssignment,
	recipientsOf,
	responsibleFor,
} from "@/lib/compliance/function-holders";
import type { OrgTx } from "@/lib/db/with-org";

// Lader zu lib/compliance/function-holders.ts (im Org-Kontext)

export async function loadAssignments(
	tx: OrgTx,
	orgId: string,
): Promise<FunctionAssignment[]> {
	return tx
		.select({
			function: roleAssignments.function,
			userId: roleAssignments.userId,
			deputyUserId: roleAssignments.deputyUserId,
			appointedAt: roleAssignments.appointedAt,
			createdAt: roleAssignments.createdAt,
		})
		.from(roleAssignments)
		.where(eq(roleAssignments.organizationId, orgId));
}

// Verantwortliche:r für Einträge dieser Funktion (Inhaber:in, sonst Vertretung)
export async function functionResponsible(
	tx: OrgTx,
	orgId: string,
	fn: RoleFunction,
): Promise<string | null> {
	return responsibleFor(await loadAssignments(tx, orgId), fn);
}

// Empfänger:innen einer Benachrichtigung an die Funktion
export async function functionRecipients(
	tx: OrgTx,
	orgId: string,
	fn: RoleFunction,
): Promise<string[]> {
	return recipientsOf(await loadAssignments(tx, orgId), fn);
}
