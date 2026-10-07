import type { CatalogRequirement, CatalogSection } from "./types";

// MiCAR – Verordnung (EU) 2023/1114 (mit KMAG). Authoring-Quelle:
// docs/regulatory/anforderungskatalog-2026-10.md, Abschnitt 5 (Tabellen 5.1–5.3).
// Titel V gilt für den CASP (financial_entity); Titel II–IV nur für Emittenten
// (issuer); dienstbezogene Pflichten tragen `services`. Paraphrasen, kein Rechtsrat.

export const MICAR_SECTIONS: CatalogSection[] = [
	{
		code: "V",
		title: "Titel V – Pflichten der Kryptowerte-Dienstleister (Art. 59–85)",
		sortOrder: 10,
	},
	{
		code: "II-IV",
		title: "Titel II–IV – Token-Angebote und Stablecoin-Emission",
		sortOrder: 20,
	},
	{
		code: "VI",
		title: "Titel VI – Marktmissbrauch (Art. 86–92)",
		sortOrder: 30,
	},
	{ code: "KMAG", title: "KMAG – nationale Durchführung", sortOrder: 40 },
];

const FE = ["financial_entity"] as const;
const ISS = ["issuer"] as const;

export const MICAR_REQUIREMENTS: CatalogRequirement[] = [
	{
		code: "Art.59",
		sectionCode: "V",
		title: "Zulassungspflicht, Sitz und Leitung in der EU",
		requirementText:
			"Kryptowerte-Dienstleistungen dürfen nur mit Zulassung als CASP erbracht werden; der Anbieter hat seinen satzungsmäßigen Sitz in einem Mitgliedstaat, in dem er zumindest einen Teil der Dienste erbringt, und die tatsächliche Leitung in der Union.",
		domain: "compliance",
		appliesToRoles: [...FE],
		evidenceHints: ["Zulassungsbescheid"],
		relatedRequirements: ["zag:§10"],
		sortOrder: 10,
	},
	{
		code: "Art.60",
		sectionCode: "V",
		title: "Notifizierungsweg nur für bestimmte Finanzunternehmen",
		requirementText:
			"Kreditinstitute, E-Geld-Institute (eingeschränkt), Wertpapierfirmen und andere genannte Finanzunternehmen dürfen Kryptowerte-Dienste nach Notifizierung erbringen; Zahlungsinstitute gehören nicht dazu und benötigen die volle Zulassung nach Art. 62.",
		guidance:
			"Abgrenzungsvermerk: Warum der Notifizierungsweg nicht offensteht; Zielstruktur ZAG + CASP.",
		domain: "compliance",
		appliesToRoles: [...FE],
		evidenceHints: ["Abgrenzungsvermerk"],
		sortOrder: 20,
	},
	{
		code: "Art.62-63",
		sectionCode: "V",
		title: "Zulassungsantrag und Prüfung",
		requirementText:
			"Der Zulassungsantrag enthält u. a. Geschäftsplan, Governance-Regelungen, Nachweise zu Leitung und Anteilseignern (Fit & Proper), Beschreibung der IKT-Systeme und Sicherheitsvorkehrungen, Verfahren zur Trennung von Kundenvermögen, Beschwerde- und Interessenkonfliktrichtlinien sowie AML-Verfahren; die Behörde prüft Vollständigkeit und entscheidet fristgebunden.",
		guidance:
			"Antragsmappe /antrag mit 15 Bestandteilen nach ESMA-RTS/ITS (DelVO 2025/305) und Vollständigkeits-%.",
		domain: "compliance",
		appliesToRoles: [...FE],
		legalBasisRefs: ["DelVO 2025/305"],
		evidenceHints: ["Vollständiges Antragsdossier"],
		tools: {
			startup: ["Fachanwaltskanzlei", "Klick Antrag"],
			scale: ["Jira-Projektsteuerung"],
		},
		relatedRequirements: ["zag:§10", "iso27001:4.3"],
		recommendations: [
			{
				level: "must",
				text: "Alle Bestandteile mit Nachweisen hinterlegen und Lücken vor Einreichung schließen — Rückfragen verlängern das Verfahren erheblich.",
				source: "ESMA",
			},
		],
		auditQuestions: [
			"Welche Antragsbestandteile sind vollständig, welche fehlen noch?",
		],
		sortOrder: 30,
	},
	{
		code: "Art.65",
		sectionCode: "V",
		title: "Grenzüberschreitende Erbringung (Passporting)",
		requirementText:
			"Vor der grenzüberschreitenden Erbringung notifiziert der CASP die Herkunftsbehörde mit Angaben zu Mitgliedstaaten, Diensten und Startdatum; die Erbringung darf nach Fristablauf beginnen.",
		domain: "compliance",
		appliesToRoles: [...FE],
		evidenceHints: ["Notifizierung je Mitgliedstaat"],
		relatedRequirements: ["zag:§38-39"],
		sortOrder: 40,
	},
	{
		code: "Art.66(1-4)",
		sectionCode: "V",
		title:
			"Ehrliches, redliches und professionelles Handeln; Information der Kunden",
		requirementText:
			"CASPs handeln im besten Interesse ihrer Kunden; Informationen und Marketingmitteilungen sind fair, klar und nicht irreführend, Risiken werden gewarnt, Preise, Kosten und Gebühren veröffentlicht.",
		domain: "conduct",
		appliesToRoles: [...FE],
		evidenceHints: [
			"Marketing-Freigabeprozess",
			"Risikohinweise",
			"Preisveröffentlichung",
		],
		relatedRequirements: ["zag:§62"],
		sortOrder: 50,
	},
	{
		code: "Art.66(5)",
		sectionCode: "V",
		title: "Offenlegung der Nachhaltigkeitsindikatoren",
		requirementText:
			"CASPs stellen auf ihrer Website in hervorgehobener Position Informationen zu den wichtigsten negativen Auswirkungen des Konsensmechanismus der Kryptowerte auf Klima und Umwelt bereit (Angaben nach den technischen Regulierungsstandards).",
		domain: "conduct",
		appliesToRoles: [...FE],
		legalBasisRefs: ["DelVO 2025/305"],
		evidenceHints: ["Offenlegungsseite", "Datenquelle"],
		tools: { startup: ["CCRI MiCA-Daten"], scale: ["dieselben"] },
		sortOrder: 60,
	},
	{
		code: "Art.67",
		sectionCode: "V",
		title: "Aufsichtsrechtliche Sicherheitsvorkehrungen (Eigenmittel)",
		requirementText:
			"CASPs halten jederzeit Eigenmittel in Höhe des höheren Betrags aus dem Mindestkapital ihrer Dienstklasse (50 000 / 125 000 / 150 000 €, Anhang IV) oder einem Viertel der fixen Gemeinkosten des Vorjahres — ganz oder teilweise auch über eine Versicherungspolice.",
		domain: "compliance",
		appliesToRoles: [...FE],
		evidenceHints: ["Kapitalberechnung", "Versicherungspolice (falls genutzt)"],
		tools: {
			startup: ["Treasury-Modell", "Klick Eigenmittel"],
			scale: ["Regnology"],
		},
		relatedRequirements: ["zag:§15", "zag:§12"],
		sortOrder: 70,
	},
	{
		code: "Art.68",
		sectionCode: "V",
		title: "Governance-Regelungen",
		requirementText:
			"Die Mitglieder des Leitungsorgans und Anteilseigner mit qualifizierter Beteiligung sind zuverlässig und geeignet; der CASP verfügt über solide Governance, wirksame Verfahren zur Risikoermittlung und -steuerung, Geschäftsfortführungsvorkehrungen, IKT nach DORA, Mitarbeitende mit Kenntnissen, Zeichnungs- und Aufzeichnungspflichten für alle Dienste, Aufträge und Geschäfte.",
		domain: "governance",
		appliesToRoles: [...FE],
		evidenceHints: [
			"Fit-&-Proper-Unterlagen",
			"Richtlinienhandbuch",
			"Aufzeichnungssystem",
		],
		tools: {
			startup: ["PostgreSQL + WORM-Archiv", "Klick"],
			scale: ["GRC-Tool"],
		},
		relatedRequirements: [
			"iso27001:5.1",
			"iso27001:5.3",
			"dora:Art.5(2)",
			"dora:Art.6(1-4)",
		],
		recommendations: [
			{
				level: "should",
				text: "Aufzeichnungspflicht über das Audit-Log und revisionssichere Transaktionsdatenhaltung erfüllen — ein System, nicht mehrere Exporte.",
				source: "intern",
			},
		],
		sortOrder: 80,
	},
	{
		code: "Art.69",
		sectionCode: "V",
		title: "Mitteilung von Änderungen im Leitungsorgan",
		requirementText:
			"Änderungen im Leitungsorgan werden der zuständigen Behörde unverzüglich mitgeteilt — mit allen Informationen zur Beurteilung der Zuverlässigkeit und Eignung.",
		domain: "compliance",
		appliesToRoles: [...FE],
		evidenceHints: ["Anzeigen"],
		tools: { startup: ["BaFin-MVP"], scale: ["dieselben"] },
		relatedRequirements: ["zag:§28"],
		sortOrder: 90,
	},
	{
		code: "Art.70",
		sectionCode: "V",
		title: "Schutz von Kundenkryptowerten und Kundengeldern",
		requirementText:
			"CASPs treffen angemessene Vorkehrungen zum Schutz der Eigentumsrechte der Kunden, verhindern die Nutzung von Kundenkryptowerten für eigene Rechnung, hinterlegen Kundengelder bis Ende des auf den Eingang folgenden Geschäftstags bei einer Zentralbank oder einem Kreditinstitut auf getrennten Konten und bewahren Kundengelder getrennt von eigenen Mitteln.",
		domain: "custody",
		appliesToRoles: [...FE],
		evidenceHints: ["Segregationskonzept", "Kontennachweise", "Abstimmungen"],
		tools: {
			startup: ["Fireblocks", "Treuhandkonto"],
			scale: ["Taurus", "BitGo"],
		},
		relatedRequirements: ["zag:§17", "zag-marisk:BTO1"],
		sortOrder: 100,
	},
	{
		code: "Art.71",
		sectionCode: "V",
		title: "Beschwerdeverfahren",
		requirementText:
			"CASPs richten wirksame, transparente Verfahren zur raschen, fairen und einheitlichen Bearbeitung von Kundenbeschwerden ein, veröffentlichen sie, nehmen Beschwerden kostenlos entgegen, erfassen sie mit Ergebnis und Maßnahmen und informieren die Kunden fristgerecht.",
		domain: "conduct",
		appliesToRoles: [...FE],
		legalBasisRefs: ["DelVO 2025/1141"],
		evidenceHints: ["Beschwerderichtlinie", "Register"],
		tools: {
			startup: ["Klick Beschwerden", "Zendesk"],
			scale: ["Freshdesk", "Salesforce Service Cloud"],
		},
		relatedRequirements: ["zag:§62"],
		sortOrder: 110,
	},
	{
		code: "Art.72",
		sectionCode: "V",
		title: "Interessenkonflikte",
		requirementText:
			"CASPs verfügen über wirksame Grundsätze und Verfahren zur Ermittlung, Vermeidung, Steuerung und Offenlegung von Interessenkonflikten zwischen ihnen, ihren Anteilseignern, Leitungs- und Mitarbeitenden und den Kunden sowie zwischen Kunden; sie überprüfen die Grundsätze mindestens jährlich.",
		domain: "conduct",
		appliesToRoles: [...FE],
		evidenceHints: ["Interessenkonfliktrichtlinie", "Konfliktregister"],
		tools: {
			startup: ["Klick Organisation"],
			scale: ["StarCompliance", "MCO"],
		},
		relatedRequirements: ["zag-marisk:AT4.3.1"],
		sortOrder: 120,
	},
	{
		code: "Art.73",
		sectionCode: "V",
		title: "Auslagerung",
		requirementText:
			"Bei Auslagerung von Diensten oder Tätigkeiten bleibt der CASP vollständig verantwortlich; Auslagerungen beeinträchtigen weder Kontrolle noch Aufsicht, sind vertraglich geregelt (Rechte, Pflichten, Prüf- und Zugangsrechte, Datenschutz) und werden gesteuert.",
		domain: "supplier",
		appliesToRoles: [...FE],
		evidenceHints: ["Auslagerungsverträge", "Register (mit DORA verzahnt)"],
		tools: { startup: ["Klick Dienstleister"], scale: ["OneTrust TPRM"] },
		relatedRequirements: [
			"dora:Art.28(1-2)",
			"dora:Art.30",
			"zag-marisk:AT9",
			"zag:§26",
		],
		sortOrder: 130,
	},
	{
		code: "Art.74",
		sectionCode: "V",
		title: "Plan für die geordnete Abwicklung",
		requirementText:
			"CASPs verfügen über einen Plan, der die geordnete Abwicklung ihrer Tätigkeiten nach geltendem Recht unterstützt — einschließlich Fortführung oder Wiederherstellung kritischer Tätigkeiten und Rückgabe von Kundenvermögen.",
		domain: "continuity",
		appliesToRoles: [...FE],
		evidenceHints: ["Abwicklungsplan"],
		relatedRequirements: ["dora:Art.11(1-2)", "iso27001:A.5.30"],
		sortOrder: 140,
	},
	{
		code: "Art.75",
		sectionCode: "V",
		title: "Verwahrung und Verwaltung von Kryptowerten für Kunden",
		requirementText:
			"Verwahrende CASPs schließen Kundenverträge, führen ein Positionsregister je Kunde, legen eine Verwahrrichtlinie fest, stellen Positionsauszüge mindestens quartalsweise zur Verfügung, trennen Kundenbestände von eigenen und haften für Verluste aus Vorfällen bis zum Marktwert.",
		domain: "custody",
		appliesToRoles: [...FE],
		services: ["custody"],
		evidenceHints: [
			"Verwahrrichtlinie",
			"Schlüsselzeremonie-Protokolle",
			"Kontoauszüge",
		],
		tools: {
			startup: ["Fireblocks (MPC)", "Tangany", "Finoa"],
			scale: ["Taurus", "Ledger Enterprise", "BitGo"],
		},
		relatedRequirements: ["iso27001:A.8.24", "dora:Art.9(2)"],
		recommendations: [
			{
				level: "must",
				text: "Schlüsselzeremonien protokollieren (Vier-Augen) und Schlüsselinventar führen — das ist der Kern des Verwahrnachweises.",
				source: "BaFin",
			},
		],
		sortOrder: 150,
	},
	{
		code: "Art.76",
		sectionCode: "V",
		title: "Betrieb einer Handelsplattform",
		requirementText:
			"Betreiber von Handelsplattformen legen Betriebsregeln fest (Zulassung von Kryptowerten, Ausschluss, Gebühren, Abwicklung), stellen faire und ordnungsgemäße Handelsabläufe sicher und erkennen Marktmissbrauch.",
		domain: "conduct",
		appliesToRoles: [...FE],
		services: ["platform"],
		evidenceHints: ["Handelsregelwerk"],
		tools: {
			startup: ["Eigenbau"],
			scale: ["Wyden", "Nasdaq Marketplace Tech"],
		},
		sortOrder: 160,
	},
	{
		code: "Art.77",
		sectionCode: "V",
		title: "Tausch von Kryptowerten gegen Geld oder andere Kryptowerte",
		requirementText:
			"CASPs, die Tauschdienste erbringen, legen eine nichtdiskriminierende Geschäftspolitik fest, veröffentlichen feste Preise oder die Preisbildungsmethode und das Volumen der ausgeführten Geschäfte und führen Aufträge zu den angezeigten Preisen aus.",
		domain: "conduct",
		appliesToRoles: [...FE],
		services: ["exchange", "fiat_onramp"],
		evidenceHints: ["Geschäftspolitik", "Preisveröffentlichung"],
		tools: { startup: ["B2C2", "Flowdesk", "Kaiko"], scale: ["CoinMetrics"] },
		sortOrder: 170,
	},
	{
		code: "Art.78",
		sectionCode: "V",
		title: "Ausführung von Aufträgen (Best Execution)",
		requirementText:
			"Bei der Ausführung von Kundenaufträgen werden alle Maßnahmen ergriffen, um das bestmögliche Ergebnis (Preis, Kosten, Geschwindigkeit, Wahrscheinlichkeit, Abwicklung) zu erzielen; Grundsätze werden festgelegt, überwacht und den Kunden erläutert.",
		domain: "conduct",
		appliesToRoles: [...FE],
		services: ["execution"],
		evidenceHints: ["Best-Execution-Richtlinie", "Monitoring"],
		tools: { startup: ["Wyden"], scale: ["Talos"] },
		sortOrder: 180,
	},
	{
		code: "Art.79-80",
		sectionCode: "V",
		title: "Platzierung; Annahme und Übermittlung von Aufträgen",
		requirementText:
			"Bei der Platzierung werden Anbieter über Art, Gebühren, Zeitplan und Zielgruppe informiert und Interessenkonflikte vermieden; bei Annahme und Übermittlung werden Aufträge umgehend und korrekt weitergeleitet, ohne Zuwendungen für die Weiterleitung anzunehmen.",
		domain: "conduct",
		appliesToRoles: [...FE],
		services: ["placing", "reception_transmission"],
		evidenceHints: ["Verfahrensbeschreibungen"],
		sortOrder: 190,
	},
	{
		code: "Art.81",
		sectionCode: "V",
		title: "Beratung und Portfolioverwaltung",
		requirementText:
			"Bei Beratung und Portfolioverwaltung werden Kenntnisse, Erfahrung, finanzielle Situation und Ziele der Kunden erhoben (Geeignetheit), Kunden über Risiken informiert und Berater:innen qualifiziert.",
		domain: "conduct",
		appliesToRoles: [...FE],
		services: ["advice", "portfolio"],
		evidenceHints: ["Suitability-Fragebogen"],
		sortOrder: 200,
	},
	{
		code: "Art.82",
		sectionCode: "V",
		title: "Transferdienstleistungen für Kryptowerte",
		requirementText:
			"CASPs, die Transferdienste erbringen, schließen mit Kunden eine Vereinbarung über Rechte und Pflichten, Modalitäten, Sicherheitsvorkehrungen, Gebühren und anwendbares Recht.",
		domain: "conduct",
		appliesToRoles: [...FE],
		services: ["transfer"],
		evidenceHints: ["Transfer-AGB"],
		relatedRequirements: ["tfr:Art.14(1-4)"],
		sortOrder: 210,
	},
	{
		code: "Art.83-85",
		sectionCode: "V",
		title: "Erwerb und Prüfung qualifizierter Beteiligungen",
		requirementText:
			"Der beabsichtigte Erwerb oder die Erhöhung einer qualifizierten Beteiligung (Schwellen 20/30/50 %) wird der Behörde angezeigt und von ihr innerhalb von 60 Arbeitstagen beurteilt; der CASP meldet ihm bekannte Änderungen.",
		domain: "governance",
		appliesToRoles: [...FE],
		evidenceHints: ["Inhaberkontrollverfahren", "Anzeigen"],
		relatedRequirements: ["zag:§14"],
		sortOrder: 220,
	},

	// ── Titel II–IV ─────────────────────────────────────────────────────────
	{
		code: "Art.4-15",
		sectionCode: "II-IV",
		title:
			"Öffentliches Angebot anderer Kryptowerte: Whitepaper, Marketing, Haftung",
		requirementText:
			"Anbieter anderer Kryptowerte erstellen und notifizieren ein Whitepaper, veröffentlichen es, gestalten Marketingmitteilungen fair, gewähren Widerrufsrecht und haften für irreführende Angaben.",
		domain: "conduct",
		appliesToRoles: [...ISS],
		evidenceHints: ["Whitepaper (iXBRL)", "Notifizierung"],
		tools: { startup: ["Arelle (Validierung)"], scale: ["Workiva"] },
		sortOrder: 300,
	},
	{
		code: "Art.16-47",
		sectionCode: "II-IV",
		title:
			"Vermögenswertreferenzierte Token (ART): Zulassung, Reserve, Sanierungs-/Rücktauschplan",
		requirementText:
			"Emittenten von ART benötigen eine Zulassung, halten und verwahren eine Reserve, veröffentlichen Whitepaper und Informationen, erfüllen Eigenmittelanforderungen und halten Sanierungs- und Rücktauschpläne vor.",
		domain: "compliance",
		appliesToRoles: [...ISS],
		evidenceHints: [
			"Zulassung",
			"Reservenachweise",
			"Sanierungs-/Rücktauschplan",
		],
		sortOrder: 310,
	},
	{
		code: "Art.48-58",
		sectionCode: "II-IV",
		title:
			"E-Geld-Token (EMT): Emission nur durch Kredit- oder E-Geld-Institute",
		requirementText:
			"EMT dürfen nur von Kreditinstituten oder E-Geld-Instituten ausgegeben werden — zum Nennwert, mit jederzeitigem Rücktauschrecht, Anlage der entgegengenommenen Gelder nach Vorgaben und Sanierungs-/Rücktauschplan; ein eigener Euro-Stablecoin erfordert eine E-Geld-Lizenz.",
		guidance:
			"Für den Zahlungs-CASP: Nutzung fremder zugelassener EMTs (Emittentenzulassung im ESMA-Register prüfen, /kryptowerte).",
		domain: "compliance",
		appliesToRoles: [...ISS],
		evidenceHints: ["E-Geld-Lizenz", "Rücktauschplan"],
		sortOrder: 320,
	},

	// ── Titel VI ────────────────────────────────────────────────────────────
	{
		code: "Art.87-88",
		sectionCode: "VI",
		title: "Insiderinformationen und Ad-hoc-Offenlegung",
		requirementText:
			"Emittenten und Anbieter legen Insiderinformationen, die sie unmittelbar betreffen, so bald wie möglich offen und führen Insiderlisten.",
		domain: "conduct",
		appliesToRoles: [...ISS],
		evidenceHints: ["Insiderliste"],
		sortOrder: 400,
	},
	{
		code: "Art.89-91",
		sectionCode: "VI",
		title:
			"Verbot von Insidergeschäften, unrechtmäßiger Offenlegung und Marktmanipulation",
		requirementText:
			"Insidergeschäfte, die unrechtmäßige Offenlegung von Insiderinformationen und Marktmanipulation in Kryptowerten sind verboten; CASPs sorgen durch Leitlinien, Handelsverbote und Kontrollen dafür, dass Mitarbeitende diese Verbote einhalten.",
		domain: "conduct",
		appliesToRoles: [...FE],
		evidenceHints: ["Mitarbeiterleitlinie", "Handelsverbote"],
		tools: {
			startup: ["Klick Interessenkonflikte"],
			scale: ["StarCompliance"],
		},
		sortOrder: 410,
	},
	{
		code: "Art.92",
		sectionCode: "VI",
		title: "Erkennung und Meldung verdächtiger Aufträge und Geschäfte (STOR)",
		requirementText:
			"Wer gewerbsmäßig Geschäfte mit Kryptowerten vermittelt oder ausführt, unterhält wirksame Systeme und Verfahren zur Verhinderung und Aufdeckung von Marktmissbrauch und meldet verdächtige Aufträge und Geschäfte unverzüglich der zuständigen Behörde.",
		domain: "conduct",
		appliesToRoles: [...FE],
		evidenceHints: [
			"Surveillance-Konzept",
			"Alarmprotokolle",
			"STOR-Meldungen",
		],
		tools: {
			startup: ["Solidus Labs"],
			scale: ["Eventus", "b-next", "Nasdaq Trade Surveillance"],
		},
		relatedRequirements: ["gwg:§43"],
		sortOrder: 420,
	},

	// ── KMAG ────────────────────────────────────────────────────────────────
	{
		code: "KMAG",
		sectionCode: "KMAG",
		title: "Kryptomärkteaufsichtsgesetz: Zuständigkeit, Anzeigen, Verfahren",
		requirementText:
			"Das KMAG bestimmt die BaFin als zuständige Behörde für MiCAR in Deutschland und regelt nationale Verfahrens-, Anzeige-, Auskunfts- und Sanktionsvorschriften; Anzeigen und Korrespondenz laufen über das MVP-Portal.",
		guidance:
			"Paragraphenbezug vor Antragstellung gegen die aktuelle Gesetzesfassung prüfen (Modellwissen).",
		domain: "compliance",
		appliesToRoles: [...FE],
		evidenceHints: ["Anzeigenregister", "MVP-Korrespondenz"],
		sortOrder: 500,
	},
];
