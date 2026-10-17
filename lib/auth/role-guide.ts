import { type OrgRole, type Resource, roleAllows } from "./permissions";

// „Wer darf was“ in Klartext — abgeleitet aus dem echten Rechtemodell
// (roleAllows), damit Rollen-Karten, Rollenwechsel-Dialog und die Erklärung
// auf /team nie vom Verhalten der Guards abweichen. Texte: Team.cap_<key>.

type Check = Partial<Record<Resource, readonly string[]>>;

export const CAPABILITIES = [
	{ key: "read", check: { control: ["read"], document: ["read"] } },
	{ key: "comment", check: { comment: ["create"] } },
	{ key: "work", check: { risk: ["create"], document: ["create"] } },
	{ key: "decide", check: { approval: ["decide"] } },
	{ key: "publish", check: { document: ["publish"] } },
	{ key: "auditRequests", check: { audit_request: ["create"] } },
	{ key: "resolutions", check: { resolution: ["create"] } },
	{ key: "export", check: { export: ["create"] } },
	{ key: "team", check: { member: ["create"] } },
	{ key: "settings", check: { settings: ["update"] } },
] as const satisfies readonly { key: string; check: Check }[];

export type CapabilityKey = (typeof CAPABILITIES)[number]["key"];

export function capabilitiesFor(
	role: OrgRole,
): { key: CapabilityKey; allowed: boolean }[] {
	return CAPABILITIES.map((c) => ({
		key: c.key,
		allowed: roleAllows(role, c.check),
	}));
}

// Rollenwechsel: was kommt dazu, was fällt weg (für den Bestätigungsdialog).
export function roleChange(
	from: OrgRole,
	to: OrgRole,
): { gains: CapabilityKey[]; losses: CapabilityKey[] } {
	const a = new Map(capabilitiesFor(from).map((c) => [c.key, c.allowed]));
	const b = capabilitiesFor(to);
	return {
		gains: b.filter((c) => c.allowed && !a.get(c.key)).map((c) => c.key),
		losses: b.filter((c) => !c.allowed && a.get(c.key)).map((c) => c.key),
	};
}

// Kann jemand in dieser Rolle Freigaben erteilen? (Funktion allein reicht
// nicht — Lesend/Prüfer:in mit Freigabe-Funktion blockiert den Workflow.)
export function canDecideApprovals(role: string): boolean {
	return roleAllows(role, { approval: ["decide"] });
}

// Reihenfolge der Karten: vom kleinsten zum größten Recht, Prüfer:in extra.
export const ROLE_ORDER: readonly OrgRole[] = [
	"viewer",
	"editor",
	"owner",
	"auditor",
];
