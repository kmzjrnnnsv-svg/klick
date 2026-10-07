import type { CatalogRequirement, CatalogSection } from "./types";

// GwG (Geldwäschegesetz) + GwGMeldV. Authoring-Quelle:
// docs/regulatory/anforderungskatalog-2026-10.md, Abschnitt 6.1. Teile werden
// am 10.07.2027 von der AMLR verdrängt (effectiveUntil). Paraphrasen, kein Rechtsrat.

export const GWG_SECTIONS: CatalogSection[] = [
	{
		code: "ORG",
		title: "Risikomanagement und Organisation (§§ 2–9)",
		sortOrder: 10,
	},
	{ code: "SOR", title: "Sorgfaltspflichten (§§ 10–17)", sortOrder: 20 },
	{ code: "MEL", title: "Meldewesen (§§ 43–47)", sortOrder: 30 },
	{ code: "TM", title: "Monitoring (§ 27 ZAG i. V. m. GwG)", sortOrder: 40 },
];

const OBL = ["aml_obliged", "financial_entity", "agent"] as const;
const UNTIL = "2027-07-09" as const;

export const GWG_REQUIREMENTS: CatalogRequirement[] = [
	{
		code: "§2",
		sectionCode: "ORG",
		title: "Verpflichtetenstatus",
		requirementText:
			"Zahlungsinstitute, E-Geld-Institute, Kryptowerte-Dienstleister und ihre Agenten sind Verpflichtete nach § 2 GwG; der Status wird festgestellt und dokumentiert.",
		domain: "aml",
		appliesToRoles: [...OBL],
		evidenceHints: ["Statusfeststellung"],
		relatedRequirements: ["zag:§1(1)"],
		sortOrder: 10,
	},
	{
		code: "§4",
		sectionCode: "ORG",
		title: "Risikomanagement und verantwortliches Leitungsmitglied",
		requirementText:
			"Verpflichtete verfügen über ein wirksames Risikomanagement (Risikoanalyse + Sicherungsmaßnahmen) und benennen ein Mitglied der Leitungsebene, das dafür verantwortlich ist.",
		domain: "aml",
		appliesToRoles: [...OBL],
		evidenceHints: ["GL-Beschluss"],
		relatedRequirements: ["amlr:Art.9", "zag-marisk:AT3"],
		sortOrder: 20,
	},
	{
		code: "§5",
		sectionCode: "ORG",
		title: "Unternehmensweite Risikoanalyse",
		requirementText:
			"Die Risiken aus Kunden, Produkten, Transaktionen, Vertriebskanälen und Ländern — einschließlich Krypto-Spezifika wie Mixer, Privacy Coins und Self-hosted Wallets — werden ermittelt, bewertet, dokumentiert, jährlich aktualisiert und von der Leitung genehmigt.",
		domain: "aml",
		appliesToRoles: [...OBL],
		effectiveUntil: UNTIL,
		evidenceHints: ["Risikoanalyse"],
		tools: {
			startup: ["Excel-Vorlage", "Klick AML"],
			scale: ["Fenergo", "Hawk AI Risikomodule"],
		},
		relatedRequirements: ["amlr:Art.10", "iso27001:6.1.2"],
		sortOrder: 30,
	},
	{
		code: "§6",
		sectionCode: "ORG",
		title: "Interne Sicherungsmaßnahmen",
		requirementText:
			"Interne Grundsätze, Verfahren und Kontrollen (Sorgfalt, Meldung, Aufzeichnung), Bestellung eines Geldwäschebeauftragten, Zuverlässigkeitsprüfung und Unterrichtung der Mitarbeitenden, Überprüfung der Maßnahmen, Hinweisgebersystem und angemessene Datenverarbeitungssysteme zur Erkennung auffälliger Transaktionen.",
		domain: "aml",
		appliesToRoles: [...OBL],
		effectiveUntil: UNTIL,
		evidenceHints: ["AML-Handbuch", "Schulungsnachweise", "Hinweisgeberkanal"],
		tools: {
			startup: ["ACAMS", "lawpilots", "EQS Integrity Line"],
			scale: ["LegalTegrity"],
		},
		relatedRequirements: ["amlr:Art.9", "iso27001:A.6.3", "iso27001:A.6.1"],
		sortOrder: 40,
	},
	{
		code: "§7",
		sectionCode: "ORG",
		title: "Geldwäschebeauftragte:r und Stellvertretung",
		requirementText:
			"Ein Geldwäschebeauftragter auf Führungsebene und ein Stellvertreter werden bestellt, der BaFin vorab angezeigt und mit Befugnissen, Mitteln und direktem Zugang zur Geschäftsleitung ausgestattet; sie berichten der Leitung mindestens jährlich.",
		domain: "aml",
		appliesToRoles: [...OBL],
		evidenceHints: ["Bestellung", "BaFin-Anzeige", "Jahresbericht"],
		relatedRequirements: ["amlr:Art.11", "iso27001:5.3"],
		sortOrder: 50,
	},
	{
		code: "§8",
		sectionCode: "ORG",
		title: "Aufzeichnung und Aufbewahrung",
		requirementText:
			"Angaben und Informationen aus Sorgfaltspflichten, Transaktionen, Verdachtsmeldungen und Risikoanalysen werden aufgezeichnet und fünf Jahre aufbewahrt; Löschung danach unverzüglich.",
		domain: "aml",
		appliesToRoles: [...OBL],
		evidenceHints: ["Archivkonzept"],
		tools: { startup: ["S3 Object Lock"], scale: ["Revisionssicheres Archiv"] },
		relatedRequirements: ["tfr:Art.26", "iso27001:A.5.33"],
		sortOrder: 60,
	},
	{
		code: "§9",
		sectionCode: "ORG",
		title: "Gruppenweite Pflichten",
		requirementText:
			"Mutterunternehmen einer Gruppe setzen gruppenweite Risikoanalyse, Sicherungsmaßnahmen, Informationsaustausch und Datenschutzregelungen um — relevant bei Tochtergesellschaften oder Zweigniederlassungen.",
		domain: "aml",
		appliesToRoles: [...OBL],
		effectiveUntil: UNTIL,
		evidenceHints: ["Gruppenrichtlinie"],
		sortOrder: 70,
	},
	{
		code: "§10",
		sectionCode: "SOR",
		title: "Allgemeine Sorgfaltspflichten",
		requirementText:
			"Identifizierung des Vertragspartners und ggf. der auftretenden Person, Abklärung des wirtschaftlich Berechtigten, Einholung von Informationen zu Zweck und Art der Geschäftsbeziehung, PEP-Feststellung und kontinuierliche Überwachung inklusive Aktualisierung der Daten.",
		domain: "aml",
		appliesToRoles: [...OBL],
		effectiveUntil: UNTIL,
		evidenceHints: ["KYC/KYB-Arbeitsanweisung"],
		tools: { startup: ["Sumsub"], scale: ["Fenergo"] },
		relatedRequirements: ["amlr:Art.19-28"],
		sortOrder: 100,
	},
	{
		code: "§11-13",
		sectionCode: "SOR",
		title: "Identifizierung und Überprüfung",
		requirementText:
			"Identifizierung vor Begründung der Geschäftsbeziehung mit zulässigen Dokumenten und Verfahren (Vor-Ort, Video-Ident, eID, qualifizierte elektronische Signatur); Angaben werden erhoben und überprüft.",
		domain: "aml",
		appliesToRoles: [...OBL],
		effectiveUntil: UNTIL,
		evidenceHints: ["Ident-Protokolle"],
		tools: { startup: ["IDnow", "WebID", "Nect"], scale: ["Sumsub", "Veriff"] },
		relatedRequirements: ["amlr:Art.19-28", "amlr:Art.28-RTS"],
		sortOrder: 110,
	},
	{
		code: "§23a",
		sectionCode: "SOR",
		title: "Transparenzregister-Einsicht und Unstimmigkeitsmeldung",
		requirementText:
			"Bei juristischen Personen wird der Nachweis der Registrierung im Transparenzregister eingeholt bzw. eingesehen; Unstimmigkeiten zu den eigenen Feststellungen werden unverzüglich gemeldet.",
		domain: "aml",
		appliesToRoles: [...OBL],
		evidenceHints: ["Registerauszüge", "Unstimmigkeitsmeldungen"],
		tools: {
			startup: ["Transparenzregister-Portal", "North Data"],
			scale: ["Moody's Orbis"],
		},
		sortOrder: 120,
	},
	{
		code: "§14",
		sectionCode: "SOR",
		title: "Vereinfachte Sorgfaltspflichten",
		requirementText:
			"Bei nachweislich geringem Risiko können Umfang und Zeitpunkt der Sorgfaltsmaßnahmen angemessen reduziert werden; die Begründung wird dokumentiert.",
		domain: "aml",
		appliesToRoles: [...OBL],
		effectiveUntil: UNTIL,
		evidenceHints: ["Begründung"],
		sortOrder: 130,
	},
	{
		code: "§15",
		sectionCode: "SOR",
		title: "Verstärkte Sorgfaltspflichten",
		requirementText:
			"Bei höherem Risiko (PEP, Hochrisikoländer, ungewöhnliche oder komplexe Transaktionen, Korrespondenzbeziehungen) werden zusätzliche Maßnahmen ergriffen: Zustimmung der Führungsebene, Herkunft der Vermögenswerte, verstärkte Überwachung.",
		domain: "aml",
		appliesToRoles: [...OBL],
		effectiveUntil: UNTIL,
		evidenceHints: ["EDD-Akten"],
		relatedRequirements: ["amlr:Art.37", "sanctions:FATF"],
		sortOrder: 140,
	},
	{
		code: "§17",
		sectionCode: "SOR",
		title: "Ausführung durch Dritte und Auslagerung",
		requirementText:
			"Sorgfaltspflichten können durch zuverlässige Dritte oder vertraglich gebundene Dienstleister ausgeführt werden; die Verantwortung bleibt beim Verpflichteten, Unterlagen sind unverzüglich verfügbar.",
		domain: "aml",
		appliesToRoles: [...OBL],
		effectiveUntil: UNTIL,
		evidenceHints: ["Vertrag", "Kontrollen"],
		relatedRequirements: ["dora:Art.28(1-2)", "zag:§26"],
		sortOrder: 150,
	},
	{
		code: "§43",
		sectionCode: "MEL",
		title: "Verdachtsmeldung an die FIU",
		requirementText:
			"Tatsachen, die auf Geldwäsche oder Terrorismusfinanzierung hindeuten, werden unabhängig vom Wert unverzüglich elektronisch (goAML) an die FIU gemeldet.",
		domain: "aml",
		appliesToRoles: [...OBL],
		legalBasisRefs: ["GwGMeldV"],
		evidenceHints: ["SAR-Workflow", "Meldebelege"],
		tools: { startup: ["goAML-Portal"], scale: ["Hawk AI", "Unit21"] },
		relatedRequirements: ["micar:Art.92"],
		sortOrder: 200,
	},
	{
		code: "§46",
		sectionCode: "MEL",
		title: "Durchführungsverbot",
		requirementText:
			"Eine gemeldete Transaktion darf frühestens durchgeführt werden, wenn die FIU oder Staatsanwaltschaft zustimmt oder der dritte Werktag nach Abgang der Meldung verstrichen ist, ohne dass die Durchführung untersagt wurde.",
		domain: "aml",
		appliesToRoles: [...OBL],
		evidenceHints: ["Stillhalte-Logik im System"],
		sortOrder: 210,
	},
	{
		code: "§47",
		sectionCode: "MEL",
		title: "Verbot der Informationsweitergabe",
		requirementText:
			"Vertragspartner, Auftraggeber und Dritte dürfen nicht über eine beabsichtigte oder erstattete Meldung oder ein Ermittlungsverfahren informiert werden (Tipping-off-Verbot).",
		domain: "aml",
		appliesToRoles: [...OBL],
		evidenceHints: ["Mitarbeiterweisung"],
		sortOrder: 220,
	},
	{
		code: "§27ZAG-TM",
		sectionCode: "TM",
		title: "EDV-gestütztes Transaktionsmonitoring und Sanktionsscreening",
		requirementText:
			"Zahlungsinstitute betreiben angemessene Datenverarbeitungssysteme, die zweifelhafte oder ungewöhnliche Transaktionen und Sanktionstreffer erkennen; Regelwerk und Trefferbearbeitung sind dokumentiert.",
		domain: "aml",
		appliesToRoles: [...OBL],
		evidenceHints: ["Monitoring-Regelwerk", "Treffer-Bearbeitung"],
		tools: {
			startup: ["Hawk AI", "ComplyAdvantage"],
			scale: ["Feedzai", "LSEG World-Check", "Dow Jones R&C"],
		},
		relatedRequirements: ["tfr:ONCHAIN", "sanctions:Screening"],
		sortOrder: 300,
	},
];
