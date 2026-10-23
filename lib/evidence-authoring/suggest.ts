import { TEMPLATE_BY_KEY } from "./templates";

// Welcher Rohling passt zu einem Nachweis-Hinweis aus dem Katalog? (pure)
// Erste passende Regel gewinnt. Richtlinien, Konzepte, Pläne, Verträge und
// Berichte Dritter sind Dokumente oder Uploads — dafür kein Rohling (null).

export type TemplateSuggestion = { key: string; preset: string | null };

const RULES: readonly [RegExp, string][] = [
	// vor der Dokument-Regel: Checklisten beim Ein- und Austritt
	[
		/(austritt|offboarding|onboarding|eintritt).*check|übergabe|rückgabe/,
		"uebergabe",
	],
	[
		/richtlinie|konzept|leitlinie|handbuch|policy|strategie|vertr[aä]g|klausel|zertifikat|testat|bescheid|dossier|playbook|runbook|vorlage|plan\b|pläne|matrix|modell|schema|prozess|ordnung|arbeitsanweisung|verfahrens|agb|beschluss|register\b|registerauszüg|bericht|report|dashboard|export|repository|lockfile|sbom|advisor|kennzeichnung|release notes|diagramm|architektur/,
		"",
	],
	[/wiederherstell|restore|rücksicherung|backup-test/, "wiederherstellung"],
	[/übung|uebung|failover-test|notfalltest/, "uebung"],
	[
		/rezertifizierung|entzogene rechte|berechtigungsprüfung|access.?review/,
		"rezertifizierung",
	],
	[/change|änderungsprotokoll|änderungshistorie|^freigaben$/, "aenderung"],
	[
		/schulung|teilnahme(?!verein|vertr)|unterweisung|phishing-simulation|awareness/,
		"unterweisung",
	],
	[/begehung|clean.?desk|rundgang/, "begehung"],
	[/befragung|interview/, "befragung"],
	[/checkliste|checklist|prüfliste/, "checkliste"],
	[
		/review|auswertung|alarm|alert|überwachung|monitoring|nutzungsprotokoll|eskalationsprotokoll|screening-protokoll|trefferbearbeitung|kettenprüfung/,
		"auswertung",
	],
	[
		/konfiguration|einstellung|härtung|baseline|tls|hsts|mfa-quote|lockout|session|ntp|zeitquelle|branch-protection|berechtigungen|filterregeln|spf|dkim|dmarc|object-lock|worm|sandbox|allowlist|defaults|regelwerk/,
		"konfiguration",
	],
	[
		/löschprotokoll|sperrprotokoll|rotationsprotokoll|wartungsprotokoll|vergabe und entzug|ident-protokoll/,
		"liste",
	],
	[
		/stichprobe|prüfprotokoll|prüfnachweis|kontrollnachweis|compliance-check|vier-augen|abnahmetest|eingangsprüfung|testnachweis|bewertungsprotokoll|überprüfungsprotokoll|prüfregel/,
		"pruefung",
	],
	[
		/attestierung|bestätigung|erklärung|selbstauskunft|negativnachweis|ownership|zusicherung|nachweise je/,
		"bestaetigung",
	],
	[
		/liste|verzeichnis|inventar|inventur|kataster|mitgliedschaft|kontakt|zutritt|besucher|schlüsselinhaber|privilegierte/,
		"liste",
	],
	[
		/protokoll|sitzung|besprechung|einberufung|lessons|post-mortem|zeremonie/,
		"besprechung",
	],
];

export function suggestTemplate(hint: string): TemplateSuggestion | null {
	const h = hint.replace(/^\(P\)\s*/, "").toLowerCase();
	for (const [re, key] of RULES) {
		if (!re.test(h)) continue;
		if (!key) return null;
		const preset =
			key === "liste"
				? (TEMPLATE_BY_KEY.get("liste")?.presets?.find((p) => p.match.test(h))
						?.key ?? null)
				: null;
		return { key, preset };
	}
	return null;
}
