// Bereiche der Einstellungen als gruppierte Liste (Apple HIG, Muster der
// iOS-Einstellungen): am Handy erst die Liste, dann der Bereich mit Rückweg;
// ab Desktop Liste links, Bereich rechts. Der Bereich steht in ?tab= (alte
// Links bleiben gültig). Pure, getestet.

export const SETTINGS_GROUPS = ["account", "org", "methods"] as const;
export type SettingsGroup = (typeof SETTINGS_GROUPS)[number];

export const SETTINGS_SECTIONS = [
	{ key: "security", group: "account" },
	{ key: "notifications", group: "account" },
	{ key: "organisation", group: "org" },
	{ key: "frameworks", group: "org" },
	{ key: "rollen", group: "org", needs: "settings" },
	{ key: "sso", group: "org" },
	{ key: "portal", group: "org", needs: "settings" },
	{ key: "integrationen", group: "org", needs: "integrations" },
	// Lockbox (Härtung A3): alle internen und externen Mitglieder sehen die
	// Zugriffe durch Klick, entscheiden dürfen Inhaber:innen und GL
	{ key: "zugriffe", group: "org" },
	// Vier-Augen (Härtung A4): offene Anträge sehen alle, zustimmen dürfen
	// andere Inhaber:innen und GL
	{ key: "sicherheitsaenderungen", group: "org" },
	{ key: "abo", group: "org", needs: "settings" },
	{ key: "workflows", group: "methods" },
	{ key: "audits", group: "methods" },
	{ key: "risk", group: "methods" },
	{ key: "lieferanten", group: "methods" },
	{ key: "numbering", group: "methods" },
] as const satisfies readonly {
	key: string;
	group: SettingsGroup;
	needs?: "settings" | "integrations";
}[];

export type SettingsSectionKey = (typeof SETTINGS_SECTIONS)[number]["key"];

export const DEFAULT_SETTINGS_SECTION: SettingsSectionKey = "security";

// Sichtbar je Recht: Rollen und Abo nur mit settings:update, Integrationen
// mit integration:read; Mitarbeitende nur ihr Konto
export function visibleSettingsSections(can: {
	settings: boolean;
	integrations: boolean;
	accountOnly?: boolean;
}): SettingsSectionKey[] {
	return SETTINGS_SECTIONS.filter((s) => {
		if (can.accountOnly) return s.group === "account";
		const needs = "needs" in s ? s.needs : undefined;
		if (needs === "settings") return can.settings;
		if (needs === "integrations") return can.integrations;
		return true;
	}).map((s) => s.key);
}

// Gruppen in fester Reihenfolge, leere entfallen
export function settingsGroups(
	visible: readonly SettingsSectionKey[],
): { group: SettingsGroup; keys: SettingsSectionKey[] }[] {
	const shown = new Set(visible);
	return SETTINGS_GROUPS.map((group) => ({
		group,
		keys: SETTINGS_SECTIONS.filter(
			(s) => s.group === group && shown.has(s.key),
		).map((s) => s.key),
	})).filter((g) => g.keys.length > 0);
}

// ?tab= → Bereich. „chosen“ = ausdrücklich gewählt (am Handy dann ohne Liste);
// unbekannte oder nicht sichtbare Werte fallen auf den Standard zurück.
export function resolveSettingsSection(
	tab: string | undefined,
	visible: readonly SettingsSectionKey[],
): { key: SettingsSectionKey; chosen: boolean } {
	const hit = visible.find((k) => k === tab);
	return hit
		? { key: hit, chosen: true }
		: { key: DEFAULT_SETTINGS_SECTION, chosen: false };
}
