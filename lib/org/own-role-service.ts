import { and, eq, isNotNull, isNull, ne } from "drizzle-orm";
import { roleAssignments } from "@/db/schema";
import type { AuditInput } from "@/lib/audit";
import {
	proposeAssignment,
	proposeRevocation,
} from "@/lib/compliance/appointment-service";
import type { OrgTx } from "@/lib/db/with-org";
import { syncMemberRoles } from "./member-role-sync";

// Eigene Rollen besetzen (ADR-024): Rollen-Editor, Team und Einladung
// schreiben nie direkt in member_roles, sondern schlagen über die Bestellung
// vor (lib/compliance/appointment-service.ts); die Rechte folgen mit
// syncMemberRoles (lib/org/member-role-sync.ts).

type Actor = { orgId: string; userId: string; name: string };

const emailKey = (e: string) => e.trim().toLowerCase();

export type HolderRef = { userId: string } | { pendingEmail: string };

const sameHolder = (
	row: { userId: string | null; pendingEmail: string | null },
	ref: HolderRef,
) =>
	"userId" in ref
		? row.userId === ref.userId
		: !row.userId &&
			emailKey(row.pendingEmail ?? "") === emailKey(ref.pendingEmail);

// Wer eine eigene Rolle tragen soll: fehlende Personen vorschlagen (GL
// bestellt), weggefallene abberufen bzw. Vorschläge zurückziehen. Liefert
// die Zahl der Vorschläge, die noch auf die Geschäftsleitung warten.
export async function setOwnRoleAssignments(
	tx: OrgTx,
	actor: Actor,
	pairs: { roleId: string; holder: HolderRef }[],
	scope: { roleIds?: readonly string[]; holder?: HolderRef },
	via: string,
): Promise<{ audit: AuditInput[]; waiting: number }> {
	const rows = await tx
		.select({
			id: roleAssignments.id,
			roleId: roleAssignments.orgRoleId,
			userId: roleAssignments.userId,
			pendingEmail: roleAssignments.pendingEmail,
			status: roleAssignments.status,
		})
		.from(roleAssignments)
		.where(
			and(
				eq(roleAssignments.organizationId, actor.orgId),
				isNotNull(roleAssignments.orgRoleId),
				ne(roleAssignments.status, "revoked"),
			),
		);
	// nur im Ausschnitt abgleichen: je Rolle (Rollen-Editor) oder je Person
	// (Team, Einladung)
	const inScope = rows.filter(
		(r) =>
			r.roleId &&
			(!scope.roleIds || scope.roleIds.includes(r.roleId)) &&
			(!scope.holder || sameHolder(r, scope.holder)),
	);
	const audit: AuditInput[] = [];
	let waiting = 0;
	for (const p of pairs) {
		const exists = inScope.some(
			(r) =>
				r.roleId === p.roleId &&
				r.status !== "rejected" &&
				sameHolder(r, p.holder),
		);
		if (exists) continue;
		const out = await proposeAssignment(
			tx,
			actor,
			{
				function: "other",
				orgRoleId: p.roleId,
				...("userId" in p.holder
					? { userId: p.holder.userId }
					: { pendingEmail: emailKey(p.holder.pendingEmail) }),
			},
			via,
		);
		audit.push(...out.audit);
		if (out.status !== "appointed") waiting += 1;
	}
	for (const r of inScope) {
		const keep = pairs.some(
			(p) => p.roleId === r.roleId && sameHolder(r, p.holder),
		);
		if (keep) continue;
		const out = await proposeRevocation(tx, actor, r.id, via);
		if (out.ok) {
			audit.push(...out.audit);
			if (out.waiting) waiting += 1;
		}
	}
	return { audit, waiting };
}

// Einladung zurückgezogen: vorgemerkte eigene Rollen der Adresse entfallen
// (die Person ist nie beigetreten — keine Abberufung nötig)
export async function dropInvitedOwnRoles(
	tx: OrgTx,
	orgId: string,
	email: string,
): Promise<AuditInput[]> {
	const gone = await tx
		.delete(roleAssignments)
		.where(
			and(
				eq(roleAssignments.organizationId, orgId),
				isNotNull(roleAssignments.orgRoleId),
				isNull(roleAssignments.userId),
				eq(roleAssignments.pendingEmail, emailKey(email)),
			),
		)
		.returning({ id: roleAssignments.id });
	if (gone.length === 0) return [];
	return [
		{
			action: "role_assignment.invite_dropped",
			target: `organization:${orgId}`,
			after: { removed: gone.map((g) => g.id) },
		},
		...(await syncMemberRoles(tx, orgId, null)),
	];
}
