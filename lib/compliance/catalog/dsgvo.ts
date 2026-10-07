import type { CatalogRequirement, CatalogSection } from "./types";

// DSGVO (VO (EU) 2016/679) + BDSG. Gilt für alle Mandanten (Nav-Gruppe
// Register → Datenschutz). Finanzspezifika: GwG § 11a als Rechtsgrundlage,
// Aufbewahrung GwG § 8 überlagert Löschung, biometrische Daten bei Video-Ident,
// Scoring im Transaktionsmonitoring (Art. 22), DSFA vor Inbetriebnahme des
// Monitorings (Businessplan 17.9). Paraphrasen, kein Rechtsrat.

export const DSGVO_SECTIONS: CatalogSection[] = [
	{
		code: "GRUND",
		title: "Grundsätze und Rechtmäßigkeit (Art. 5–11)",
		sortOrder: 10,
	},
	{
		code: "RECHTE",
		title: "Rechte der betroffenen Person (Art. 12–22)",
		sortOrder: 20,
	},
	{
		code: "VERANT",
		title: "Verantwortlicher und Auftragsverarbeiter (Art. 24–31)",
		sortOrder: 30,
	},
	{
		code: "SICH",
		title: "Sicherheit und Datenschutzverletzungen (Art. 32–36)",
		sortOrder: 40,
	},
	{
		code: "DSB",
		title: "Datenschutzbeauftragte Person (Art. 37–39, § 38 BDSG)",
		sortOrder: 50,
	},
	{
		code: "TRANSFER",
		title: "Übermittlung in Drittländer (Art. 44–49)",
		sortOrder: 60,
	},
	{ code: "SANK", title: "Haftung, Sanktionen, BDSG", sortOrder: 70 },
];

export const DSGVO_REQUIREMENTS: CatalogRequirement[] = [
	{
		code: "Art.5",
		sectionCode: "GRUND",
		title: "Grundsätze und Rechenschaftspflicht",
		requirementText:
			"Personenbezogene Daten werden rechtmäßig, transparent, zweckgebunden, datenminimiert, richtig, speicherbegrenzt und sicher verarbeitet; der Verantwortliche muss die Einhaltung nachweisen können (Art. 5 Abs. 2).",
		domain: "compliance",
		evidenceHints: [
			"Verarbeitungsverzeichnis",
			"Löschkonzept",
			"Datenschutz-Managementsystem",
		],
		relatedRequirements: ["iso27001:A.5.34", "gwg:§8"],
		recommendations: [
			{
				level: "must",
				text: "Rechenschaft heißt Nachweis: jede Verarbeitung mit Zweck, Rechtsgrundlage, Frist und TOMs im Verzeichnis — und die Audit-Kette als Beleg, wer was wann entschieden hat.",
				source: "EDPB",
			},
		],
		sortOrder: 10,
	},
	{
		code: "Art.6",
		sectionCode: "GRUND",
		title: "Rechtmäßigkeit der Verarbeitung",
		requirementText:
			"Jede Verarbeitung braucht eine Rechtsgrundlage: Vertrag (Zahlungsdienst), rechtliche Verpflichtung (GwG § 11a, ZAG, DAC8), berechtigtes Interesse (Betrugsprävention) oder Einwilligung — dokumentiert je Verarbeitungstätigkeit.",
		guidance:
			"GwG § 11a erlaubt Verpflichteten die Verarbeitung zur Erfüllung der GwG-Pflichten; Betrugsprävention stützt sich auf Art. 6 Abs. 1 f mit Interessenabwägung.",
		domain: "compliance",
		evidenceHints: ["Rechtsgrundlagen je Verarbeitung", "Interessenabwägungen"],
		relatedRequirements: ["gwg:§10"],
		sortOrder: 20,
	},
	{
		code: "Art.9",
		sectionCode: "GRUND",
		title: "Besondere Kategorien (biometrische Daten bei Identifizierung)",
		requirementText:
			"Biometrische Daten (Video-/Auto-Ident, Liveness-Check) sind besondere Kategorien; die Verarbeitung braucht eine Ausnahme nach Art. 9 Abs. 2 (ausdrückliche Einwilligung oder Rechtsvorschrift) und eine DSFA.",
		domain: "compliance",
		evidenceHints: [
			"Einwilligungstexte",
			"DSFA Identifizierung",
			"AVV Ident-Dienstleister",
		],
		relatedRequirements: ["gwg:§11-13"],
		sortOrder: 30,
	},
	{
		code: "Art.12-15",
		sectionCode: "RECHTE",
		title: "Information und Auskunft",
		requirementText:
			"Betroffene werden transparent informiert (Art. 13/14) und erhalten auf Antrag binnen eines Monats (verlängerbar um zwei) Auskunft über ihre Daten, Zwecke, Empfänger, Speicherdauer und Herkunft (Art. 15).",
		domain: "compliance",
		evidenceHints: [
			"Datenschutzhinweise",
			"Anfragenregister mit Fristen",
			"Identitätsprüfung bei Anfragen",
		],
		tools: {
			startup: ["Klick Datenschutz → Anfragen"],
			scale: ["OneTrust Privacy", "Usercentrics"],
		},
		sortOrder: 100,
	},
	{
		code: "Art.16-18",
		sectionCode: "RECHTE",
		title: "Berichtigung, Löschung, Einschränkung",
		requirementText:
			"Unrichtige Daten werden berichtigt, nicht mehr erforderliche gelöscht — soweit keine Aufbewahrungspflicht (GwG § 8: fünf Jahre, HGB/AO: zehn Jahre) entgegensteht; dann wird die Verarbeitung eingeschränkt und das Löschdatum vorgemerkt.",
		guidance:
			"Löschkonzept mit Aufbewahrungsklassen; Krypto-Shredding für Mandantendaten; Audit-Log ist von Löschung ausgenommen (Nachweispflicht).",
		domain: "compliance",
		evidenceHints: [
			"Löschkonzept",
			"Löschprotokolle",
			"Einschränkungsvermerke",
		],
		relatedRequirements: ["iso27001:A.5.33", "gwg:§8"],
		sortOrder: 110,
	},
	{
		code: "Art.20-22",
		sectionCode: "RECHTE",
		title: "Datenübertragbarkeit, Widerspruch, automatisierte Entscheidungen",
		requirementText:
			"Betroffene erhalten ihre Daten in einem gängigen Format, können der Verarbeitung aus berechtigtem Interesse widersprechen und dürfen keiner ausschließlich automatisierten Entscheidung mit erheblicher Wirkung unterworfen werden — Transaktionsmonitoring und Betrugs-Scoring brauchen menschliche Letztentscheidung oder eine gesetzliche Grundlage.",
		domain: "compliance",
		evidenceHints: [
			"Exportformat",
			"Vier-Augen-Entscheidung bei Sperren",
			"Information über Logik des Scorings",
		],
		relatedRequirements: ["gwg:§27ZAG-TM", "zag:RTS-Art.2"],
		sortOrder: 120,
	},
	{
		code: "Art.24-25",
		sectionCode: "VERANT",
		title:
			"Verantwortung, Datenschutz durch Technikgestaltung und Voreinstellungen",
		requirementText:
			"Der Verantwortliche setzt geeignete technische und organisatorische Maßnahmen um und weist sie nach; Datenschutz ist in Systeme eingebaut (Pseudonymisierung, Datenminimierung) und standardmäßig datensparsam voreingestellt.",
		domain: "compliance",
		evidenceHints: [
			"Privacy-by-Design-Checkliste im Change-Prozess",
			"Feldverschlüsselung",
			"Rollenkonzept",
		],
		relatedRequirements: ["iso27001:A.8.11", "iso27001:A.8.25"],
		sortOrder: 200,
	},
	{
		code: "Art.28",
		sectionCode: "VERANT",
		title: "Auftragsverarbeitung",
		requirementText:
			"Auftragsverarbeiter (Hosting, KYC, Analytics, Mail) werden sorgfältig ausgewählt, per Vertrag mit den Pflichtinhalten des Art. 28 Abs. 3 gebunden (Weisung, Vertraulichkeit, TOMs, Unterauftrag, Löschung, Audit) und überwacht.",
		domain: "supplier",
		evidenceHints: [
			"AVV je Dienstleister",
			"Unterauftragnehmerliste",
			"TOM-Nachweise",
		],
		relatedRequirements: ["dora:Art.30", "iso27001:A.5.19"],
		recommendations: [
			{
				level: "must",
				text: "Dienstleister mit personenbezogenen Daten ohne AVV = Gap im Register (/dienstleister: „AVV fehlt“).",
				source: "intern",
			},
		],
		sortOrder: 210,
	},
	{
		code: "Art.30",
		sectionCode: "VERANT",
		title: "Verzeichnis von Verarbeitungstätigkeiten",
		requirementText:
			"Ein Verzeichnis aller Verarbeitungstätigkeiten mit Zwecken, Kategorien, Empfängern, Drittlandtransfers, Löschfristen und TOMs wird geführt und der Aufsicht auf Anfrage vorgelegt.",
		domain: "compliance",
		evidenceHints: ["VVT (Export)"],
		tools: {
			startup: ["Klick Datenschutz → VVT"],
			scale: ["OneTrust", "DataGuard"],
		},
		sortOrder: 220,
	},
	{
		code: "Art.32",
		sectionCode: "SICH",
		title: "Sicherheit der Verarbeitung",
		requirementText:
			"Dem Risiko angemessene Maßnahmen: Pseudonymisierung und Verschlüsselung, Vertraulichkeit, Integrität, Verfügbarkeit und Belastbarkeit, Wiederherstellbarkeit, regelmäßige Überprüfung der Wirksamkeit.",
		domain: "compliance",
		evidenceHints: [
			"TOM-Dokumentation",
			"Verschlüsselungskonzept",
			"Testprogramm",
		],
		relatedRequirements: [
			"iso27001:A.8.24",
			"dora:Art.9(2)",
			"nis2:Art.21(2)(h)",
		],
		sortOrder: 300,
	},
	{
		code: "Art.33",
		sectionCode: "SICH",
		title: "Meldung von Datenschutzverletzungen an die Aufsicht",
		requirementText:
			"Verletzungen des Schutzes personenbezogener Daten werden binnen 72 Stunden nach Bekanntwerden der Aufsichtsbehörde gemeldet (Art, Kategorien, Folgen, Maßnahmen), sofern kein Risiko ausgeschlossen ist; alle Verletzungen werden dokumentiert.",
		guidance:
			"Ein IKT-Vorfall mit Datenabfluss ist DORA- und DSGVO-Vorfall zugleich — Regime „dsgvo“ auf dem Vorfall setzt die 72-h-Uhr.",
		domain: "incident",
		evidenceHints: [
			"Vorfallregister mit Regime dsgvo",
			"Meldungen",
			"Dokumentation nicht gemeldeter Verletzungen",
		],
		relatedRequirements: ["dora:Art.19", "iso27001:A.5.24", "nis2:Art.23"],
		sortOrder: 310,
	},
	{
		code: "Art.34",
		sectionCode: "SICH",
		title: "Benachrichtigung der betroffenen Personen",
		requirementText:
			"Bei voraussichtlich hohem Risiko werden Betroffene unverzüglich in klarer Sprache informiert — außer die Daten waren verschlüsselt oder das Risiko ist durch Maßnahmen beseitigt.",
		domain: "incident",
		evidenceHints: ["Kommunikationsvorlage", "Entscheidungsvermerk"],
		sortOrder: 320,
	},
	{
		code: "Art.35-36",
		sectionCode: "SICH",
		title: "Datenschutz-Folgenabschätzung und vorherige Konsultation",
		requirementText:
			"Für Verarbeitungen mit voraussichtlich hohem Risiko (systematische Überwachung, Scoring, biometrische Identifizierung, umfangreiche Finanzdaten) wird vorab eine DSFA durchgeführt; bleibt ein hohes Restrisiko, wird die Aufsicht konsultiert.",
		guidance:
			"Businessplan 17.9: DSFA für Transaktionsmonitoring und Blockchain-Analytics vor Inbetriebnahme.",
		domain: "compliance",
		evidenceHints: ["DSFA-Berichte", "Muss-Liste der Aufsicht geprüft"],
		sortOrder: 330,
	},
	{
		code: "Art.37-39",
		sectionCode: "DSB",
		title: "Datenschutzbeauftragte Person",
		requirementText:
			"Eine datenschutzbeauftragte Person wird benannt (Pflicht bei Kerntätigkeit mit umfangreicher Überwachung bzw. nach § 38 BDSG ab 20 ständig mit Verarbeitung befassten Personen), der Aufsicht gemeldet, fachlich eingebunden, unabhängig und mit Ressourcen ausgestattet.",
		domain: "governance",
		appliesToRoles: ["any"],
		evidenceHints: ["Bestellung", "Meldung an Aufsicht", "Berichte der DSB"],
		relatedRequirements: ["iso27001:5.3"],
		sortOrder: 400,
	},
	{
		code: "BDSG-§38",
		sectionCode: "DSB",
		title: "Benennungspflicht nach BDSG",
		requirementText:
			"Unabhängig von der Personenzahl ist eine DSB zu benennen, wenn eine DSFA-pflichtige Verarbeitung erfolgt oder Daten geschäftsmäßig zur Übermittlung/Markt-/Meinungsforschung verarbeitet werden — für Zahlungs- und Krypto-Institute regelmäßig der Fall.",
		domain: "governance",
		evidenceHints: ["Prüfvermerk Benennungspflicht"],
		sortOrder: 410,
	},
	{
		code: "Art.44-49",
		sectionCode: "TRANSFER",
		title: "Übermittlung in Drittländer",
		requirementText:
			"Übermittlungen in Drittländer (US-Cloud, Analytics, Travel-Rule-Partner in Korridorländern) brauchen einen Angemessenheitsbeschluss (z. B. EU-US Data Privacy Framework, UK, CH) oder Standardvertragsklauseln mit Transfer-Impact-Assessment; Ausnahmen des Art. 49 nur im Einzelfall.",
		domain: "compliance",
		evidenceHints: [
			"Transferregister",
			"SCC + TIA",
			"Datenstandorte je Dienstleister",
		],
		relatedRequirements: ["dora:Art.30"],
		sortOrder: 500,
	},
	{
		code: "BDSG-§26",
		sectionCode: "SANK",
		title: "Beschäftigtendatenschutz",
		requirementText:
			"Daten von Mitarbeitenden werden nur verarbeitet, soweit es für das Beschäftigungsverhältnis, die Zuverlässigkeitsprüfung (GwG § 6 Abs. 2 Nr. 5) oder gesetzliche Pflichten erforderlich ist; Überwachung (Logging, Zugriffskontrolle) ist verhältnismäßig und transparent.",
		domain: "hr",
		evidenceHints: [
			"Betriebsvereinbarung/Information Mitarbeitende",
			"Zweckbindung der Protokolle",
		],
		relatedRequirements: ["iso27001:A.6.1", "gwg:§6"],
		sortOrder: 600,
	},
	{
		code: "Art.82-83",
		sectionCode: "SANK",
		title: "Haftung und Bußgelder",
		requirementText:
			"Verstöße können Schadensersatz und Bußgelder bis 20 Mio € oder 4 % des Jahresumsatzes nach sich ziehen; Verstöße gegen Melde-, Nachweis- und Betroffenenrechtspflichten sind die häufigsten Bußgeldgründe — das Datenschutzrisiko wird im Risikoregister geführt.",
		domain: "compliance",
		evidenceHints: [
			"Risiko „Datenschutzverstoß“ im Register",
			"Versicherung (Cyber/D&O)",
		],
		sortOrder: 610,
	},
];
