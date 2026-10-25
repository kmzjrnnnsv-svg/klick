import type { FindingCategory } from "@/db/schema/enums";

// Erklärung und Abhilfe je Befundfamilie — Lieferobjekt „Security-Check für
// KI-gebaute Apps“. Konkrete Hinweise für die typischen Stacks (Next.js,
// Supabase, Vercel); Tool-eigene Abhilfetexte am Befund gehen vor.

export type Remediation = { why: string; fix: string[] };

const BY_RULE: { match: RegExp; r: Remediation }[] = [
	{
		match: /^qc-bundle-supabase_service_role$/,
		r: {
			why: "Der service_role-Key umgeht Row Level Security. Wer ihn aus dem Browser-Bundle liest, kann alle Tabellen lesen und schreiben.",
			fix: [
				"Key sofort im Supabase-Dashboard rotieren (Settings > API).",
				"Im Browser nur den anon-Key verwenden; jede Tabelle mit RLS-Policies absichern.",
				"Aufrufe, die den service_role-Key brauchen, in Server Actions, Route Handler oder Edge Functions verlegen.",
				"Variablen mit NEXT_PUBLIC_-Präfix landen im Bundle — Secrets nie so benennen.",
			],
		},
	},
	{
		match: /^qc-bundle-/,
		r: {
			why: "Alles im ausgelieferten JavaScript ist öffentlich — ein Secret dort ist kompromittiert.",
			fix: [
				"Schlüssel beim Anbieter widerrufen und neu ausstellen.",
				"Aufrufe mit Secrets serverseitig ausführen (Route Handler/Server Action); Secrets nur als Server-Umgebungsvariablen (ohne NEXT_PUBLIC_).",
				"Secret-Scanning (gitleaks) in die CI aufnehmen.",
			],
		},
	},
	{
		match: /^qc-(csp|clickjacking|nosniff|referrer-policy|hsts)/,
		r: {
			why: "Sicherheits-Header sind die günstigste Verteidigung gegen XSS, Clickjacking und Downgrade-Angriffe.",
			fix: [
				"Next.js: Header in next.config (headers()) oder in middleware/proxy setzen; CSP mit Nonce je Request.",
				'Vercel: alternativ in vercel.json unter "headers".',
				"Mit securityheaders.com oder dem Schnellcheck nachprüfen.",
			],
		},
	},
	{
		match: /^qc-sourcemap$/,
		r: {
			why: "Öffentliche Source-Maps liefern den Original-Quellcode samt Kommentaren und internen Pfaden.",
			fix: [
				"Next.js: productionBrowserSourceMaps nicht aktivieren (Standard: aus).",
				"Source-Maps nur an das Fehler-Tracking hochladen und danach aus dem Build entfernen.",
			],
		},
	},
	{
		match: /^qc-cookie-/,
		r: {
			why: "Ungeschützte Cookies erleichtern Session-Diebstahl (XSS, Mitlesen im Netz, CSRF).",
			fix: [
				'Next.js: cookies().set(name, value, { httpOnly: true, secure: true, sameSite: "lax" }).',
				"Supabase Auth-Helper: Cookie-Optionen entsprechend setzen.",
			],
		},
	},
	{
		match: /^qc-(spf|dmarc|caa)/,
		r: {
			why: "Ohne SPF/DMARC lassen sich E-Mails im Namen der Domain leichter fälschen (Phishing, CEO-Fraud).",
			fix: [
				"SPF mit allen legitimen Versendern und -all anlegen.",
				"DMARC mit p=quarantine starten, Berichte auswerten, dann p=reject.",
			],
		},
	},
	{
		match: /^qc-security-txt/,
		r: {
			why: "Ohne Meldeweg landen Schwachstellenhinweise nirgends — für Produkte nach CRA ist eine Kontaktstelle Pflicht.",
			fix: [
				"/.well-known/security.txt mit Contact, Expires, Policy veröffentlichen (Vorlage VL-SECURITY-TXT).",
				"Richtlinie zur koordinierten Offenlegung (RL-CVD) verlinken.",
			],
		},
	},
	{
		match: /^qc-tls|^qc-no-https/,
		r: {
			why: "Ohne gültiges TLS sind Zugangsdaten und Sitzungen im Netz angreifbar.",
			fix: [
				"Zertifikat automatisch erneuern (ACME/Let's Encrypt; Vercel macht das selbst).",
				"Nur TLS 1.2/1.3, HTTP auf HTTPS umleiten, HSTS setzen.",
			],
		},
	},
];

const BY_CATEGORY: Record<FindingCategory, Remediation> = {
	dependency: {
		why: "Bekannte Schwachstellen in Abhängigkeiten sind der häufigste Einstieg — Exploits sind öffentlich.",
		fix: [
			"Auf die genannte Fix-Version aktualisieren (pnpm up / npm update), Lockfile committen.",
			"Dependabot oder Renovate aktivieren; Scan (Trivy/OSV) in jeder CI-Pipeline.",
			"Nicht behebbar? Erreichbarkeit prüfen und den Befund mit Begründung und Ablauf akzeptieren.",
		],
	},
	secret: {
		why: "Ein Secret im Code oder in der Git-Historie gilt als kompromittiert.",
		fix: [
			"Secret beim Anbieter widerrufen und neu ausstellen — Löschen aus dem Code reicht nicht.",
			"Aus der Historie entfernen (git filter-repo) und Zugriffe im Zeitraum prüfen.",
			"gitleaks als Pre-Commit-Hook und in der CI.",
		],
	},
	code: {
		why: "Unsichere Muster im eigenen Code (Injection, XSS, fehlende Prüfungen).",
		fix: [
			"Fundstelle beheben (Eingaben validieren, parametrisierte Abfragen, Ausgaben kodieren).",
			"Statische Analyse (Opengrep) als CI-Gate für neue Befunde.",
		],
	},
	config: {
		why: "Fehlkonfigurationen öffnen Angriffsfläche ohne eine Zeile fehlerhaften Codes.",
		fix: [
			"Härtungs-Baseline anwenden und als Code versionieren (IaC-Scan in der CI).",
		],
	},
	web: {
		why: "Webanwendungs-Befunde (DAST) zeigen, was ein Angreifer von außen sieht.",
		fix: ["Befund nachstellen, beheben, mit dem nächsten Scan bestätigen."],
	},
	tls: {
		why: "Transportverschlüsselung schützt Zugangsdaten und Daten im Netz.",
		fix: ["TLS-Konfiguration nach BSI TR-02102-2 bzw. Mozilla „intermediate“."],
	},
	dns: {
		why: "DNS-Einträge steuern E-Mail-Authentizität und Zertifikatsausstellung.",
		fix: ["SPF, DMARC und CAA pflegen."],
	},
	exposure: {
		why: "Öffentlich erreichbare interne Informationen erleichtern gezielte Angriffe.",
		fix: [
			"Nicht benötigte Dateien und Versionsangaben aus der Auslieferung entfernen.",
		],
	},
	other: {
		why: "Sonstiger Befund aus dem Scan.",
		fix: ["Befund prüfen und mit Begründung beheben oder akzeptieren."],
	},
};

export function remediationFor(
	ruleId: string,
	category: FindingCategory,
): Remediation {
	return BY_RULE.find((x) => x.match.test(ruleId))?.r ?? BY_CATEGORY[category];
}
