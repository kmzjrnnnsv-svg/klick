import type { CatalogRequirement, CatalogSection } from "./types";

// BSI IT-Grundschutz: Standards 200-1 (Managementsysteme für
// Informationssicherheit), 200-2 (IT-Grundschutz-Methodik), 200-3
// (Risikoanalyse auf der Basis von IT-Grundschutz) und 200-4 (Business
// Continuity Management). Codes = Kapitelbezug der Standards; Texte sind
// Paraphrasen nach Modellwissen, vor einer Zertifizierung („ISO 27001 auf
// der Basis von IT-Grundschutz“) gegen die aktuelle Fassung prüfen.
// Grundschutz++ (BSI-Standard 300-1 und Anwenderkatalog) folgt, sobald die
// Quelle eingesehen ist. Ausschluss kennen die Standards nicht; die Bausteine
// des Kompendiums („entbehrlich“) sind hier nicht modelliert.

type Row = Omit<CatalogRequirement, "sortOrder" | "domain"> & {
	domain?: CatalogRequirement["domain"];
};

function rows(
	list: Row[],
	fallback: CatalogRequirement["domain"],
): CatalogRequirement[] {
	return list.map((r, i) => ({
		...r,
		domain: r.domain ?? fallback,
		sortOrder: (i + 1) * 10,
	}));
}

// ─── BSI-Standard 200-1 ─────────────────────────────────────────────────────

export const BSI_200_1_SECTIONS: CatalogSection[] = [
	{ code: "4", title: "Management-Prinzipien", sortOrder: 10 },
	{ code: "5", title: "Ressourcen", sortOrder: 20 },
	{ code: "6", title: "Einbindung der Beschäftigten", sortOrder: 30 },
	{ code: "7", title: "Sicherheitsprozess", sortOrder: 40 },
	{ code: "8", title: "Sicherheitskonzept", sortOrder: 50 },
];

export const BSI_200_1_REQUIREMENTS: CatalogRequirement[] = rows(
	[
		{
			code: "4.1",
			sectionCode: "4",
			title: "Verantwortung der Leitung",
			requirementText:
				"Die Leitung trägt die Gesamtverantwortung für Informationssicherheit, initiiert den Sicherheitsprozess, setzt Ziele, stellt Mittel bereit und lebt Informationssicherheit vor.",
			evidenceHints: ["Leitlinie mit Unterschrift der Leitung", "Beschluss"],
			auditQuestions: [
				"Wie zeigt die Leitung, dass sie die Verantwortung übernimmt?",
				"Welche Entscheidungen hat sie im letzten Jahr dazu getroffen?",
			],
			relatedRequirements: ["iso27001:5.1"],
		},
		{
			code: "4.2",
			sectionCode: "4",
			title: "Kommunikation und Wissen",
			requirementText:
				"Die Leitung wird regelmäßig über Stand, Risiken und Vorfälle informiert; Wissen zur Informationssicherheit wird gezielt aufgebaut und weitergegeben, auch nach außen (Behörden, Fachkreise).",
			evidenceHints: ["Berichte an die Leitung", "Kommunikationsplan"],
			auditQuestions: [
				"Wie oft und in welcher Form berichtet der ISB an die Leitung?",
			],
		},
		{
			code: "4.3",
			sectionCode: "4",
			title: "Erfolgskontrolle",
			requirementText:
				"Die Wirksamkeit der Sicherheitsmaßnahmen wird regelmäßig gemessen und überprüft (Kennzahlen, Revisionen, Übungen); die Leitung bewertet die Ergebnisse.",
			evidenceHints: ["Kennzahlen", "Revisionsberichte", "Managementbewertung"],
			auditQuestions: [
				"Mit welchen Kennzahlen misst ihr den Erfolg der Sicherheitsmaßnahmen?",
			],
			relatedRequirements: ["iso27001:9.1"],
		},
		{
			code: "4.4",
			sectionCode: "4",
			title: "Kontinuierliche Verbesserung",
			requirementText:
				"Erkenntnisse aus Prüfungen, Vorfällen und Änderungen fließen in die Verbesserung des Managementsystems ein (PDCA-Zyklus); Abweichungen werden mit Maßnahmen und Fristen behoben.",
			evidenceHints: ["Maßnahmenliste", "Abweichungsregister"],
			relatedRequirements: ["iso27001:10.1"],
		},
		{
			code: "5",
			sectionCode: "5",
			title: "Ressourcen für Informationssicherheit",
			requirementText:
				"Für Informationssicherheit stehen ausreichend Personal, Zeit, Budget und Fachwissen zur Verfügung; der Bedarf wird geplant und regelmäßig überprüft.",
			evidenceHints: ["Budgetplanung", "Stellenbeschreibung ISB"],
			auditQuestions: ["Wie viel Zeit und Budget hat der ISB, und reicht das?"],
			relatedRequirements: ["iso27001:7.1"],
		},
		{
			code: "6",
			sectionCode: "6",
			title: "Einbindung der Beschäftigten",
			requirementText:
				"Alle Beschäftigten kennen ihre Pflichten zur Informationssicherheit, werden geschult und sensibilisiert; Regelungen gelten auch für externe Kräfte.",
			evidenceHints: ["Schulungsnachweise", "Verpflichtungserklärungen"],
			auditQuestions: [
				"Wie stellt ihr sicher, dass neue Beschäftigte die Regeln kennen?",
			],
			relatedRequirements: ["iso27001:7.3"],
			domain: "hr",
		},
		{
			code: "7.1",
			sectionCode: "7",
			title: "Sicherheitsprozess im Lebenszyklus",
			requirementText:
				"Informationssicherheit ist in alle Geschäftsprozesse und den Lebenszyklus von Informationen, Anwendungen und Systemen eingebunden (Planung, Beschaffung, Betrieb, Aussonderung).",
			evidenceHints: ["Projektmethode mit Sicherheitsschritten"],
		},
		{
			code: "7.2",
			sectionCode: "7",
			title: "Leitlinie zur Informationssicherheit",
			requirementText:
				"Eine von der Leitung verabschiedete Leitlinie beschreibt Stellenwert, Ziele, Geltungsbereich und Organisation der Informationssicherheit; sie ist bekannt gemacht und wird regelmäßig überprüft.",
			evidenceHints: ["Leitlinie zur Informationssicherheit"],
			auditQuestions: [
				"Wann wurde die Leitlinie zuletzt überprüft, und wer kennt sie?",
			],
			relatedRequirements: ["iso27001:5.2"],
		},
		{
			code: "7.3",
			sectionCode: "7",
			title: "Organisation der Informationssicherheit",
			requirementText:
				"Rollen und Zuständigkeiten sind festgelegt: Informationssicherheitsbeauftragte:r (ISB) mit direktem Zugang zur Leitung, bei Bedarf ein IS-Management-Team und Ansprechpersonen in den Bereichen.",
			evidenceHints: ["Bestellung ISB", "Organigramm"],
			auditQuestions: [
				"Wer ist ISB, und an wen berichtet die Person?",
				"Wie ist eine Interessenkollision mit dem IT-Betrieb vermieden?",
			],
			relatedRequirements: ["iso27001:5.3"],
		},
		{
			code: "7.4",
			sectionCode: "7",
			title: "Dokumentation im Sicherheitsprozess",
			requirementText:
				"Entscheidungen, Konzepte, Richtlinien und Nachweise sind nachvollziehbar dokumentiert, gelenkt und aktuell; Berichte an die Leitung und Ergebnisse der Erfolgskontrolle sind aufbewahrt.",
			evidenceHints: ["Dokumentenregister", "Freigabe- und Änderungsverlauf"],
			relatedRequirements: ["iso27001:7.5"],
		},
		{
			code: "8.1",
			sectionCode: "8",
			title: "Sicherheitskonzept erstellen",
			requirementText:
				"Ein Sicherheitskonzept legt für den Geltungsbereich die Schutzziele, die Vorgehensweise (nach BSI-Standard 200-2) und die ausgewählten Sicherheitsmaßnahmen fest.",
			evidenceHints: ["Sicherheitskonzept"],
		},
		{
			code: "8.2",
			sectionCode: "8",
			title: "Sicherheitskonzept umsetzen",
			requirementText:
				"Die Maßnahmen des Sicherheitskonzepts werden geplant (Verantwortliche, Fristen, Budget) und umgesetzt; der Umsetzungsstand ist bekannt.",
			evidenceHints: ["Realisierungsplan"],
		},
		{
			code: "8.3",
			sectionCode: "8",
			title: "Sicherheitskonzept überprüfen",
			requirementText:
				"Das Sicherheitskonzept wird regelmäßig und anlassbezogen auf Wirksamkeit, Eignung und Aktualität überprüft (Revisionen, IS-Prüfungen).",
			evidenceHints: ["Prüfberichte", "Änderungshistorie"],
			relatedRequirements: ["iso27001:9.2"],
		},
	],
	"governance",
);

// ─── BSI-Standard 200-2 ─────────────────────────────────────────────────────

const B = ["basis"];
const S = ["standard"];
const K = ["kern"];

export const BSI_200_2_SECTIONS: CatalogSection[] = [
	{ code: "3", title: "Initiierung des Sicherheitsprozesses", sortOrder: 10 },
	{ code: "4", title: "Organisation des Sicherheitsprozesses", sortOrder: 20 },
	{ code: "5", title: "Dokumentation", sortOrder: 30 },
	{ code: "6", title: "Basis-Absicherung", sortOrder: 40 },
	{ code: "7", title: "Kern-Absicherung", sortOrder: 50 },
	{ code: "8", title: "Standard-Absicherung", sortOrder: 60 },
	{ code: "9", title: "Umsetzung der Sicherheitskonzeption", sortOrder: 70 },
	{ code: "10", title: "Aufrechterhaltung und Verbesserung", sortOrder: 80 },
];

export const BSI_200_2_REQUIREMENTS: CatalogRequirement[] = rows(
	[
		{
			code: "3.1",
			sectionCode: "3",
			title: "Übernahme der Verantwortung durch die Leitung",
			requirementText:
				"Die Leitung beschließt, den Sicherheitsprozess nach IT-Grundschutz aufzusetzen, und benennt die Verantwortlichen.",
			evidenceHints: ["Beschluss der Leitung"],
			relatedRequirements: ["bsi-200-1:4.1"],
		},
		{
			code: "3.2",
			sectionCode: "3",
			title: "Geltungsbereich und Vorgehensweise festlegen",
			requirementText:
				"Der Informationsverbund (Geltungsbereich) ist abgegrenzt; die Absicherungsvariante (Basis-, Standard- oder Kern-Absicherung) ist gewählt und begründet.",
			evidenceHints: ["Abgrenzung des Informationsverbunds"],
			auditQuestions: [
				"Welche Prozesse, Standorte und Systeme gehören zum Informationsverbund?",
				"Warum habt ihr diese Absicherungsvariante gewählt?",
			],
			relatedRequirements: ["iso27001:4.3"],
		},
		{
			code: "3.3",
			sectionCode: "3",
			title: "Leitlinie erstellen",
			requirementText:
				"Die Leitlinie zur Informationssicherheit ist erstellt, von der Leitung verabschiedet und allen bekannt gemacht.",
			evidenceHints: ["Leitlinie zur Informationssicherheit"],
		},
		{
			code: "4.1",
			sectionCode: "4",
			title: "Informationssicherheitsbeauftragte:r",
			requirementText:
				"Ein:e ISB ist bestellt, mit Aufgaben, Befugnissen und Ressourcen ausgestattet und berichtet direkt an die Leitung.",
			evidenceHints: ["Bestellungsschreiben ISB"],
			auditQuestions: ["Welche Befugnisse hat der ISB im Konfliktfall?"],
		},
		{
			code: "4.2",
			sectionCode: "4",
			title: "Sicherheitsorganisation",
			requirementText:
				"Ein IS-Management-Team bzw. Ansprechpersonen in Bereichen, Projekten und IT sind benannt; Schnittstellen zu Datenschutz, Notfallmanagement und IT-Betrieb sind geregelt.",
			evidenceHints: ["Organigramm", "Rollenbeschreibungen"],
		},
		{
			code: "5",
			sectionCode: "5",
			title: "Dokumentation im Sicherheitsprozess",
			requirementText:
				"Konzepte, Richtlinien, Ergebnisse der Strukturanalyse, Schutzbedarf, Modellierung und IT-Grundschutz-Check sind dokumentiert, versioniert und für Berechtigte verfügbar.",
			evidenceHints: ["Referenzdokumente des Sicherheitskonzepts"],
		},
		{
			code: "6.1",
			sectionCode: "6",
			title: "Basis-Absicherung: Geltungsbereich",
			requirementText:
				"Für die Basis-Absicherung ist der Geltungsbereich festgelegt; sie dient als Einstieg, um schnell die wichtigsten Basis-Anforderungen breit umzusetzen.",
			variants: B,
		},
		{
			code: "6.2",
			sectionCode: "6",
			title: "Basis-Absicherung: Auswahl und Priorisierung",
			requirementText:
				"Die relevanten Bausteine des Kompendiums sind den Zielobjekten zugeordnet und priorisiert (Modellierung in vereinfachter Form).",
			variants: B,
		},
		{
			code: "6.3",
			sectionCode: "6",
			title: "Basis-Absicherung: IT-Grundschutz-Check",
			requirementText:
				"Für jeden zugeordneten Baustein ist geprüft, ob die Basis-Anforderungen erfüllt sind; offene Anforderungen sind mit Maßnahmen und Fristen erfasst.",
			variants: B,
			evidenceHints: ["IT-Grundschutz-Check (Basis-Anforderungen)"],
		},
		{
			code: "6.4",
			sectionCode: "6",
			title: "Basis-Absicherung: Realisierung und nächste Stufe",
			requirementText:
				"Die offenen Basis-Anforderungen sind umgesetzt; der Übergang zur Standard- oder Kern-Absicherung ist geplant.",
			variants: B,
		},
		{
			code: "7.1",
			sectionCode: "7",
			title: "Kern-Absicherung: Kronjuwelen festlegen",
			requirementText:
				"Die besonders schützenswerten Geschäftsprozesse und Informationen (Kronjuwelen) sind festgelegt und der Geltungsbereich darauf abgegrenzt.",
			variants: K,
			evidenceHints: ["Liste der Kronjuwelen mit Begründung"],
		},
		{
			code: "7.2",
			sectionCode: "7",
			title: "Kern-Absicherung: Strukturanalyse",
			requirementText:
				"Für die Kronjuwelen sind Prozesse, Anwendungen, IT-Systeme, Räume und Kommunikationsverbindungen erfasst.",
			variants: K,
			domain: "asset",
		},
		{
			code: "7.3",
			sectionCode: "7",
			title: "Kern-Absicherung: Schutzbedarf",
			requirementText:
				"Der Schutzbedarf der Kronjuwelen ist für Vertraulichkeit, Integrität und Verfügbarkeit festgestellt (normal, hoch, sehr hoch).",
			variants: K,
			domain: "risk",
		},
		{
			code: "7.4",
			sectionCode: "7",
			title: "Kern-Absicherung: Modellierung und Check",
			requirementText:
				"Bausteine sind zugeordnet, Basis- und Standard-Anforderungen geprüft, für hohen Schutzbedarf die erhöhten Anforderungen berücksichtigt.",
			variants: K,
		},
		{
			code: "7.5",
			sectionCode: "7",
			title: "Kern-Absicherung: Risikoanalyse",
			requirementText:
				"Für Zielobjekte mit hohem oder sehr hohem Schutzbedarf ist eine Risikoanalyse nach BSI-Standard 200-3 durchgeführt.",
			variants: K,
			domain: "risk",
			relatedRequirements: ["iso27001:6.1.2"],
		},
		{
			code: "8.1",
			sectionCode: "8",
			title: "Standard-Absicherung: Strukturanalyse",
			requirementText:
				"Für den Informationsverbund sind Geschäftsprozesse, Anwendungen, IT-Systeme, ICS/IoT, Räume und Kommunikationsverbindungen erfasst und zu Gruppen zusammengefasst.",
			variants: S,
			domain: "asset",
			evidenceHints: ["Strukturanalyse (Zielobjekte)", "Netzplan"],
			auditQuestions: [
				"Wie haltet ihr die Strukturanalyse bei Änderungen aktuell?",
			],
		},
		{
			code: "8.2",
			sectionCode: "8",
			title: "Standard-Absicherung: Schutzbedarfsfeststellung",
			requirementText:
				"Für Geschäftsprozesse und Informationen ist der Schutzbedarf nach Schadensszenarien bestimmt und auf Anwendungen, Systeme, Räume und Verbindungen vererbt (Maximumprinzip, Kumulations- und Verteilungseffekt).",
			variants: S,
			domain: "risk",
			evidenceHints: ["Schutzbedarfsfeststellung mit Begründung"],
			auditQuestions: [
				"Welche Schadensszenarien und Grenzen habt ihr für normal, hoch und sehr hoch festgelegt?",
			],
		},
		{
			code: "8.3",
			sectionCode: "8",
			title: "Standard-Absicherung: Modellierung",
			requirementText:
				"Jedem Zielobjekt sind die passenden Bausteine des IT-Grundschutz-Kompendiums zugeordnet; die Modellierung ist vollständig und nachvollziehbar.",
			variants: S,
			evidenceHints: ["Modellierung (Baustein-Zuordnung)"],
		},
		{
			code: "8.4",
			sectionCode: "8",
			title: "Standard-Absicherung: IT-Grundschutz-Check",
			requirementText:
				"Je Baustein ist der Umsetzungsstand der Basis- und Standard-Anforderungen erhoben (ja, teilweise, nein, entbehrlich mit Begründung); offene Punkte führen in die Umsetzungsplanung.",
			variants: S,
			evidenceHints: ["IT-Grundschutz-Check"],
			auditQuestions: [
				"Wie begründet ihr Anforderungen, die ihr als entbehrlich bewertet habt?",
			],
		},
		{
			code: "8.5",
			sectionCode: "8",
			title: "Standard-Absicherung: Risikoanalyse",
			requirementText:
				"Für Zielobjekte mit hohem oder sehr hohem Schutzbedarf, ohne passenden Baustein oder in untypischen Einsatzszenarien ist eine Risikoanalyse nach BSI-Standard 200-3 durchgeführt.",
			variants: S,
			domain: "risk",
			relatedRequirements: ["iso27001:6.1.2"],
		},
		{
			code: "9",
			sectionCode: "9",
			title: "Umsetzungsplanung",
			requirementText:
				"Offene Anforderungen und Maßnahmen aus der Risikoanalyse sind konsolidiert, mit Kosten, Verantwortlichen und Fristen geplant und von der Leitung freigegeben; der Fortschritt wird verfolgt.",
			evidenceHints: ["Realisierungsplan mit Verantwortlichen und Fristen"],
		},
		{
			code: "10.1",
			sectionCode: "10",
			title: "Überprüfung des Sicherheitsprozesses",
			requirementText:
				"Der Sicherheitsprozess wird regelmäßig überprüft (IS-Revision, Kennzahlen, Managementbewertung), und die Ergebnisse fließen in die Verbesserung ein.",
			evidenceHints: ["IS-Revisionsbericht", "Managementbewertung"],
			relatedRequirements: ["iso27001:9.3"],
		},
		{
			code: "10.2",
			sectionCode: "10",
			title: "Aktualisierung bei Änderungen",
			requirementText:
				"Strukturanalyse, Schutzbedarf, Modellierung und Check werden bei wesentlichen Änderungen (neue Systeme, Prozesse, Bedrohungen, neue Edition des Kompendiums) nachgezogen.",
		},
	],
	"governance",
);

// ─── BSI-Standard 200-3 ─────────────────────────────────────────────────────

export const BSI_200_3_SECTIONS: CatalogSection[] = [
	{ code: "3", title: "Vorarbeiten", sortOrder: 10 },
	{ code: "4", title: "Gefährdungsübersicht", sortOrder: 20 },
	{ code: "5", title: "Einstufung der Risiken", sortOrder: 30 },
	{ code: "6", title: "Behandlung der Risiken", sortOrder: 40 },
	{ code: "7", title: "Konsolidierung und Rückführung", sortOrder: 50 },
];

export const BSI_200_3_REQUIREMENTS: CatalogRequirement[] = rows(
	[
		{
			code: "3",
			sectionCode: "3",
			title: "Vorarbeiten und Richtlinie zur Risikoanalyse",
			requirementText:
				"Eine Richtlinie legt fest, für welche Zielobjekte eine Risikoanalyse nötig ist, wer sie durchführt, welche Methode (Häufigkeits- und Schadensklassen, Risikomatrix) gilt und welche Risiken akzeptiert werden dürfen.",
			evidenceHints: ["Richtlinie zur Risikoanalyse", "Risikomatrix"],
			auditQuestions: [
				"Wie definiert ihr Eintrittshäufigkeit und Schadenshöhe?",
				"Wer darf Restrisiken akzeptieren?",
			],
			relatedRequirements: ["iso27001:6.1.2"],
		},
		{
			code: "4.1",
			sectionCode: "4",
			title: "Elementare Gefährdungen zuordnen",
			requirementText:
				"Für jedes betrachtete Zielobjekt sind die relevanten elementaren Gefährdungen (G 0.1 bis G 0.47) ermittelt.",
			evidenceHints: ["Gefährdungsübersicht je Zielobjekt"],
		},
		{
			code: "4.2",
			sectionCode: "4",
			title: "Zusätzliche Gefährdungen ermitteln",
			requirementText:
				"Gefährdungen, die die elementaren nicht abbilden (besondere Einsatzszenarien, neue Technik, eigene Erfahrungen), sind ergänzt.",
			auditQuestions: [
				"Welche Gefährdungen habt ihr über die elementaren hinaus ergänzt, und warum?",
			],
		},
		{
			code: "5.1",
			sectionCode: "5",
			title: "Häufigkeit und Auswirkung einschätzen",
			requirementText:
				"Je Gefährdung sind Eintrittshäufigkeit (selten, mittel, häufig, sehr häufig) und Schadenshöhe (vernachlässigbar, begrenzt, beträchtlich, existenzbedrohend) unter Berücksichtigung der umgesetzten Maßnahmen eingeschätzt.",
			evidenceHints: ["Risikobewertung je Gefährdung"],
		},
		{
			code: "5.2",
			sectionCode: "5",
			title: "Risikokategorie bestimmen",
			requirementText:
				"Aus Häufigkeit und Schaden ergibt sich über die Risikomatrix die Kategorie (gering, mittel, hoch, sehr hoch); die Grenze akzeptabler Risiken ist dokumentiert.",
		},
		{
			code: "6",
			sectionCode: "6",
			title: "Risikobehandlung",
			requirementText:
				"Für nicht akzeptable Risiken ist eine Behandlung gewählt: vermeiden, reduzieren (zusätzliche Maßnahmen), transferieren oder bewusst akzeptieren; Akzeptanz nur durch die befugte Leitung und mit Begründung.",
			evidenceHints: ["Behandlungsplan", "Risikoakzeptanz mit Freigabe"],
			relatedRequirements: ["iso27001:6.1.3"],
		},
		{
			code: "7.1",
			sectionCode: "7",
			title: "Konsolidierung",
			requirementText:
				"Zusätzliche Maßnahmen sind auf Eignung, Zusammenwirken, Benutzerfreundlichkeit und Angemessenheit geprüft und mit den bestehenden Maßnahmen abgeglichen.",
		},
		{
			code: "7.2",
			sectionCode: "7",
			title: "Rückführung in den Sicherheitsprozess",
			requirementText:
				"Die Ergebnisse fließen in Sicherheitskonzept, Umsetzungsplanung und IT-Grundschutz-Check ein; die Risikoanalyse wird bei Änderungen und regelmäßig wiederholt.",
			auditQuestions: ["Wann habt ihr die Risikoanalyse zuletzt aktualisiert?"],
		},
	],
	"risk",
);

// ─── BSI-Standard 200-4 ─────────────────────────────────────────────────────

export const BSI_200_4_SECTIONS: CatalogSection[] = [
	{ code: "4", title: "Initiierung", sortOrder: 10 },
	{ code: "5", title: "Aufbau der Organisation", sortOrder: 20 },
	{ code: "6", title: "Analyse", sortOrder: 30 },
	{ code: "7", title: "Strategie und Lösungen", sortOrder: 40 },
	{ code: "8", title: "Notfallvorsorge und Bewältigung", sortOrder: 50 },
	{ code: "9", title: "Übungen und Tests", sortOrder: 60 },
	{ code: "10", title: "Aufrechterhaltung und Verbesserung", sortOrder: 70 },
];

export const BSI_200_4_REQUIREMENTS: CatalogRequirement[] = rows(
	[
		{
			code: "4.1",
			sectionCode: "4",
			title: "Verantwortung der Leitung für das BCM",
			requirementText:
				"Die Leitung beschließt das Business Continuity Management, wählt die Stufe (reaktives BCMS, Aufbau-BCMS oder Standard-BCMS) und stellt Mittel bereit.",
			evidenceHints: ["Beschluss der Leitung zum BCM"],
		},
		{
			code: "4.2",
			sectionCode: "4",
			title: "BCM-Leitlinie und Geltungsbereich",
			requirementText:
				"Eine Leitlinie zum BCM legt Ziele, Geltungsbereich, Rollen und Vorgehen fest und ist von der Leitung verabschiedet.",
			evidenceHints: ["BCM-Leitlinie"],
			relatedRequirements: ["iso27001:A.5.29"],
		},
		{
			code: "5.1",
			sectionCode: "5",
			title: "BCM-Beauftragte:r",
			requirementText:
				"Ein:e BCM-Beauftragte:r ist benannt und mit Aufgaben, Befugnissen und Zeit ausgestattet.",
			evidenceHints: ["Bestellung BCM-Beauftragte:r"],
		},
		{
			code: "5.2",
			sectionCode: "5",
			title: "Besondere Aufbauorganisation (BAO)",
			requirementText:
				"Für die Bewältigung ist eine BAO mit Krisenstab, Notfallteams und Alarmierung festgelegt; Stellvertretungen und Erreichbarkeit sind geregelt.",
			evidenceHints: ["BAO-Organigramm", "Alarmierungsplan"],
			auditQuestions: ["Wer ruft den Krisenstab ein, und wie schnell?"],
		},
		{
			code: "6.1",
			sectionCode: "6",
			title: "Business-Impact-Analyse",
			requirementText:
				"Für die Geschäftsprozesse sind Schadensauswirkungen über die Zeit bewertet, zeitkritische Prozesse bestimmt und Wiederanlaufziele (MTPD, RTO, RPO, Notbetriebsniveau) festgelegt.",
			evidenceHints: ["Business-Impact-Analyse"],
			auditQuestions: [
				"Wie habt ihr die maximal tolerierbare Ausfallzeit je Prozess bestimmt?",
			],
		},
		{
			code: "6.2",
			sectionCode: "6",
			title: "Ressourcen und Abhängigkeiten",
			requirementText:
				"Für zeitkritische Prozesse sind benötigte Ressourcen (Personal, IT, Räume, Dienstleister, Informationen) und Abhängigkeiten mit eigenen Wiederanlaufzeiten erfasst.",
			domain: "asset",
		},
		{
			code: "6.3",
			sectionCode: "6",
			title: "Risikoanalyse für das BCM",
			requirementText:
				"Gefährdungen für zeitkritische Prozesse und Ressourcen (Ausfall von Personal, Gebäude, IT, Dienstleistern) sind bewertet und behandelt.",
			domain: "risk",
		},
		{
			code: "7",
			sectionCode: "7",
			title: "Kontinuitätsstrategien und Lösungen",
			requirementText:
				"Für jede Ausfallart (Personal, Gebäude, IT, Dienstleister) ist eine Strategie gewählt und mit Lösungen hinterlegt, die die Wiederanlaufziele erreichen.",
			evidenceHints: ["Kontinuitätsstrategie"],
		},
		{
			code: "8.1",
			sectionCode: "8",
			title: "Notfallvorsorge",
			requirementText:
				"Vorsorgemaßnahmen (Redundanzen, Ausweichstandorte, Verträge, Datensicherung) sind umgesetzt und dokumentiert.",
			relatedRequirements: ["iso27001:A.5.30"],
		},
		{
			code: "8.2",
			sectionCode: "8",
			title: "Notfallhandbuch und Geschäftsfortführungspläne",
			requirementText:
				"Ein Notfallhandbuch mit Sofortmaßnahmen, Alarmierung, Geschäftsfortführungs- und Wiederanlaufplänen liegt vor, ist aktuell und für die Beteiligten im Notfall erreichbar.",
			evidenceHints: ["Notfallhandbuch", "Wiederanlaufpläne"],
		},
		{
			code: "8.3",
			sectionCode: "8",
			title: "Krisenkommunikation",
			requirementText:
				"Interne und externe Kommunikation im Notfall ist geregelt (Zuständigkeiten, Vorlagen, Kontaktlisten, Behörden und Presse).",
			domain: "incident",
		},
		{
			code: "9",
			sectionCode: "9",
			title: "Übungen und Tests",
			requirementText:
				"Ein Übungsplan sieht Tests von Alarmierung, Plänen, Wiederanlauf und Krisenstab vor; Übungen werden ausgewertet und Erkenntnisse umgesetzt.",
			evidenceHints: ["Übungsplan", "Übungsberichte"],
			auditQuestions: ["Wann habt ihr den Wiederanlauf zuletzt geübt?"],
		},
		{
			code: "10",
			sectionCode: "10",
			title: "Überprüfung und Verbesserung des BCMS",
			requirementText:
				"Das BCMS wird regelmäßig und nach Notfällen überprüft (Kennzahlen, Revision, Managementbewertung) und verbessert.",
			evidenceHints: ["BCMS-Revisionsbericht"],
		},
	],
	"continuity",
);
