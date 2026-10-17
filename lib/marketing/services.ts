import {
	formatPrice,
	guidedFrom,
	type PriceTable,
} from "@/lib/pricing/resolve";

// Beratungsleistungen für /leistungen — Inhalt (DE, Du-Form). Ablauf und
// Ergebnisdateien entsprechen dem, was Klick tatsächlich erzeugt
// (Exporte unter /api/export/*). Preise kommen aus dem Admin-CMS
// (Standard-Preisgruppe, lib/pricing) — hier stehen keine Beträge.

export type ServiceStep = {
	when: string;
	title: string;
	note: string;
	files?: string[];
};

export type Service = {
	key: "gap" | "ai-check" | "cra" | "suppliers" | "pentest";
	name: string;
	short: string;
	duration: string;
	fits: string;
	result: string;
	steps: ServiceStep[];
};

export const SERVICES: readonly Service[] = [
	{
		key: "gap",
		name: "Gap-Analyse & Prüfungsreife",
		short: "Gap-Analyse",
		duration: "2–4 Wochen",
		fits: "Du willst wissen, wie weit ihr von ISO 27001, NIS2, DORA oder CRA entfernt seid – und was zuerst kommt.",
		result:
			"Bewertung je Control, Prüfungsreife-Wert mit Stichtag und ein Maßnahmenplan nach Hebel und Aufwand.",
		steps: [
			{
				when: "Tag 1",
				title: "Rahmenwerke festlegen",
				note: "Gemeinsame Controls fragen wir nur einmal ab.",
			},
			{
				when: "Woche 1",
				title: "Fragebogen mit Dokumenten",
				note: "Eine Frage je Control, Nachweise direkt an der Frage.",
			},
			{
				when: "Woche 2",
				title: "Bewertung",
				note: "Bestätigt oder abweichend bewertet; unbelegt zählt halb.",
			},
			{
				when: "Woche 3",
				title: "Maßnahmenplan",
				note: "Priorisiert nach Wirkung, mit Aufwand und Frist.",
				files: ["gap-analyse.md", "pruefungsreife.md"],
			},
		],
	},
	{
		key: "ai-check",
		name: "Security-Check für KI-gebaute Apps",
		short: "KI-App-Check",
		duration: "3–5 Arbeitstage",
		fits: "Eure App entstand schnell mit KI-Werkzeugen und soll jetzt echte Kundendaten sehen.",
		result:
			"Ampel, die fünf dringendsten Schritte und für jeden Befund die Abhilfe für euren Stack.",
		steps: [
			{
				when: "Tag 1",
				title: "Schnellcheck der Live-Adresse",
				note: "Passiv: Header, TLS, DNS, Schlüssel im JavaScript, Source-Maps.",
			},
			{
				when: "Tag 1–2",
				title: "Scans in eurer CI",
				note: "Abhängigkeiten, Code, Secrets – per fertiger Vorlage.",
			},
			{
				when: "Tag 2–4",
				title: "Review der typischen Fehler",
				note: "Offene Datenbankregeln, Service-Schlüssel im Browser, Auth, Rate-Limits.",
			},
			{
				when: "Tag 5",
				title: "Bericht und Besprechung",
				note: "Mit Nachweis im Testprogramm.",
				files: ["sicherheitsbericht.md"],
			},
		],
	},
	{
		key: "cra",
		name: "CRA-Readiness",
		short: "CRA-Readiness",
		duration: "2–3 Wochen",
		fits: "Eure Software oder Geräte kommen in der EU auf den Markt. Meldepflichten gelten seit 11.09.2026, alles andere ab 11.12.2027.",
		result:
			"Einstufung und Konformitätsweg je Produkt, geprüfte SBOM, Produktcheckliste und ein Meldeprozess, der in 24 Stunden trägt.",
		steps: [
			{
				when: "Woche 1",
				title: "Einstufung je Produkt",
				note: "Anwendungsbereich, Klasse, Konformitätsweg nach Art. 32.",
			},
			{
				when: "Woche 1–2",
				title: "SBOM-Prüfung",
				note: "CycloneDX oder SPDX nach BSI TR-03183-2.",
			},
			{
				when: "Woche 2",
				title: "Checkliste Anhang I",
				note: "Secure by Default, Updates, Supportzeitraum.",
			},
			{
				when: "Woche 3",
				title: "Meldeprozess Art. 14",
				note: "Meldeuhr 24 h / 72 h, CVD-Richtlinie, security.txt.",
				files: ["00_Management-Summary.md", "04_CRA-Pruefungsreife.md"],
			},
		],
	},
	{
		key: "suppliers",
		name: "Lieferantenprüfung für Software",
		short: "Lieferanten",
		duration: "2–6 Wochen",
		fits: "NIS2 oder DORA verlangen, dass ihr eure Software- und IKT-Lieferanten bewertet – nachweisbar.",
		result:
			"Rating A–D je Lieferant, Sorgfaltsprüfung mit Entscheidung, Vertragsprüfung nach DORA Art. 30 und Wiedervorlage.",
		steps: [
			{
				when: "Woche 1",
				title: "Lieferanten einstufen",
				note: "Kritikalität und passender Fragebogen je Lieferant.",
			},
			{
				when: "Woche 1–4",
				title: "Fragebogen per Link",
				note: "Ohne Konto, Nachweise per Upload, Erinnerung nach 14 Tagen.",
			},
			{
				when: "laufend",
				title: "Bewertung",
				note: "K.-o.-Fragen, Rating, Klauseln nach Art. 30.",
			},
			{
				when: "Ende",
				title: "Entscheidung je Lieferant",
				note: "Freigabe, Auflagen oder Ablehnung – mit Folgeaufgabe.",
				files: ["informationsregister.zip"],
			},
		],
	},
	{
		key: "pentest",
		name: "Penetrationstest",
		short: "Pentest",
		duration: "5–8 Testtage + Nachtest",
		fits: "Web-App oder API vor dem Go-live, jährlich oder weil Aufsicht und Kunden es verlangen.",
		result:
			"Befunde mit CVSS und Reproduktion, Management-Summary, Nachtest je Befund – und der Eintrag im Testprogramm.",
		steps: [
			{
				when: "vorab",
				title: "Beauftragung und Regeln",
				note: "Schriftlich, mit Zielen, Zeitfenster und Notfallkontakt.",
			},
			{
				when: "Tag 1–5",
				title: "Test",
				note: "OWASP WSTG und ASVS, Grey-Box mit Testkonten je Rolle.",
			},
			{
				when: "Tag 6–7",
				title: "Bericht",
				note: "Befunde mit CVSS, Reproduktion und Empfehlung.",
				files: ["00_Management-Summary.md", "02_Befunde.md", "befunde.csv"],
			},
			{
				when: "+30 Tage",
				title: "Nachtest",
				note: "Je Befund bestanden oder nicht – im Bericht nachgetragen.",
				files: ["03_Nachtest.md"],
			},
		],
	},
];

export const servicePrice = (key: Service["key"], prices: PriceTable) =>
	formatPrice(prices[`svc:${key}`]);

export const PLANS = [
	{ key: "self", name: "Selbst mit Klick" },
	{ key: "guided", name: "Begleitet" },
	{ key: "done", name: "Durchgeführt" },
] as const;

// Preiszeile je Weg: Selbst = Abo Start, Begleitet = günstigste Leistung,
// Durchgeführt = nach Umfang.
export function planPrice(
	key: (typeof PLANS)[number]["key"],
	prices: PriceTable,
): { price: string; period: string } {
	if (key === "self") {
		const p = prices["plan:start"];
		return {
			price: formatPrice(p, { unit: false }),
			period: p.mode === "on_request" ? "nach Umfang" : (p.unit ?? "im Monat"),
		};
	}
	if (key === "guided")
		return {
			price: formatPrice(guidedFrom(prices)),
			period: "Festpreis je Leistung",
		};
	return { price: "auf Anfrage", period: "nach Umfang" };
}

export const PLAN_ROWS: readonly {
	label: string;
	values: readonly [string, string, string];
}[] = [
	{
		label: "Gap-Analyse",
		values: ["Fragebogen selbst", "wir bewerten mit", "wir führen durch"],
	},
	{
		label: "Maßnahmenplan",
		values: ["abgeleitet", "besprochen", "mit Umsetzung"],
	},
	{
		label: "Security-Check",
		values: ["Schnellcheck, Scans", "plus Review", "plus Review"],
	},
	{
		label: "Pentest",
		values: ["Auftrag verwalten", "nicht enthalten", "durch Tester"],
	},
	{
		label: "Lieferanten",
		values: ["Portal und Rating", "Bewertung mit uns", "komplett"],
	},
	{
		label: "Ergebnis",
		values: ["Exporte", "Paket mit Manifest", "Paket mit Manifest"],
	},
	{
		label: "Ansprechpartner",
		values: ["Hilfe-Center", "feste Person", "feste Person"],
	},
];

export const FAQ: readonly { q: string; a: string }[] = [
	{
		q: "Brauchen wir dafür ein Klick-Abo?",
		a: "Nein. Du bekommst das Ergebnis als Paket mit Manifest, lesbar ohne Klick. Wer danach selbst weiterarbeitet, übernimmt alles in den eigenen Klick-Mandanten.",
	},
	{
		q: "Ist ein Pentest überhaupt erlaubt?",
		a: "Nur mit schriftlicher Beauftragung durch alle Verantwortlichen der Ziele. Ohne sie lässt Klick den Auftrag nicht auf „beauftragt“ springen, und wir fangen nicht an.",
	},
	{
		q: "Was ist an KI-gebauten Apps anders?",
		a: "Die Fehler sind vorhersehbar: Datenbankregeln, die alles erlauben, Service-Schlüssel im Browser, Logins ohne Rate-Limit. Genau darauf prüft der Security-Check zuerst.",
	},
	{
		q: "Wer sieht unsere Daten?",
		a: "Nur berechtigte Personen. Nachweise liegen verschlüsselt mit einem eigenen Schlüssel je Organisation auf Servern in Deutschland und werden beim Hochladen auf Schadsoftware und Geheimnisse geprüft.",
	},
	{
		q: "Wie aufwendig ist es für unsere Lieferanten?",
		a: "Ein Link per Mail, kein Konto, je nach Fragebogen 9 bis 19 Fragen. Nachweise laden sie direkt hoch; nach 14 Tagen erinnern wir.",
	},
	{
		q: "Ersetzt das eine Zertifizierung?",
		a: "Nein. Gap-Analyse und Prüfungsreife bereiten auf das Audit vor. Das Testat stellt die Zertifizierungsstelle oder Prüfer:in aus.",
	},
	{
		q: "Sind die Preise fest?",
		a: "Nach dem Erstgespräch bekommst du einen Festpreis für den vereinbarten Umfang. Die Werte hier sind Richtwerte für typische Umfänge.",
	},
];
