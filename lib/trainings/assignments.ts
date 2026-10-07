import { eq } from "drizzle-orm";
import { member } from "@/db/auth-schema";
import {
	roleAssignments,
	trainingAssignments,
	trainingRequirements,
} from "@/db/schema";
import { normalizeRole } from "@/lib/auth/session-rules";
import type { OrgTx } from "@/lib/db/with-org";

function addDays(base: Date, days: number): string {
	return new Date(base.getTime() + days * 86_400_000)
		.toISOString()
		.slice(0, 10);
}

// Zuweisungen: je Mitglied und passender Pflichtschulung (Rolle/Funktion)
// eine offene Zuweisung, falls keine existiert.
export async function syncTrainingAssignments(
	tx: OrgTx,
	orgId: string,
): Promise<number> {
	const reqs = await tx
		.select()
		.from(trainingRequirements)
		.where(eq(trainingRequirements.organizationId, orgId));
	if (reqs.length === 0) return 0;
	const members = await tx
		.select({ userId: member.userId, role: member.role })
		.from(member)
		.where(eq(member.organizationId, orgId));
	const fns = await tx
		.select({
			function: roleAssignments.function,
			userId: roleAssignments.userId,
		})
		.from(roleAssignments)
		.where(eq(roleAssignments.organizationId, orgId));
	const existing = await tx
		.select({
			requirementId: trainingAssignments.requirementId,
			userId: trainingAssignments.userId,
		})
		.from(trainingAssignments)
		.where(eq(trainingAssignments.organizationId, orgId));
	const have = new Set(existing.map((e) => `${e.requirementId}|${e.userId}`));
	let n = 0;
	const due = addDays(new Date(), 30);
	for (const r of reqs) {
		for (const m of members) {
			const role = normalizeRole(m.role);
			const matchesRole =
				r.orgRole === "all" ||
				r.orgRole === role ||
				(r.orgRole === "editor" && role === "owner");
			const matchesFn = r.function
				? fns.some((f) => f.function === r.function && f.userId === m.userId)
				: false;
			if (!(matchesRole || matchesFn)) continue;
			if (have.has(`${r.id}|${m.userId}`)) continue;
			await tx.insert(trainingAssignments).values({
				organizationId: orgId,
				requirementId: r.id,
				userId: m.userId,
				dueAt: due,
				status: "due",
			});
			n += 1;
		}
	}
	return n;
}
