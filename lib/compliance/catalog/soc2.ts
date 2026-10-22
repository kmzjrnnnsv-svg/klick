import type { CatalogRequirement, CatalogSection } from "./types";

// SOC 2 — Trust Services Criteria (AICPA). Freiwilliges Prüfungsschema, das
// institutionelle Kunden, Banken und Partner von Kryptowerte-Dienstleistern
// regelmäßig verlangen (Typ I: Ausgestaltung zum Stichtag, Typ II: Wirksamkeit
// über einen Zeitraum). Die Common Criteria (CC1–CC9) gelten immer;
// Verfügbarkeit, Vertraulichkeit, Verarbeitungsintegrität und Datenschutz
// wählt das Unternehmen für den Prüfungsumfang — nicht gewählte Kategorien
// unter Anforderungen als „nicht anwendbar“ markieren. Paraphrasen, nicht der
// AICPA-Text; vor der Prüfung gegen die aktuelle Fassung abgleichen.

export const SOC2_SECTIONS: CatalogSection[] = [
	{ code: "CC1", title: "Kontrollumfeld", sortOrder: 10 },
	{ code: "CC2", title: "Information und Kommunikation", sortOrder: 20 },
	{ code: "CC3", title: "Risikobeurteilung", sortOrder: 30 },
	{ code: "CC4", title: "Überwachung", sortOrder: 40 },
	{ code: "CC5", title: "Kontrollaktivitäten", sortOrder: 50 },
	{ code: "CC6", title: "Logischer und physischer Zugriff", sortOrder: 60 },
	{ code: "CC7", title: "Systembetrieb", sortOrder: 70 },
	{ code: "CC8", title: "Änderungsmanagement", sortOrder: 80 },
	{ code: "CC9", title: "Risikominderung", sortOrder: 90 },
	{ code: "A1", title: "Verfügbarkeit (optional)", sortOrder: 100 },
	{ code: "C1", title: "Vertraulichkeit (optional)", sortOrder: 110 },
	{
		code: "PI1",
		title: "Verarbeitungsintegrität (optional)",
		sortOrder: 120,
	},
	{ code: "P", title: "Datenschutz (optional)", sortOrder: 130 },
];

type Row = [
	code: string,
	section: string,
	title: string,
	text: string,
	domain: CatalogRequirement["domain"],
];

// Kompakte Schreibweise wie in control-requirements.ts — die Kriterien sind
// kurz und gleich gebaut.
const ROWS: Row[] = [
	// CC1 Kontrollumfeld
	[
		"CC1.1",
		"CC1",
		"Integrität und ethische Werte",
		"Die Organisation bekennt sich zu Integrität und ethischen Werten, legt Verhaltensregeln fest und ahndet Verstöße.",
		"governance",
	],
	[
		"CC1.2",
		"CC1",
		"Aufsicht durch das Leitungsorgan",
		"Das Leitungs- bzw. Aufsichtsorgan ist unabhängig genug und überwacht Ausgestaltung und Wirksamkeit der internen Kontrollen.",
		"governance",
	],
	[
		"CC1.3",
		"CC1",
		"Strukturen, Berichtswege und Befugnisse",
		"Die Leitung legt Strukturen, Berichtswege sowie Befugnisse und Verantwortlichkeiten fest, um die Ziele zu erreichen.",
		"governance",
	],
	[
		"CC1.4",
		"CC1",
		"Kompetenz der Beschäftigten",
		"Die Organisation gewinnt, entwickelt und hält kompetente Beschäftigte im Einklang mit ihren Zielen.",
		"hr",
	],
	[
		"CC1.5",
		"CC1",
		"Verantwortlichkeit für interne Kontrollen",
		"Personen werden für ihre Aufgaben im internen Kontrollsystem zur Verantwortung gezogen; Leistung und Anreize berücksichtigen das.",
		"governance",
	],
	// CC2 Information und Kommunikation
	[
		"CC2.1",
		"CC2",
		"Relevante, verlässliche Informationen",
		"Die Organisation beschafft oder erzeugt relevante und verlässliche Informationen, die das interne Kontrollsystem stützen.",
		"operations",
	],
	[
		"CC2.2",
		"CC2",
		"Interne Kommunikation",
		"Ziele und Verantwortlichkeiten für interne Kontrollen werden intern kommuniziert, einschließlich eines Wegs, Bedenken zu melden.",
		"governance",
	],
	[
		"CC2.3",
		"CC2",
		"Externe Kommunikation",
		"Die Organisation kommuniziert mit Externen (Kunden, Dienstleister, Behörden) über Angelegenheiten, die das interne Kontrollsystem betreffen.",
		"governance",
	],
	// CC3 Risikobeurteilung
	[
		"CC3.1",
		"CC3",
		"Ziele festlegen",
		"Ziele sind so klar festgelegt, dass Risiken für ihre Erreichung erkannt und beurteilt werden können.",
		"risk",
	],
	[
		"CC3.2",
		"CC3",
		"Risiken erkennen und analysieren",
		"Risiken für die Zielerreichung werden in der gesamten Organisation erkannt, analysiert und daraufhin behandelt.",
		"risk",
	],
	[
		"CC3.3",
		"CC3",
		"Betrugsrisiko",
		"Bei der Risikobeurteilung wird das Potenzial für Betrug ausdrücklich berücksichtigt.",
		"fraud",
	],
	[
		"CC3.4",
		"CC3",
		"Wesentliche Änderungen",
		"Änderungen, die das interne Kontrollsystem wesentlich beeinflussen können, werden erkannt und beurteilt.",
		"risk",
	],
	// CC4 Überwachung
	[
		"CC4.1",
		"CC4",
		"Laufende und gesonderte Bewertungen",
		"Laufende und/oder gesonderte Bewertungen stellen fest, ob die Kontrollkomponenten vorhanden sind und funktionieren.",
		"compliance",
	],
	[
		"CC4.2",
		"CC4",
		"Mängel melden und beheben",
		"Kontrollmängel werden rechtzeitig an die Verantwortlichen einschließlich der Leitung gemeldet und behoben.",
		"compliance",
	],
	// CC5 Kontrollaktivitäten
	[
		"CC5.1",
		"CC5",
		"Kontrollen auswählen und entwickeln",
		"Kontrollen werden so ausgewählt und entwickelt, dass Risiken auf ein akzeptables Maß gesenkt werden.",
		"risk",
	],
	[
		"CC5.2",
		"CC5",
		"Allgemeine IT-Kontrollen",
		"Für die Technologie gibt es allgemeine Kontrollen, die die Zielerreichung stützen.",
		"operations",
	],
	[
		"CC5.3",
		"CC5",
		"Richtlinien und Verfahren",
		"Kontrollen werden über Richtlinien mit Erwartungen und über Verfahren zu ihrer Umsetzung eingeführt.",
		"governance",
	],
	// CC6 Zugriff
	[
		"CC6.1",
		"CC6",
		"Logische Zugriffssicherheit",
		"Software, Infrastruktur und Architektur schützen Informationswerte durch logische Zugriffskontrollen.",
		"access",
	],
	[
		"CC6.2",
		"CC6",
		"Registrierung und Berechtigung",
		"Vor der Vergabe von Zugängen werden Nutzer:innen registriert und berechtigt; nicht mehr benötigte Zugänge werden entzogen.",
		"access",
	],
	[
		"CC6.3",
		"CC6",
		"Rollenbasierte Rechte und geringste Rechte",
		"Zugriffsrechte werden nach Rollen, geringsten Rechten und Aufgabentrennung vergeben, geändert und entzogen.",
		"access",
	],
	[
		"CC6.4",
		"CC6",
		"Physischer Zugang",
		"Physischer Zugang zu Einrichtungen und geschützten Informationswerten ist auf Berechtigte beschränkt.",
		"physical",
	],
	[
		"CC6.5",
		"CC6",
		"Ausmusterung von Werten",
		"Logischer und physischer Schutz endet erst, wenn Daten auf ausgemusterten Werten nicht mehr lesbar sind.",
		"physical",
	],
	[
		"CC6.6",
		"CC6",
		"Schutz an den Systemgrenzen",
		"Logische Zugriffskontrollen schützen vor Bedrohungen von außerhalb der Systemgrenzen.",
		"network",
	],
	[
		"CC6.7",
		"CC6",
		"Übertragung und Weitergabe von Daten",
		"Übertragung, Bewegung und Entfernung von Informationen sind auf Berechtigte beschränkt und unterwegs geschützt.",
		"crypto",
	],
	[
		"CC6.8",
		"CC6",
		"Schadsoftware und nicht autorisierte Software",
		"Kontrollen verhindern oder erkennen nicht autorisierte oder schädliche Software.",
		"operations",
	],
	// CC7 Systembetrieb
	[
		"CC7.1",
		"CC7",
		"Konfigurationen und Schwachstellen erkennen",
		"Erkennungs- und Überwachungsverfahren finden Konfigurationsänderungen und neue Schwachstellen.",
		"operations",
	],
	[
		"CC7.2",
		"CC7",
		"Anomalien überwachen",
		"Systemkomponenten werden auf Anomalien überwacht, die auf böswillige Handlungen, Naturereignisse oder Fehler hindeuten.",
		"operations",
	],
	[
		"CC7.3",
		"CC7",
		"Sicherheitsereignisse bewerten",
		"Sicherheitsereignisse werden bewertet, um zu entscheiden, ob sie Vorfälle sind.",
		"incident",
	],
	[
		"CC7.4",
		"CC7",
		"Auf Vorfälle reagieren",
		"Auf erkannte Vorfälle wird nach einem festgelegten Verfahren reagiert: verstehen, eindämmen, beheben, kommunizieren.",
		"incident",
	],
	[
		"CC7.5",
		"CC7",
		"Nach Vorfällen wiederherstellen",
		"Die Organisation stellt nach Vorfällen den Betrieb wieder her und leitet Verbesserungen ab.",
		"incident",
	],
	// CC8 Änderungsmanagement
	[
		"CC8.1",
		"CC8",
		"Änderungen steuern",
		"Änderungen an Infrastruktur, Daten, Software und Verfahren werden genehmigt, entworfen, entwickelt, konfiguriert, dokumentiert, getestet und freigegeben.",
		"development",
	],
	// CC9 Risikominderung
	[
		"CC9.1",
		"CC9",
		"Betriebsunterbrechungen",
		"Risikomindernde Maßnahmen gegen mögliche Betriebsunterbrechungen werden festgelegt und umgesetzt.",
		"continuity",
	],
	[
		"CC9.2",
		"CC9",
		"Dienstleister und Geschäftspartner",
		"Risiken aus Dienstleistern und Geschäftspartnern werden beurteilt und gesteuert.",
		"supplier",
	],
	// A1 Verfügbarkeit
	[
		"A1.1",
		"A1",
		"Kapazität",
		"Die Kapazität wird überwacht und geplant, damit Verfügbarkeitszusagen eingehalten werden.",
		"operations",
	],
	[
		"A1.2",
		"A1",
		"Umgebungsschutz, Datensicherung und Wiederherstellung",
		"Umgebungsschutz, Software, Datensicherung und Wiederherstellungs-Infrastruktur werden beschafft, betrieben und überwacht.",
		"continuity",
	],
	[
		"A1.3",
		"A1",
		"Wiederherstellung testen",
		"Die Wiederherstellungsverfahren werden getestet.",
		"continuity",
	],
	// C1 Vertraulichkeit
	[
		"C1.1",
		"C1",
		"Vertrauliche Informationen erkennen und schützen",
		"Vertrauliche Informationen werden erkannt und so geschützt, wie es die Zusagen an Kunden verlangen.",
		"asset",
	],
	[
		"C1.2",
		"C1",
		"Vertrauliche Informationen entsorgen",
		"Vertrauliche Informationen werden nach Ablauf der Aufbewahrung sicher entsorgt.",
		"asset",
	],
	// PI1 Verarbeitungsintegrität
	[
		"PI1.1",
		"PI1",
		"Verarbeitungsziele und Spezifikationen",
		"Informationen über Verarbeitungsziele und Datenspezifikationen werden erzeugt und genutzt.",
		"operations",
	],
	[
		"PI1.2",
		"PI1",
		"Eingabekontrollen",
		"Eingaben werden auf Vollständigkeit und Richtigkeit geprüft.",
		"development",
	],
	[
		"PI1.3",
		"PI1",
		"Verarbeitungskontrollen",
		"Die Verarbeitung ist vollständig, richtig, rechtzeitig und autorisiert.",
		"operations",
	],
	[
		"PI1.4",
		"PI1",
		"Ausgabekontrollen",
		"Ergebnisse sind vollständig, richtig und erreichen nur die vorgesehenen Empfänger.",
		"operations",
	],
	[
		"PI1.5",
		"PI1",
		"Speicherung von Ein- und Ausgaben",
		"Ein- und Ausgaben werden vollständig, richtig und rechtzeitig gespeichert.",
		"operations",
	],
	// P Datenschutz
	[
		"P1.1",
		"P",
		"Datenschutzhinweise",
		"Betroffene werden über Zwecke und Praktiken der Verarbeitung informiert.",
		"compliance",
	],
	[
		"P2.1",
		"P",
		"Wahl und Einwilligung",
		"Betroffene haben Wahlmöglichkeiten; Einwilligungen werden eingeholt und dokumentiert.",
		"compliance",
	],
	[
		"P3.1",
		"P",
		"Erhebung begrenzen",
		"Personenbezogene Daten werden nur für die genannten Zwecke erhoben.",
		"compliance",
	],
	[
		"P3.2",
		"P",
		"Ausdrückliche Einwilligung",
		"Für Daten, die eine ausdrückliche Einwilligung erfordern, wird sie eingeholt und dokumentiert.",
		"compliance",
	],
	[
		"P4.1",
		"P",
		"Verwendung begrenzen",
		"Personenbezogene Daten werden nur für die genannten Zwecke verwendet.",
		"compliance",
	],
	[
		"P4.2",
		"P",
		"Aufbewahrung",
		"Personenbezogene Daten werden nur so lange aufbewahrt, wie es Zweck und Pflichten verlangen.",
		"compliance",
	],
	[
		"P4.3",
		"P",
		"Entsorgung",
		"Personenbezogene Daten werden sicher gelöscht oder entsorgt.",
		"compliance",
	],
	[
		"P5.1",
		"P",
		"Auskunft",
		"Betroffene erhalten auf Anfrage Auskunft über ihre gespeicherten Daten.",
		"compliance",
	],
	[
		"P5.2",
		"P",
		"Berichtigung",
		"Betroffene können ihre Daten berichtigen oder ergänzen lassen; Ablehnungen werden begründet.",
		"compliance",
	],
	[
		"P6.1",
		"P",
		"Weitergabe an Dritte",
		"Daten werden nur für genannte Zwecke und mit Einwilligung bzw. Rechtsgrundlage an Dritte weitergegeben.",
		"supplier",
	],
	[
		"P6.2",
		"P",
		"Nachweis von Weitergaben",
		"Autorisierte Weitergaben werden vollständig und richtig aufgezeichnet.",
		"compliance",
	],
	[
		"P6.3",
		"P",
		"Nicht autorisierte Weitergaben",
		"Nicht autorisierte Weitergaben, einschließlich Datenpannen, werden aufgezeichnet.",
		"incident",
	],
	[
		"P6.4",
		"P",
		"Zusagen von Dritten",
		"Dritte, die Daten erhalten, verpflichten sich vertraglich zum Datenschutz; die Einhaltung wird überwacht.",
		"supplier",
	],
	[
		"P6.5",
		"P",
		"Meldung von Dritten",
		"Dritte melden Datenschutzverletzungen an die Organisation.",
		"supplier",
	],
	[
		"P6.6",
		"P",
		"Benachrichtigung Betroffener",
		"Betroffene und Behörden werden bei Datenschutzverletzungen fristgerecht benachrichtigt.",
		"incident",
	],
	[
		"P6.7",
		"P",
		"Auskunft über Weitergaben",
		"Betroffene erhalten auf Anfrage eine Aufstellung, an wen ihre Daten weitergegeben wurden.",
		"compliance",
	],
	[
		"P7.1",
		"P",
		"Datenqualität",
		"Personenbezogene Daten sind richtig, vollständig und aktuell.",
		"compliance",
	],
	[
		"P8.1",
		"P",
		"Anfragen und Beschwerden",
		"Datenschutzanfragen und -beschwerden werden angenommen, bearbeitet und überwacht.",
		"compliance",
	],
];

export const SOC2_REQUIREMENTS: CatalogRequirement[] = ROWS.map(
	([code, sectionCode, title, requirementText, domain], i) => ({
		code,
		sectionCode,
		title,
		requirementText,
		domain,
		sortOrder: (i + 1) * 10,
	}),
);
