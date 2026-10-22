import type { CatalogRequirement, CatalogSection } from "./types";

// CryptoCurrency Security Standard (CCSS) des CryptoCurrency Certification
// Consortium (C4) — freiwilliger Standard für Systeme, die Kryptowerte
// verwahren oder Schlüssel verwalten. Gegliedert nach den Aspekten des
// Standards; die Stufen I–III stehen im Text. Paraphrasen nach Modellwissen,
// vor einer Zertifizierung gegen die aktuelle Fassung des Standards prüfen.

export const CCSS_SECTIONS: CatalogSection[] = [
	{
		code: "CAM",
		title: "Verwaltung von Kryptowerten und Schlüsseln",
		sortOrder: 10,
	},
	{ code: "OPS", title: "Betrieb", sortOrder: 20 },
];

export const CCSS_REQUIREMENTS: CatalogRequirement[] = [
	{
		code: "1.01",
		sectionCode: "CAM",
		title: "Erzeugung von Schlüsseln und Seeds",
		requirementText:
			"Schlüssel und Seeds entstehen aus einem geprüften kryptografisch sicheren Zufallsgenerator (Stufe I). Ab Stufe II wird die Entropie geprüft und die Erzeugung von mehreren Personen nachvollzogen; Stufe III verlangt eine protokollierte Zeremonie mit geprüften Beteiligten und abgeschirmter Umgebung.",
		domain: "crypto",
		evidenceHints: ["Zeremonie-Protokolle", "Nachweis des Zufallsgenerators"],
		auditQuestions: [
			"Welcher Zufallsgenerator erzeugt die Seeds, und wie ist er geprüft?",
			"Wer war bei der letzten Schlüsselerzeugung dabei, und wo ist das Protokoll?",
		],
		relatedRequirements: ["micar:Art.75"],
		sortOrder: 10,
	},
	{
		code: "1.02",
		sectionCode: "CAM",
		title: "Erstellung von Wallets",
		requirementText:
			"Jede Wallet nutzt eindeutige Adressen und deterministische Ableitung (Stufe I). Ab Stufe II signieren mehrere Schlüssel (Multisig oder MPC) und es gibt einen Wiederherstellungsschlüssel; Stufe III verteilt die Schlüssel auf mehrere Standorte und Organisationseinheiten, sodass weder eine Person noch ein Ort allein verfügen kann.",
		domain: "crypto",
		evidenceHints: ["Wallet-Register mit Quorum", "Architektur-Dokument"],
		auditQuestions: [
			"Welches Quorum gilt je Wallet, und wer hält die Schlüssel?",
			"Was passiert, wenn ein Standort ausfällt?",
		],
		sortOrder: 20,
	},
	{
		code: "1.03",
		sectionCode: "CAM",
		title: "Aufbewahrung von Schlüsseln",
		requirementText:
			"Primärschlüssel liegen verschlüsselt, für jeden Schlüssel gibt es ein Backup (Stufe I). Ab Stufe II ist das Backup zugriffsgeschützt, verschlüsselt und gegen Umwelteinflüsse geschützt; Stufe III verlangt getrennte Standorte und manipulationssichere Aufbewahrung.",
		domain: "crypto",
		evidenceHints: ["Backup-Inventar", "Standortnachweise"],
		sortOrder: 30,
	},
	{
		code: "1.04",
		sectionCode: "CAM",
		title: "Verwendung von Schlüsseln",
		requirementText:
			"Schlüssel sind nur für die berechtigten Personen zugänglich und werden nur in vertrauenswürdigen Umgebungen verwendet (Stufe I). Ab Stufe II werden Zieladressen vor dem Signieren geprüft und Transaktionen über Freigaben mit mehreren Personen ausgelöst; Stufe III verlangt deterministische Signaturen und eine Umgebung ohne Netzverbindung für kalte Schlüssel.",
		domain: "crypto",
		evidenceHints: ["Signatur-Freigabeprozess", "Zugriffsprotokolle"],
		sortOrder: 40,
	},
	{
		code: "1.05",
		sectionCode: "CAM",
		title: "Vorgehen bei Schlüsselkompromittierung",
		requirementText:
			"Ein dokumentiertes Protokoll regelt das Vorgehen bei Verdacht auf kompromittierte Schlüssel (Stufe I). Ab Stufe II sind die Beteiligten geschult; Stufe III verlangt regelmäßige Übungen des Protokolls.",
		domain: "incident",
		evidenceHints: [
			"Kompromittierungs-Playbook",
			"Schulungs- und Übungsnachweise",
		],
		sortOrder: 50,
	},
	{
		code: "1.06",
		sectionCode: "CAM",
		title: "Vergabe und Entzug von Schlüsselinhaberschaften",
		requirementText:
			"Ein Verfahren regelt, wer Schlüssel hält und wie Inhaberschaften vergeben und entzogen werden (Stufe I). Ab Stufe II werden Schlüsselinhaber:innen vorab überprüft; Stufe III verlangt eine Überprüfung der Identität und Integrität sowie den unverzüglichen Austausch beim Ausscheiden.",
		domain: "access",
		evidenceHints: [
			"Liste der Schlüsselinhaber:innen",
			"Protokolle zu Vergabe und Entzug",
		],
		sortOrder: 60,
	},
	{
		code: "2.01",
		sectionCode: "OPS",
		title: "Sicherheitsprüfungen durch Dritte",
		requirementText:
			"Das System wird von einer unabhängigen Stelle geprüft (Sicherheitsaudit oder Penetrationstest); Befunde werden behoben und nachgetestet.",
		domain: "operations",
		evidenceHints: ["Prüfbericht", "Nachtest-Nachweise"],
		sortOrder: 70,
	},
	{
		code: "2.02",
		sectionCode: "OPS",
		title: "Richtlinie zur sicheren Datenlöschung",
		requirementText:
			"Eine Richtlinie regelt die sichere Löschung von Datenträgern und Geräten, die Schlüsselmaterial enthalten haben (Stufe I); ab Stufe II wird jede Löschung mit Nachweis protokolliert.",
		domain: "asset",
		evidenceHints: ["Löschrichtlinie", "Löschprotokolle"],
		sortOrder: 80,
	},
	{
		code: "2.03",
		sectionCode: "OPS",
		title: "Nachweis der Reserven (Proof of Reserves)",
		requirementText:
			"Die verwahrten Kryptowerte werden regelmäßig durch eine unabhängige Stelle gegen die Kundenverbindlichkeiten nachgewiesen.",
		domain: "custody",
		services: ["custody"],
		evidenceHints: ["Proof-of-Reserves-Bericht"],
		relatedRequirements: ["micar:Art.75"],
		sortOrder: 90,
	},
	{
		code: "2.04",
		sectionCode: "OPS",
		title: "Audit-Logs",
		requirementText:
			"Das System protokolliert sicherheitsrelevante Vorgänge (Stufe I); ab Stufe II werden die Logs gesichert und manipulationssicher aufbewahrt.",
		domain: "operations",
		evidenceHints: ["Protokollierungskonzept", "Log-Sicherung"],
		sortOrder: 100,
	},
];
