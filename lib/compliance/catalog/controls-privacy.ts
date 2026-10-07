import type { CatalogControl } from "./types";

// Common Controls Datenschutz (P5): sechs Controls, die DSGVO-Pflichten
// bündeln und zugleich ISO A.5.34/A.5.33, DORA Art. 30 und GwG § 8 bedienen.
// CC-CMP-01 (Datenschutz-Management, P1) bleibt der Dachcontrol.

let order = 4000;
const next = () => {
	order += 10;
	return order;
};

export const PART_D: CatalogControl[] = [
	{
		code: "CC-PRV-01",
		title: "Verarbeitungsverzeichnis und Rechtsgrundlagen",
		description:
			"Alle Verarbeitungstätigkeiten sind mit Zweck, Rechtsgrundlage, Kategorien, Empfängern, Drittlandtransfer, Löschfrist und TOMs verzeichnet; das Verzeichnis ist aktuell und exportierbar.",
		implementationGuidance:
			"/datenschutz → VVT: je Tätigkeit ein Eintrag; Dienstleister aus dem Register verknüpfen; Löschklassen aus dem Löschkonzept; jährlicher Review durch die DSB.",
		domain: "compliance",
		effort: "M",
		kind: "documentation",
		evidenceHints: ["VVT-Export", "Rechtsgrundlagen-Matrix"],
		testMethodHint: "inspection",
		sortOrder: next(),
	},
	{
		code: "CC-PRV-02",
		title: "Betroffenenrechte und Fristen",
		description:
			"Anfragen (Auskunft, Löschung, Berichtigung, Widerspruch, Portabilität, Einschränkung) werden registriert, identitätsgeprüft und binnen eines Monats (verlängerbar um zwei) beantwortet; Aufbewahrungspflichten werden begründet gegengehalten.",
		implementationGuidance:
			"/datenschutz → Anfragen: Uhr ab Eingang, Erinnerung bei 7 Tagen Rest; Pseudonym statt Klarname (verschlüsselt); Antwortvorlagen je Anfragetyp.",
		domain: "compliance",
		effort: "M",
		kind: "process",
		evidenceHints: ["Anfragenregister", "Antwortnachweise", "Fristenstatistik"],
		testMethodHint: "reperformance",
		sortOrder: next(),
	},
	{
		code: "CC-PRV-03",
		title: "Datenschutz-Folgenabschätzung",
		description:
			"Risikoreiche Verarbeitungen (Monitoring, Scoring, Biometrie, Analytics) werden vor Inbetriebnahme mit einer DSFA bewertet; Restrisiken und Maßnahmen sind dokumentiert, bei hohem Restrisiko wird die Aufsicht konsultiert.",
		implementationGuidance:
			"DSFA-Vorlage (Beschreibung, Notwendigkeit, Risiken, Maßnahmen, Stellungnahme DSB); im Change-Prozess als Pflichtfrage; Verknüpfung mit Risikoregister.",
		domain: "compliance",
		effort: "M",
		kind: "documentation",
		evidenceHints: ["DSFA-Berichte", "Konsultationsschreiben"],
		testMethodHint: "inspection",
		sortOrder: next(),
	},
	{
		code: "CC-PRV-04",
		title: "Auftragsverarbeitung und Drittlandtransfer",
		description:
			"Jeder Dienstleister mit personenbezogenen Daten hat einen AVV nach Art. 28 Abs. 3; Drittlandtransfers stützen sich auf Angemessenheitsbeschluss oder SCC mit Transfer-Impact-Assessment; Unterauftragnehmer sind bekannt.",
		implementationGuidance:
			"Dienstleister-Register: Flag „verarbeitet personenbezogene Daten“ + AVV-Datum; fehlender AVV = Gap; Datenstandorte je Dienstleister; TIA-Vorlage.",
		domain: "supplier",
		effort: "M",
		kind: "organizational",
		evidenceHints: [
			"AVV je Dienstleister",
			"SCC/TIA",
			"Unterauftragnehmerliste",
		],
		testMethodHint: "inspection",
		sortOrder: next(),
	},
	{
		code: "CC-PRV-05",
		title: "Meldung von Datenschutzverletzungen (72 Stunden)",
		description:
			"Datenschutzverletzungen werden erkannt, bewertet, binnen 72 Stunden der Aufsicht gemeldet (sofern Risiko) und bei hohem Risiko den Betroffenen mitgeteilt; alle Verletzungen sind dokumentiert.",
		implementationGuidance:
			"Vorfall mit Regime „dsgvo“ → 72-h-Uhr; Entscheidungsbaum Risiko/kein Risiko; Meldevorlage der Aufsicht; Lessons Learned als Abweichung.",
		domain: "incident",
		effort: "S",
		kind: "process",
		evidenceHints: [
			"Vorfallregister (Regime dsgvo)",
			"Meldungen",
			"Dokumentation nicht gemeldeter Fälle",
		],
		testMethodHint: "reperformance",
		sortOrder: next(),
	},
	{
		code: "CC-PRV-06",
		title: "Datenschutzbeauftragte Person und Datenschutz by Design",
		description:
			"Eine DSB ist benannt, gemeldet, unabhängig und eingebunden; Datenschutz durch Technikgestaltung und Voreinstellungen ist im Entwicklungs- und Change-Prozess verankert (Datenminimierung, Pseudonymisierung, Rollen).",
		implementationGuidance:
			"Pflichtfunktion dpo im Rollenregister; Privacy-Check im Change-Workflow; Feldverschlüsselung sensibler Spalten; jährlicher DSB-Bericht an die Leitung.",
		domain: "governance",
		effort: "S",
		kind: "organizational",
		evidenceHints: [
			"Bestellung DSB",
			"Meldung an Aufsicht",
			"Privacy-Checkliste",
		],
		testMethodHint: "interview",
		sortOrder: next(),
	},
];
