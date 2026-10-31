import type { CatalogControl } from "./types";

// Common Controls IT-Grundschutz (BSI-Standard 200-2): nur, was die Methodik
// über ein ISMS nach ISO 27001 hinaus verlangt. Leitung, Leitlinie, Rollen,
// Risiko, Audit und Notfall tragen die bestehenden Controls (CC-GOV-*,
// CC-RSK-*, CC-BCM-*). Inhalte nach Modellwissen, gegen die aktuelle Fassung
// der Standards und des Kompendiums prüfen.

let order = 6000;
const next = () => {
	order += 10;
	return order;
};

export const PART_F: CatalogControl[] = [
	{
		code: "CC-BSI-01",
		title: "Strukturanalyse des Informationsverbunds",
		description:
			"Für den Informationsverbund sind Geschäftsprozesse, Informationen, Anwendungen, IT-Systeme, ICS- und IoT-Komponenten, Räume und Kommunikationsverbindungen erfasst, ihre Abhängigkeiten beschrieben und gleichartige Zielobjekte zu Gruppen zusammengefasst; ein Netzplan zeigt die Verbindungen.",
		implementationGuidance:
			"Prozesse unter /prozesse, Anwendungen, Systeme und Räume unter /assets mit Standort erfassen und verknüpfen; Gruppen nur bilden, wenn Art, Konfiguration, Schutzbedarf und Verantwortliche gleich sind. Den Netzplan als Nachweis hochladen und bei jeder wesentlichen Änderung aktualisieren.",
		domain: "asset",
		effort: "M",
		kind: "documentation",
		evidenceHints: [
			"Strukturanalyse (Zielobjekte mit Gruppen)",
			"Netzplan",
			"Abhängigkeiten zwischen Prozessen und Systemen",
		],
		auditQuestions: [
			"Welche Zielobjekte gehören zum Informationsverbund, und wie habt ihr sie gruppiert?",
			"Wann habt ihr den Netzplan zuletzt an den Ist-Zustand angeglichen?",
		],
		recommendations: [
			{
				level: "must",
				text: "Strukturanalyse bei Änderungen an Prozessen, Systemen oder Standorten nachziehen, nicht nur zur Rezertifizierung.",
				source: "BSI IT-Grundschutz",
				ref: "BSI-Standard 200-2, Kap. 8.1",
			},
		],
		testMethodHint: "inspection",
		sortOrder: next(),
	},
	{
		code: "CC-BSI-02",
		title: "Schutzbedarfsfeststellung",
		description:
			"Für Geschäftsprozesse und Informationen ist der Schutzbedarf je Grundwert (Vertraulichkeit, Integrität, Verfügbarkeit) anhand festgelegter Schadensszenarien als normal, hoch oder sehr hoch bestimmt und begründet; er ist auf Anwendungen, Systeme, Räume und Verbindungen vererbt (Maximumprinzip, Kumulations- und Verteilungseffekt).",
		implementationGuidance:
			"Schadensszenarien und Grenzen je Kategorie einmal festlegen (z. B. finanzielle Auswirkung, Gesetzesverstoß, Beeinträchtigung der Aufgabenerfüllung, Ansehen); dann je Prozess bewerten und Abweichungen bei der Vererbung begründen. Die Einstufung der Informationen in Klick (öffentlich bis streng geheim) als Ausgangspunkt nutzen.",
		domain: "risk",
		effort: "M",
		kind: "process",
		evidenceHints: [
			"Schutzbedarfsfeststellung mit Begründung",
			"Definition der Schutzbedarfskategorien",
		],
		auditQuestions: [
			"Welche Grenzen gelten bei euch für „hoch“ und „sehr hoch“?",
			"Wo weicht der Schutzbedarf eines Systems vom Maximum seiner Prozesse ab, und warum?",
		],
		testMethodHint: "inspection",
		sortOrder: next(),
	},
	{
		code: "CC-BSI-03",
		title: "Modellierung und IT-Grundschutz-Check",
		description:
			"Jedem Zielobjekt sind die passenden Bausteine des IT-Grundschutz-Kompendiums zugeordnet; je Baustein ist der Umsetzungsstand der Anforderungen der gewählten Absicherung erhoben (ja, teilweise, nein, entbehrlich mit Begründung), offene Anforderungen führen mit Verantwortlichen und Fristen in die Umsetzungsplanung.",
		implementationGuidance:
			"Modellierung als Tabelle pflegen (je Zielobjekt die passenden Bausteine); den Check je Baustein mit Datum, befragten Personen und Ergebnis dokumentieren. Entbehrlich nur mit nachvollziehbarer Begründung oder Ersatzmaßnahme. Nach einer neuen Edition des Kompendiums die Modellierung prüfen.",
		domain: "governance",
		effort: "L",
		kind: "process",
		evidenceHints: [
			"Modellierung (Baustein-Zuordnung)",
			"IT-Grundschutz-Check je Baustein",
			"Realisierungsplan",
		],
		auditQuestions: [
			"Welche Bausteine habt ihr welchen Zielobjekten zugeordnet, und welche fehlen?",
			"Wie begründet ihr Anforderungen, die ihr als entbehrlich bewertet habt?",
		],
		testMethodHint: "interview",
		sortOrder: next(),
	},
];
