import type { MemberRole } from "@wallet/db/schema/enums";

// Rechte je Rolle in both.money (pure). Geld bewegt keine Rolle allein:
// Auszahlungen bestätigt der Signer über Sicherheitsschlüssel (ADR-022);
// „wallet:initiate“ legt nur Absichten an.
export const PERMISSIONS = [
	"wallet:read",
	"wallet:initiate",
	"wallet:manage",
	"members:read",
	"members:manage",
	"settings:update",
	"audit:read",
	"export:manage",
	"export:download",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const ROLE_PERMISSIONS: Record<MemberRole, readonly Permission[]> = {
	owner: PERMISSIONS,
	operator: [
		"wallet:read",
		"wallet:initiate",
		"members:read",
		"audit:read",
		"export:download",
	],
	viewer: ["wallet:read", "members:read"],
};

export function roleAllows(role: MemberRole, perm: Permission): boolean {
	return ROLE_PERMISSIONS[role].includes(perm);
}

export function permissionsOf(role: MemberRole): readonly Permission[] {
	return ROLE_PERMISSIONS[role];
}

export const ROLE_LABEL: Record<MemberRole, string> = {
	owner: "Inhaber:in",
	operator: "Bedienung",
	viewer: "Lesend",
};

export function isMemberRole(v: unknown): v is MemberRole {
	return v === "owner" || v === "operator" || v === "viewer";
}
