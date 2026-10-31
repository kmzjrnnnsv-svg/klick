// Berechtigungsmodell (Better Auth Access Control).
//
// Sechs Org-Rollen:
//   employee   — Mitarbeitende: gültige Richtlinien laut Verteiler lesen,
//                Kenntnisnahme bestätigen, freigegebene Nachweise lesen
//   viewer     — lesen + kommentieren
//   auditor    — viewer + Nachweisanfragen + Findings; zeitlich begrenzt über
//                member_access.accessUntil (Prüfer-Sicht)
//   consultant — Berater:in (extern, ADR-018): wie editor, aber ohne Löschen,
//                ohne Freigaben, Risikoakzeptanz und Hinweisgeber-Fälle;
//                zeitlich begrenzt, darf in mehreren Organisationen sein
//   editor     — alles außer Beschlüssen, Mitgliedern, Einstellungen
//   owner      — alles
//
// Dazu eigene Rollen je Organisation (org_roles, ADR-020): sie geben Rechte
// aus dem Katalog (lib/auth/permission-catalog.ts) ZUSÄTZLICH zur Grundrolle.
// Geprüft wird über die effektiven Rechte am Kontext (`allows(ctx, …)`).
//
// Freigabe-Entscheidungen hängen zusätzlich an der Freigabestufe (Funktion,
// Rolle, Person …) — das prüft lib/approvals, nicht dieses Statement-Modell.
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
	// Pflichtschulungen und Schulungsplan; propose = vorschlagen (Freigabe)
	training: ["read", "create", "update", "propose"],
	comment: ["read", "create"],
	resolution: ["read", "create"],
	// Entscheidung beim Management anfragen (decision_requests)
	decision: ["read", "create"],
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
	aml: ["read", "create", "update", "approve"],
	own_funds: ["read", "create", "update", "approve"],
	crypto_asset: ["read", "create", "update"],
	shareholder: ["read", "create", "update"],
	privacy: ["read", "create", "update"],
	// Gap-Analyse/Fragebögen: answer = Fragen beantworten, review = Antworten
	// bewerten, apply = Ergebnis in den Control-Status übernehmen
	assessment: ["read", "create", "answer", "review", "apply"],
	// Eigene Rahmenwerke der Org (R4): anlegen und pflegen; einschalten und
	// zurückziehen braucht settings:update mit Step-up
	custom_framework: ["read", "create", "update"],
	product: ["read", "create", "update", "delete"],
	// Security-Checks: accept = Befund mit Begründung und Ablauf akzeptieren
	security: ["read", "create", "update", "accept"],
	// Zugangstoken für CI/API (ADR-017)
	integration: ["read", "create", "revoke"],
	// Richtlinien für Mitarbeitende (/richtlinien): gültige Fassungen laut
	// Verteiler, Kenntnisnahme, für Mitarbeitende freigegebene Nachweise
	policy: ["read"],
	acknowledgement: ["create"],
	evidence_shared: ["read"],
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
	training: ["read"],
	comment: ["read", "create"],
	resolution: ["read"],
	decision: ["read"],
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
	aml: ["read"],
	own_funds: ["read"],
	crypto_asset: ["read"],
	shareholder: ["read"],
	privacy: ["read"],
	assessment: ["read"],
	custom_framework: ["read"],
	product: ["read"],
	security: ["read"],
	policy: ["read"],
	evidence_shared: ["read"],
	acknowledgement: ["create"],
} as const;

export const employee = ac.newRole({
	...memberAc.statements,
	policy: ["read"],
	acknowledgement: ["create"],
	evidence_shared: ["read"],
});

export const viewer = ac.newRole({
	...memberAc.statements,
	...readAll,
});

export const auditor = ac.newRole({
	...memberAc.statements,
	...readAll,
	audit_request: ["read", "create", "decide"],
	audit_finding: ["read", "create", "update"],
	// Prüfer:innen dürfen Abweichungen anlegen (auch aus Findings), aber nicht
	// bearbeiten oder schließen — die Umsetzung bleibt bei der Organisation.
	nonconformity: ["read", "create"],
	// Prüfer:innen/Berater:innen bewerten Antworten, übernehmen aber nichts.
	assessment: ["read", "review"],
	product: ["read"],
});

export const editor = ac.newRole({
	...memberAc.statements,
	control: ["read", "update", "assign"],
	document: ["read", "create", "update", "delete"],
	process: ["read", "create", "update", "delete"],
	// Akzeptieren lief bisher über update und bleibt erlaubt — jetzt als
	// eigenes Recht geprüft (Berater:innen haben es nicht, ADR-018)
	risk: ["read", "create", "update", "accept", "delete"],
	incident: ["read", "create", "update", "close"],
	provider: ["read", "create", "update", "delete"],
	asset: ["read", "create", "update", "delete"],
	evidence: ["read", "create", "delete"],
	milestone: ["read", "create", "update"],
	task: ["read", "create", "update", "complete"],
	training: ["read", "create", "update", "propose"],
	comment: ["read", "create"],
	resolution: ["read"],
	decision: ["read", "create"],
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
	aml: ["read", "create", "update"],
	own_funds: ["read", "create", "update"],
	crypto_asset: ["read", "create", "update"],
	shareholder: ["read", "create", "update"],
	privacy: ["read", "create", "update"],
	assessment: ["read", "create", "answer", "review", "apply"],
	custom_framework: ["read", "create", "update"],
	product: ["read", "create", "update", "delete"],
	security: ["read", "create", "update", "accept"],
	integration: ["read"],
	policy: ["read"],
	acknowledgement: ["create"],
	evidence_shared: ["read"],
});

// Berater:in: arbeitet mit, entscheidet nicht. Kein delete, kein
// approval:decide, kein security:accept, keine Hinweisgeber-Fälle
// (whistleblowing), keine Integrationen anlegen; Team und Einstellungen
// bleiben beim Owner. Vertrauliche Detailbereiche (AML, Personal,
// Beschwerden, streng geheime Nachweise) nur mit Grant (isExternal).
export const consultant = ac.newRole({
	...memberAc.statements,
	control: ["read", "update", "assign"],
	document: ["read", "create", "update"],
	process: ["read", "create", "update"],
	// Risiken akzeptieren und Vorfälle schließen sind Entscheidungen der
	// Organisation — seit sie als eigene Rechte geprüft werden, gilt das auch
	// tatsächlich (vorher reichte update)
	risk: ["read", "create", "update"],
	incident: ["read", "create", "update"],
	provider: ["read", "create", "update"],
	asset: ["read", "create", "update"],
	evidence: ["read", "create"],
	milestone: ["read", "create", "update"],
	task: ["read", "create", "update", "complete"],
	training: ["read", "create", "update", "propose"],
	comment: ["read", "create"],
	resolution: ["read"],
	decision: ["read", "create"],
	approval: ["read"],
	audit_request: ["read", "respond"],
	audit_finding: ["read"],
	organisation: ["read", "update"],
	role_assignment: ["read"],
	audit: ["read", "create", "update"],
	nonconformity: ["read", "create", "update"],
	complaint: ["read", "create", "update"],
	obligation: ["read", "update", "complete"],
	management_review: ["read", "create", "update"],
	settings: ["read"],
	export: ["create"],
	aml: ["read", "create", "update"],
	own_funds: ["read", "create", "update"],
	crypto_asset: ["read", "create", "update"],
	shareholder: ["read", "create", "update"],
	privacy: ["read", "create", "update"],
	assessment: ["read", "create", "answer", "review", "apply"],
	custom_framework: ["read", "create", "update"],
	product: ["read", "create", "update"],
	security: ["read", "create", "update"],
	integration: ["read"],
	policy: ["read"],
	acknowledgement: ["create"],
	evidence_shared: ["read"],
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
	training: ["read", "create", "update", "propose"],
	comment: ["read", "create"],
	resolution: ["read", "create"],
	decision: ["read", "create"],
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
	aml: ["read", "create", "update", "approve"],
	own_funds: ["read", "create", "update", "approve"],
	crypto_asset: ["read", "create", "update"],
	shareholder: ["read", "create", "update"],
	privacy: ["read", "create", "update"],
	assessment: ["read", "create", "answer", "review", "apply"],
	custom_framework: ["read", "create", "update"],
	product: ["read", "create", "update", "delete"],
	security: ["read", "create", "update", "accept"],
	integration: ["read", "create", "revoke"],
	policy: ["read"],
	acknowledgement: ["create"],
	evidence_shared: ["read"],
});

// Better Auth erwartet die Rolle "admin" in der Role-Map nicht zwingend;
// wir mappen sie auf owner, damit Default-Checks des Plugins nicht brechen.
export const roles = {
	owner,
	editor,
	consultant,
	viewer,
	auditor,
	employee,
	admin: owner,
} as const;

export { ORG_ROLES, type OrgRole } from "./session-rules";

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

// Rechte einer Grundrolle als einfache Map (für eigene Rollen und Anzeige)
export function roleStatements(role: string): RolePermissions {
	const r = roles[role as keyof typeof roles];
	if (!r) return {};
	const out: RolePermissions = {};
	for (const [res, acts] of Object.entries(
		r.statements as Record<string, readonly string[]>,
	)) {
		if (acts.length > 0) out[res as Resource] = [...acts];
	}
	return out;
}

export type RolePermissions = Partial<Record<Resource, string[]>>;

// Prüfung gegen effektive Rechte (Grundrolle ∪ eigene Rollen)
export function permissionsAllow(
	perms: RolePermissions,
	required: Partial<Record<Resource, readonly string[]>>,
): boolean {
	for (const [res, acts] of Object.entries(required)) {
		const have = perms[res as Resource] ?? [];
		for (const a of acts ?? []) if (!have.includes(a)) return false;
	}
	return true;
}

// Seiten und Actions: `allows(ctx, { risk: ["create"] })` statt
// roleAllows(ctx.orgRole, …) — berücksichtigt eigene Rollen.
export function allows(
	ctx: { permissions: RolePermissions },
	required: Partial<Record<Resource, readonly string[]>>,
): boolean {
	return permissionsAllow(ctx.permissions, required);
}

export { adminAc };
