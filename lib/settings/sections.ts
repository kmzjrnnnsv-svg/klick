// Bereiche der Einstellungen als gruppierte Liste (Apple HIG, Muster der
// iOS-Einstellungen): am Handy erst die Liste, dann der Bereich mit Rückweg;
// ab Desktop Liste links, Bereich rechts. Der Bereich steht in ?tab= (alte
// Links bleiben gültig). Pure, getestet.

// Fünf Gruppen (S3, Nov 2026): was dich betrifft, die Organisation, wer
// hinein darf, womit Klick verbunden ist, wie ihr arbeitet.
export const SETTINGS_GROUPS = [
	"account",
	"org",
	"security",
	"connections",
	"methods",
] as const;
export type SettingsGroup = (typeof SETTINGS_GROUPS)[number];

// `terms`: Suchwörter neben Name und Satz (klein, ohne Umlaute nötig)
export const SETTINGS_SECTIONS = [
	{
		key: "security",
		group: "account",
		terms: [
			"passkey",
			"zwei-faktor",
			"totp",
			"sicherheitsschlüssel",
			"sitzung",
		],
	},
	{
		key: "notifications",
		group: "account",
		terms: ["mail", "push", "teams", "tages-mail", "benachrichtigung"],
	},
	{
		key: "organisation",
		group: "org",
		terms: ["stammdaten", "lei", "name", "löschen", "neu beginnen"],
	},
	{
		key: "frameworks",
		group: "org",
		terms: ["iso", "dora", "nis2", "lizenzstufe", "variante", "eigene"],
	},
	{
		key: "rollen",
		group: "org",
		needs: "settings",
		terms: ["rechte", "berechtigung", "abteilung", "eigene rolle"],
	},
	{
		key: "abo",
		group: "org",
		needs: "settings",
		terms: ["preis", "rechnung", "leistung", "anfrage", "berater"],
	},
	{
		key: "sso",
		group: "security",
		terms: ["saml", "oidc", "entra", "microsoft", "google", "okta", "domain"],
	},
	// IP-Liste je Org (Härtung A5): ändern nur Inhaber:innen (Vier-Augen)
	{
		key: "netzwerk",
		group: "security",
		needs: "settings",
		terms: ["ip", "ip-liste", "standort", "tunnel", "vpn", "büro"],
	},
	// Lockbox (Härtung A3): alle internen und externen Mitglieder sehen die
	// Zugriffe durch Klick, entscheiden dürfen Inhaber:innen und GL
	{
		key: "zugriffe",
		group: "security",
		terms: ["lockbox", "support", "impersonation", "freigabe"],
	},
	// Vier-Augen (Härtung A4): offene Anträge sehen alle, zustimmen dürfen
	// andere Inhaber:innen und GL
	{
		key: "sicherheitsaenderungen",
		group: "security",
		terms: ["vier-augen", "wartezeit", "zustimmen", "antrag"],
	},
	// Verlauf mit Bitcoin-Anker (Härtung V): alle Mitglieder und Prüfer:innen
	{
		key: "verlauf",
		group: "security",
		terms: ["audit-log", "protokoll", "bitcoin", "anker", "kette"],
	},
	{
		key: "integrationen",
		group: "connections",
		needs: "integrations",
		terms: ["token", "ci", "scan", "both.money", "teams", "api"],
	},
	{
		key: "portal",
		group: "connections",
		needs: "settings",
		terms: ["mitarbeitende", "richtlinien", "einmal-code", "domain"],
	},
	// KI mit eigenem Schlüssel (ADR-032): ändern nur Inhaber:innen
	{
		key: "ki",
		group: "connections",
		needs: "settings",
		terms: ["claude", "openai", "gemini", "mistral", "azure", "schlüssel"],
	},
	{
		key: "workflows",
		group: "methods",
		terms: ["freigabe", "designer", "vier-augen", "unterschrift", "standard"],
	},
	{
		key: "audits",
		group: "methods",
		terms: ["frist", "turnus", "abweichung", "nebenabweichung"],
	},
	{
		key: "risk",
		group: "methods",
		terms: ["risikomethode", "matrix", "appetit", "bsi 200-3", "stufen"],
	},
	{
		key: "lieferanten",
		group: "methods",
		terms: ["dienstleister", "kriterien", "bewertung", "auslagerung"],
	},
	{
		key: "numbering",
		group: "methods",
		terms: ["nummer", "nummernkreis", "präfix", "dokumentnummer"],
	},
] as const satisfies readonly {
	key: string;
	group: SettingsGroup;
	needs?: "settings" | "integrations";
	terms: readonly string[];
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

// Suche in der Liste (S3): Name, Satz und Suchwörter; Groß-/Kleinschreibung
// und Umlaute egal, jedes Wort der Eingabe muss vorkommen
const fold = (v: string) =>
	v
		.toLowerCase()
		.replace(/ä/g, "a")
		.replace(/ö/g, "o")
		.replace(/ü/g, "u")
		.replace(/ß/g, "ss");

export function matchSettings<T extends { key: SettingsSectionKey }>(
	query: string,
	items: readonly (T & { title: string; hint: string })[],
): T[] {
	const words = fold(query).split(/\s+/).filter(Boolean);
	if (words.length === 0) return [...items];
	const terms = new Map(
		SETTINGS_SECTIONS.map((s) => [s.key, s.terms.join(" ")] as const),
	);
	return items.filter((i) => {
		const text = fold(`${i.title} ${i.hint} ${terms.get(i.key) ?? ""}`);
		return words.every((w) => text.includes(w));
	});
}
