// Berechtigungsmodell (Better Auth Access Control).
//
// Vier Org-Rollen:
//   viewer  — lesen + kommentieren
//   auditor — viewer + Nachweisanfragen + Findings; zeitlich begrenzt über
//             member_access.accessUntil (Prüfer-Sicht)
//   editor  — alles außer Freigabe/Veröffentlichung von Dokumenten,
//             Beschlüsse, Mitglieder, Einstellungen
//   owner   — alles
//
// Freigabe-Entscheidungen hängen zusätzlich an der Funktion aus
// role_assignments (Workflow-Schritt verlangt z. B. function:compliance) —
// das prüft lib/approvals, nicht dieses Statement-Modell.
import { createAccessControl } from "better-auth/plugins/access";
import {
	adminAc,
	defaultStatements,
	memberAc,
	ownerAc,
} from "better-auth/plugins/organization/access";

export const statements = {
	...defaultStatements,
	control: ["read", "update", "assign"],
	document: ["read", "create", "update", "approve", "publish", "delete"],
	process: ["read", "create", "update", "delete"],
	risk: ["read", "create", "update", "accept", "delete"],
	incident: ["read", "create", "update", "close"],
	provider: ["read", "create", "update", "delete"],
	asset: ["read", "create", "update", "delete"],
	evidence: ["read", "create", "delete"],
	milestone: ["read", "create", "update"],
	task: ["read", "create", "update", "complete"],
	comment: ["read", "create"],
	resolution: ["read", "create"],
	approval: ["read", "decide"],
	audit_request: ["read", "create", "respond", "decide"],
	audit_finding: ["read", "create", "update"],
	organisation: ["read", "update"],
	role_assignment: ["read", "update"],
	audit: ["read", "create", "update"],
	nonconformity: ["read", "create", "update", "close"],
	complaint: ["read", "create", "update"],
	whistleblowing: ["read", "create", "update"],
	obligation: ["read", "update", "complete"],
	management_review: ["read", "create", "update"],
	settings: ["read", "update"],
	export: ["create"],
} as const;

export const ac = createAccessControl(statements);

const readAll = {
	control: ["read"],
	document: ["read"],
	process: ["read"],
	risk: ["read"],
	incident: ["read"],
	provider: ["read"],
	asset: ["read"],
	evidence: ["read"],
	milestone: ["read"],
	task: ["read"],
	comment: ["read", "create"],
	resolution: ["read"],
	approval: ["read"],
	audit_request: ["read"],
	audit_finding: ["read"],
	organisation: ["read"],
	role_assignment: ["read"],
	audit: ["read"],
	nonconformity: ["read"],
	complaint: ["read"],
	obligation: ["read"],
	management_review: ["read"],
	settings: ["read"],
} as const;

export const viewer = ac.newRole({
	...memberAc.statements,
	...readAll,
});

export const auditor = ac.newRole({
	...memberAc.statements,
	...readAll,
	audit_request: ["read", "create", "decide"],
	audit_finding: ["read", "create", "update"],
});

export const editor = ac.newRole({
	...memberAc.statements,
	control: ["read", "update", "assign"],
	document: ["read", "create", "update", "delete"],
	process: ["read", "create", "update", "delete"],
	risk: ["read", "create", "update", "delete"],
	incident: ["read", "create", "update", "close"],
	provider: ["read", "create", "update", "delete"],
	asset: ["read", "create", "update", "delete"],
	evidence: ["read", "create", "delete"],
	milestone: ["read", "create", "update"],
	task: ["read", "create", "update", "complete"],
	comment: ["read", "create"],
	resolution: ["read"],
	approval: ["read", "decide"],
	audit_request: ["read", "respond"],
	audit_finding: ["read"],
	organisation: ["read", "update"],
	role_assignment: ["read"],
	audit: ["read", "create", "update"],
	nonconformity: ["read", "create", "update"],
	complaint: ["read", "create", "update"],
	whistleblowing: ["read", "create", "update"],
	obligation: ["read", "update", "complete"],
	management_review: ["read", "create", "update"],
	settings: ["read"],
	export: ["create"],
});

export const owner = ac.newRole({
	...ownerAc.statements,
	control: ["read", "update", "assign"],
	document: ["read", "create", "update", "approve", "publish", "delete"],
	process: ["read", "create", "update", "delete"],
	risk: ["read", "create", "update", "accept", "delete"],
	incident: ["read", "create", "update", "close"],
	provider: ["read", "create", "update", "delete"],
	asset: ["read", "create", "update", "delete"],
	evidence: ["read", "create", "delete"],
	milestone: ["read", "create", "update"],
	task: ["read", "create", "update", "complete"],
	comment: ["read", "create"],
	resolution: ["read", "create"],
	approval: ["read", "decide"],
	audit_request: ["read", "create", "respond", "decide"],
	audit_finding: ["read", "create", "update"],
	organisation: ["read", "update"],
	role_assignment: ["read", "update"],
	audit: ["read", "create", "update"],
	nonconformity: ["read", "create", "update", "close"],
	complaint: ["read", "create", "update"],
	whistleblowing: ["read", "create", "update"],
	obligation: ["read", "update", "complete"],
	management_review: ["read", "create", "update"],
	settings: ["read", "update"],
	export: ["create"],
});

// Better Auth erwartet die Rolle "admin" in der Role-Map nicht zwingend;
// wir mappen sie auf owner, damit Default-Checks des Plugins nicht brechen.
export const roles = { owner, editor, viewer, auditor, admin: owner } as const;

export type OrgRole = "owner" | "editor" | "viewer" | "auditor";
export const ORG_ROLES: readonly OrgRole[] = [
	"owner",
	"editor",
	"viewer",
	"auditor",
];

export type Resource = keyof typeof statements;
export type Permission<R extends Resource = Resource> = {
	[K in R]: readonly (typeof statements)[K][number][];
};

// Synchrone Prüfung ohne DB (für Guards nach dem Member-Lookup).
export function roleAllows(
	role: string,
	permission: Partial<Record<Resource, readonly string[]>>,
): boolean {
	const r = roles[role as keyof typeof roles];
	if (!r) return false;
	// biome-ignore lint/suspicious/noExplicitAny: Better-Auth-Role-API ist generisch
	const res = r.authorize(permission as any);
	return res.success;
}

export { adminAc };
