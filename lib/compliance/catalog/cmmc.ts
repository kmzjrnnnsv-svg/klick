import { NIST171_SPECS } from "./nist-800-171";
import { buildIndex, type Spec } from "./spec";
import type { CatalogSection, FrameworkVariant } from "./types";

// CMMC 2.0 (Cybersecurity Maturity Model Certification, 32 CFR Part 170):
// Prüfprogramm des US-Verteidigungsministeriums für Auftragnehmer. Die Regel
// gilt seit 16. Dezember 2024, in Verträgen schrittweise ab 10. November
// 2025 (DFARS 252.204-7021). Stufe 1 = 15 Grundanforderungen aus FAR
// 52.204-21 als 17 Praktiken, Stufe 2 = alle 110 Anforderungen aus NIST SP
// 800-171 Rev. 2, Stufe 3 = zusätzlich ausgewählte Anforderungen aus NIST SP
// 800-172 mit Werten, die das Ministerium vorgibt. Stufe 1 und 2 übernehmen
// Titel, Text und Controls aus nist-800-171.ts. Eigene Formulierung nach
// Modellwissen, gegen 32 CFR 170.14 und die CMMC-Leitfäden (dodcio.defense.gov)
// prüfen.

export const CMMC_VARIANTS: FrameworkVariant[] = [
	{
		key: "l1",
		label: "Stufe 1",
		hint: "15 Grundanforderungen aus FAR 52.204-21, jährliche Selbsteinschätzung",
	},
	{
		key: "l2",
		label: "Stufe 2",
		hint: "Alle 110 Anforderungen aus NIST SP 800-171 Rev. 2, Selbsteinschätzung oder Prüfung durch eine C3PAO",
	},
	{
		key: "l3",
		label: "Stufe 3",
		hint: "Zusätzlich ausgewählte Anforderungen aus NIST SP 800-172, Prüfung durch DIBCAC",
	},
];

const ALL = ["l1", "l2", "l3"];
const FROM2 = ["l2", "l3"];
const ONLY3 = ["l3"];

export const CMMC_SECTIONS: CatalogSection[] = [
	{ code: "AC", title: "Zugriffskontrolle", sortOrder: 10 },
	{ code: "AT", title: "Bewusstsein und Schulung", sortOrder: 20 },
	{ code: "AU", title: "Protokollierung", sortOrder: 30 },
	{ code: "CM", title: "Konfigurationsmanagement", sortOrder: 40 },
	{ code: "IA", title: "Identifizierung und Anmeldung", sortOrder: 50 },
	{ code: "IR", title: "Vorfallbehandlung", sortOrder: 60 },
	{ code: "MA", title: "Wartung", sortOrder: 70 },
	{ code: "MP", title: "Medienschutz", sortOrder: 80 },
	{ code: "PS", title: "Personalsicherheit", sortOrder: 90 },
	{ code: "PE", title: "Physischer Schutz", sortOrder: 100 },
	{ code: "RA", title: "Risikobewertung", sortOrder: 110 },
	{ code: "CA", title: "Sicherheitsbewertung", sortOrder: 120 },
	{ code: "SC", title: "System- und Kommunikationsschutz", sortOrder: 130 },
	{ code: "SI", title: "System- und Informationsintegrität", sortOrder: 140 },
];

// NIST-Familie → CMMC-Domäne
const DOMAIN_OF: Record<string, string> = {
	"3.1": "AC",
	"3.2": "AT",
	"3.3": "AU",
	"3.4": "CM",
	"3.5": "IA",
	"3.6": "IR",
	"3.7": "MA",
	"3.8": "MP",
	"3.9": "PS",
	"3.10": "PE",
	"3.11": "RA",
	"3.12": "CA",
	"3.13": "SC",
	"3.14": "SI",
};

// Die 17 Praktiken der Stufe 1 (FAR 52.204-21 b 1 i bis xv)
const LEVEL1 = new Set([
	"3.1.1",
	"3.1.2",
	"3.1.20",
	"3.1.22",
	"3.5.1",
	"3.5.2",
	"3.8.3",
	"3.10.1",
	"3.10.3",
	"3.10.4",
	"3.10.5",
	"3.13.1",
	"3.13.5",
	"3.14.1",
	"3.14.2",
	"3.14.4",
	"3.14.5",
]);

function fromNist(s: Spec): Spec {
	const family = s.code.split(".").slice(0, 2).join(".");
	const domain = DOMAIN_OF[family] ?? family;
	const l1 = LEVEL1.has(s.code);
	return {
		code: `${domain}.${l1 ? "L1" : "L2"}-${s.code}`,
		section: domain,
		title: s.title,
		text: s.text,
		domain: s.domain,
		controls: s.controls,
		...(s.partial ? { partial: true } : {}),
		...(s.note ? { note: s.note } : {}),
		...(s.questions ? { questions: s.questions } : {}),
		...(s.evidence ? { evidence: s.evidence } : {}),
		variants: l1 ? ALL : FROM2,
		related: [`nist-800-171:${s.code}`],
	};
}

// Stufe 3: ausgewählte Anforderungen aus NIST SP 800-172 (Februar 2021) mit
// den Werten, die 32 CFR 170.14(c)(4) vorgibt
const L3_SPECS: Spec[] = [
	{
		code: "AC.L3-3.1.2e",
		section: "AC",
		title: "Nur eigene Geräte",
		text: "Zugang zu Systemen nur über Geräte und Ressourcen erlauben, die die Organisation besitzt, bereitstellt oder ausgegeben hat.",
		domain: "access",
		controls: ["CC-OPS-01", "CC-AST-01", "CC-IAM-07"],
		questions: [
			"Wie verhindert ihr, dass private Geräte auf Systeme mit CUI zugreifen?",
		],
	},
	{
		code: "AC.L3-3.1.3e",
		section: "AC",
		title: "Gesicherte Übertragung zwischen Bereichen",
		text: "Für den Austausch von Informationen zwischen Sicherheitsbereichen verbundener Systeme gesicherte Übertragungslösungen einsetzen.",
		domain: "network",
		controls: ["CC-AST-07", "CC-NET-01"],
	},
	{
		code: "AT.L3-3.2.1e",
		section: "AT",
		title: "Schulung zu fortgeschrittenen Bedrohungen",
		text: "Bei Einstellung, nach einem bedeutenden Cyberereignis und mindestens jährlich zu Social Engineering, fortgeschrittenen Angreifern, Datenpannen und verdächtigem Verhalten schulen; Inhalte mindestens jährlich aktualisieren.",
		domain: "hr",
		controls: ["CC-HR-03", "CC-RSK-05"],
		evidence: ["Schulungsinhalte mit Stand", "Teilnahmeliste je Anlass"],
	},
	{
		code: "AT.L3-3.2.2e",
		section: "AT",
		title: "Praktische Übungen",
		text: "Praktische Übungen nach Rollen, für alle Nutzer:innen, Fachrollen und privilegierte Konten, an aktuellen Bedrohungen ausrichten und den Beteiligten und ihren Vorgesetzten Rückmeldung geben.",
		domain: "hr",
		controls: ["CC-HR-03", "CC-BCM-05"],
	},
	{
		code: "CM.L3-3.4.1e",
		section: "CM",
		title: "Maßgebliches Verzeichnis",
		text: "Ein maßgebliches Verzeichnis freigegebener und eingesetzter Systemkomponenten als vertrauenswürdige Quelle führen.",
		domain: "asset",
		controls: ["CC-AST-01", "CC-OPS-04"],
	},
	{
		code: "CM.L3-3.4.2e",
		section: "CM",
		title: "Fehlkonfigurationen automatisch erkennen",
		text: "Falsch konfigurierte oder unbefugte Komponenten automatisch erkennen und danach entfernen oder in ein eigenes Netz zur Behebung verschieben.",
		domain: "operations",
		controls: ["CC-OPS-04", "CC-LOG-02", "CC-NET-01"],
		partial: true,
		note: "Automatische Erkennung und ein Quarantäne-Netz ergänzen.",
	},
	{
		code: "CM.L3-3.4.3e",
		section: "CM",
		title: "Automatisches Inventar",
		text: "Mit automatischen Werkzeugen ein aktuelles, vollständiges und jederzeit verfügbares Inventar der Systemkomponenten führen.",
		domain: "asset",
		controls: ["CC-AST-01"],
		partial: true,
		note: "Automatische Erkennung der Komponenten ergänzen.",
	},
	{
		code: "IA.L3-3.5.1e",
		section: "IA",
		title: "Gegenseitige Anmeldung",
		text: "Systeme und Komponenten vor dem Aufbau einer Netzverbindung, wo möglich, gegenseitig kryptografisch und gegen Wiedereinspielen geschützt anmelden.",
		domain: "crypto",
		controls: ["CC-CRY-05", "CC-IAM-03"],
		partial: true,
		note: "Gegenseitige Anmeldung der Geräte, etwa über Zertifikate, ergänzen.",
	},
	{
		code: "IA.L3-3.5.3e",
		section: "IA",
		title: "Unbekannte Geräte blockieren",
		text: "Komponenten nur verbinden lassen, wenn sie bekannt, angemeldet und richtig konfiguriert sind oder einem Vertrauensprofil entsprechen.",
		domain: "network",
		controls: ["CC-NET-01", "CC-OPS-01", "CC-IAM-07"],
		partial: true,
		note: "Netzzugangskontrolle für Geräte ergänzen.",
	},
	{
		code: "IR.L3-3.6.1e",
		section: "IR",
		title: "Sicherheitszentrale rund um die Uhr",
		text: "Eine Sicherheitszentrale (SOC) betreiben, die an sieben Tagen rund um die Uhr arbeitet, auch mit Personal auf Abruf.",
		domain: "incident",
		controls: ["CC-LOG-02", "CC-INC-01"],
		partial: true,
		note: "Betrieb rund um die Uhr ausdrücklich festlegen.",
		questions: ["Wer sieht nachts und am Wochenende einen Alarm?"],
	},
	{
		code: "IR.L3-3.6.2e",
		section: "IR",
		title: "Eingreifteam binnen 24 Stunden",
		text: "Ein Team für Cybervorfälle bereithalten, das binnen 24 Stunden vor Ort oder aus der Ferne eingesetzt werden kann.",
		domain: "incident",
		controls: ["CC-INC-04", "CC-INC-01", "CC-INC-06"],
		partial: true,
		note: "Einsatzbereitschaft binnen 24 Stunden festlegen und üben.",
	},
	{
		code: "PS.L3-3.9.2e",
		section: "PS",
		title: "Ungünstige Informationen",
		text: "Systeme schützen, wenn über Personen mit Zugang zu CUI ungünstige Informationen bekannt werden, etwa durch sofortige Prüfung und Sperre des Zugangs.",
		domain: "hr",
		controls: ["CC-HR-01", "CC-IAM-02", "CC-HR-04"],
		partial: true,
		note: "Laufende Prüfung nach der Einstellung und Ablauf bei Hinweisen ergänzen.",
	},
	{
		code: "RA.L3-3.11.1e",
		section: "RA",
		title: "Bedrohungswissen in der Risikobewertung",
		text: "Bedrohungsinformationen aus offenen oder kommerziellen Quellen und vom US-Verteidigungsministerium in die Risikobewertung einbeziehen, um Architektur, Schutz, Überwachung und Reaktion auszurichten.",
		domain: "risk",
		controls: ["CC-RSK-05", "CC-RSK-02"],
		evidence: [
			"Liste der Bedrohungsquellen",
			"Risikobewertung mit Bezug darauf",
		],
	},
	{
		code: "RA.L3-3.11.2e",
		section: "RA",
		title: "Gezielt nach Angreifern suchen",
		text: "Fortlaufend und bei Anlass aktiv nach Anzeichen für eine Kompromittierung suchen, um Bedrohungen zu finden, die bestehende Maßnahmen umgehen (Threat Hunting).",
		domain: "operations",
		controls: ["CC-LOG-02", "CC-RSK-05"],
		partial: true,
		note: "Aktive Suche nach Angreifern als eigene Tätigkeit ergänzen.",
	},
	{
		code: "RA.L3-3.11.3e",
		section: "RA",
		title: "Risiken mit Analysen vorhersagen",
		text: "Analyst:innen mit fortgeschrittener Automatisierung und Auswertung unterstützen, um Risiken für Organisation, Systeme und Komponenten vorherzusagen und zu erkennen.",
		domain: "risk",
		controls: ["CC-RSK-05", "CC-LOG-02"],
		partial: true,
		note: "Automatisierte Auswertung zur Risikoerkennung ergänzen.",
	},
	{
		code: "RA.L3-3.11.4e",
		section: "RA",
		title: "Begründung der Sicherheitslösung",
		text: "Im Systemsicherheitsplan die gewählte Sicherheitslösung, die Begründung dafür und die Risikoentscheidung festhalten.",
		domain: "risk",
		controls: ["CC-SSP-01", "CC-RSK-03"],
	},
	{
		code: "RA.L3-3.11.5e",
		section: "RA",
		title: "Wirksamkeit der Sicherheitslösungen",
		text: "Die Wirksamkeit der Sicherheitslösungen mindestens jährlich sowie nach neuen Bedrohungsinformationen oder einem Vorfall bewerten.",
		domain: "risk",
		controls: ["CC-GOV-13", "CC-RSK-05", "CC-TST-01"],
		questions: [
			"Wann habt ihr eure Sicherheitslösungen zuletzt auf Wirksamkeit geprüft?",
		],
	},
	{
		code: "RA.L3-3.11.6e",
		section: "RA",
		title: "Lieferkettenrisiken steuern",
		text: "Risiken der Lieferkette für Systeme und Komponenten bewerten, behandeln und überwachen.",
		domain: "supplier",
		controls: ["CC-TPR-05", "CC-TPR-03", "CC-DEV-05"],
	},
	{
		code: "RA.L3-3.11.7e",
		section: "RA",
		title: "Plan für Lieferkettenrisiken",
		text: "Einen Plan für Lieferkettenrisiken erstellen und mindestens jährlich sowie nach neuen Bedrohungsinformationen oder einem Vorfall aktualisieren.",
		domain: "supplier",
		controls: ["CC-TPR-02", "CC-DEV-05"],
		evidence: ["Plan für Lieferkettenrisiken mit Stand"],
	},
	{
		code: "CA.L3-3.12.1e",
		section: "CA",
		title: "Penetrationstests",
		text: "Mindestens jährlich und nach wesentlichen Änderungen Penetrationstests mit automatischen Scans und gezielten Tests durch Fachleute durchführen.",
		domain: "development",
		controls: ["CC-DEV-04", "CC-TST-01"],
		questions: ["Wer hat euren letzten Penetrationstest gemacht, und wann?"],
		evidence: ["Bericht des Penetrationstests", "Nachweis der Behebung"],
	},
	{
		code: "SC.L3-3.13.4e",
		section: "SC",
		title: "Isolierung",
		text: "Systeme und Komponenten physisch, logisch oder beides voneinander isolieren.",
		domain: "network",
		controls: ["CC-NET-01", "CC-OPS-10"],
	},
	{
		code: "SI.L3-3.14.1e",
		section: "SI",
		title: "Integrität von Software prüfen",
		text: "Die Integrität sicherheitskritischer und wichtiger Software über Vertrauensanker oder kryptografische Signaturen prüfen.",
		domain: "operations",
		controls: ["CC-DEV-05", "CC-OPS-06"],
		partial: true,
		note: "Signaturprüfung beim Start und bei Updates ergänzen.",
	},
	{
		code: "SI.L3-3.14.3e",
		section: "SI",
		title: "Besondere Geräte einbeziehen",
		text: "Besondere Geräte wie IoT, Steuerungstechnik, Geräte des Auftraggebers und Testgeräte in Sicherheit und Risikobewertung einbeziehen oder in eigenen Netzen abtrennen.",
		domain: "asset",
		controls: ["CC-AST-01", "CC-NET-01", "CC-RSK-02"],
	},
	{
		code: "SI.L3-3.14.6e",
		section: "SI",
		title: "Angriffserkennung nach Bedrohungslage",
		text: "Bedrohungsindikatoren und Gegenmaßnahmen aus offenen oder kommerziellen Quellen und vom US-Verteidigungsministerium für Angriffserkennung und Suche nach Angreifern nutzen.",
		domain: "operations",
		controls: ["CC-LOG-02", "CC-RSK-05"],
	},
];
const L3 = L3_SPECS.map((s): Spec => ({ ...s, variants: ONLY3 }));

const S: Spec[] = CMMC_SECTIONS.flatMap((sec) => [
	...NIST171_SPECS.map(fromNist).filter((s) => s.section === sec.code),
	...L3.filter((s) => s.section === sec.code),
]);

const built = buildIndex("cmmc", S);
export const CMMC_REQUIREMENTS = built.requirements;
export const CMMC_EDGES = built.edges;
