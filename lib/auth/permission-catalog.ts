import {
	type Resource,
	type RolePermissions,
	roleStatements,
	statements,
} from "./permissions";

// Rechte-Katalog für eigene Rollen (ADR-020) — pure, getestet. Eigene Rollen
// geben Rechte ZUSÄTZLICH zur Grundrolle; was hier fehlt, bleibt Inhaber:innen
// vorbehalten (Einstellungen, Team, Integrationen, Funktionen besetzen).

export type PermissionArea = {
	key: string;
	resources: readonly Resource[];
};

export const PERMISSION_AREAS: readonly PermissionArea[] = [
	{
		key: "register",
		resources: ["provider", "asset", "risk", "process", "product"],
	},
	{
		key: "documents",
		resources: ["document", "evidence", "control", "assessment"],
	},
	{
		key: "operations",
		resources: ["incident", "nonconformity", "task", "training", "milestone"],
	},
	{
		key: "governance",
		resources: [
			"approval",
			"decision",
			"resolution",
			"organisation",
			"management_review",
			"obligation",
			"audit",
			"audit_request",
			"audit_finding",
		],
	},
	{
		key: "special",
		resources: [
			"security",
			"privacy",
			"complaint",
			"whistleblowing",
			"aml",
			"own_funds",
			"crypto_asset",
			"wallet",
			"shareholder",
			"export",
		],
	},
];

// Nie über eigene Rollen vergeben: bleibt Inhaber:innen vorbehalten
export const RESERVED: Partial<Record<Resource, readonly string[]>> = {
	settings: ["update"],
	role_assignment: ["update"],
	integration: ["create", "revoke"],
	// Konten, Richtlinie und Echtgeld bleiben Inhaber:innen vorbehalten
	wallet: ["manage"],
};

// Rechte, die keine Aktion prüft (z. B. kein Löschen von Risiken) — im
// Katalog ausgeblendet, damit kein Häkchen ohne Wirkung entsteht
const NOT_ENFORCED: Partial<Record<Resource, readonly string[]>> = {
	document: ["approve", "publish", "delete"],
	risk: ["delete"],
	provider: ["delete"],
	process: ["delete"],
	product: ["delete"],
	task: ["complete"],
};

const GRANTABLE_RESOURCES = new Set<Resource>(
	PERMISSION_AREAS.flatMap((a) => a.resources),
);

// Aktionen einer Ressource, die eine eigene Rolle tragen darf
export function grantableActions(resource: Resource): string[] {
	if (!GRANTABLE_RESOURCES.has(resource)) return [];
	const all = (statements as Record<string, readonly string[]>)[resource] ?? [];
	const hidden = [
		...(RESERVED[resource] ?? []),
		...(NOT_ENFORCED[resource] ?? []),
	];
	return all.filter((a) => !hidden.includes(a));
}

// Gespeicherte Rechte einer eigenen Rolle bereinigen: nur Katalog-Rechte,
// keine Duplikate, stabile Reihenfolge
export function sanitizePermissions(input: unknown): RolePermissions {
	const out: RolePermissions = {};
	if (!input || typeof input !== "object") return out;
	for (const [res, acts] of Object.entries(input as Record<string, unknown>)) {
		const allowed = grantableActions(res as Resource);
		if (allowed.length === 0 || !Array.isArray(acts)) continue;
		const picked = allowed.filter((a) => acts.includes(a));
		if (picked.length > 0) out[res as Resource] = picked;
	}
	return out;
}

export function mergePermissions(
	...parts: readonly RolePermissions[]
): RolePermissions {
	const out: RolePermissions = {};
	for (const p of parts) {
		for (const [res, acts] of Object.entries(p)) {
			const cur = new Set(out[res as Resource] ?? []);
			for (const a of acts ?? []) cur.add(a);
			out[res as Resource] = [...cur];
		}
	}
	return out;
}

// Grundrollen, die eigene Rollen tragen können: nur interne Mitglieder ohne
// Vollzugriff — Inhaber:innen haben ohnehin alles, Externe (ADR-018) nie mehr
export function canHoldCustomRoles(orgRole: string): boolean {
	return orgRole === "editor" || orgRole === "viewer";
}

// Effektive Rechte: Grundrolle ∪ bereinigte eigene Rollen
export function effectivePermissions(
	orgRole: string,
	customRolePermissions: readonly unknown[],
): RolePermissions {
	const base = roleStatements(orgRole);
	if (!canHoldCustomRoles(orgRole) || customRolePermissions.length === 0)
		return base;
	return mergePermissions(
		base,
		...customRolePermissions.map((p) => sanitizePermissions(p)),
	);
}

// Für die Oberfläche: Bereiche → Ressourcen → vergebbare Aktionen
export type CatalogArea = {
	key: string;
	resources: { resource: Resource; actions: string[] }[];
};

export function permissionCatalog(): CatalogArea[] {
	return PERMISSION_AREAS.map((a) => ({
		key: a.key,
		resources: a.resources
			.map((resource) => ({ resource, actions: grantableActions(resource) }))
			.filter((r) => r.actions.length > 0),
	}));
}

// Vorlage „wie Grundrolle X“: deren Rechte, soweit vergebbar
export function grantablePresetOf(orgRole: string): RolePermissions {
	return sanitizePermissions(roleStatements(orgRole));
}
