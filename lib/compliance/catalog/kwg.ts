import type { CatalogRequirement, CatalogSection } from "./types";

// KWG / CRR / Banken-MaRisk — Lizenzstufe 4 (CRR-Kreditinstitut). Kurzindex
// der Erlaubnis- und Organisationspflichten plus MaRisk-Module, die über die
// ZAG-MaRisk hinausgehen. Rechtsstand Oktober 2026 (CRD VI Art. 21c ab
// 11.01.2027). Paraphrasen, kein Rechtsrat.

export const KWG_SECTIONS: CatalogSection[] = [
	{
		code: "ERL",
		title: "Erlaubnis, Leitung, Inhaber (KWG §§ 32–33, 25c–25d, 2c)",
		sortOrder: 10,
	},
	{
		code: "ORG",
		title: "Geschäftsorganisation (KWG §§ 25a–25b, 25h)",
		sortOrder: 20,
	},
	{
		code: "CAP",
		title: "Eigenmittel, Liquidität, Großkredite (KWG §§ 10–13, CRR)",
		sortOrder: 30,
	},
	{
		code: "MELD",
		title: "Anzeigen, Meldungen, Prüfung (KWG §§ 24, 26, 29, 44)",
		sortOrder: 40,
	},
	{ code: "AT", title: "Banken-MaRisk — Allgemeiner Teil", sortOrder: 50 },
	{ code: "BT", title: "Banken-MaRisk — Besonderer Teil", sortOrder: 60 },
	{ code: "EU", title: "EZB, CRD VI, Einlagensicherung", sortOrder: 70 },
];

const FE = ["financial_entity"] as const;
const r = (
	code: string,
	sectionCode: string,
	title: string,
	requirementText: string,
	domain: CatalogRequirement["domain"],
	evidenceHints: string[],
	sortOrder: number,
	extra: Partial<CatalogRequirement> = {},
): CatalogRequirement => ({
	code,
	sectionCode,
	title,
	requirementText,
	domain,
	appliesToRoles: [...FE],
	evidenceHints,
	sortOrder,
	...extra,
});

export const KWG_REQUIREMENTS: CatalogRequirement[] = [
	r(
		"§32",
		"ERL",
		"Erlaubnis für Bankgeschäfte",
		"Wer Bankgeschäfte (Einlagen, Kredite) gewerbsmäßig betreibt, braucht die schriftliche Erlaubnis der BaFin/EZB; der Antrag enthält Geschäftsplan, Organisation, Anfangskapital (mindestens 5 Mio € für CRR-Kreditinstitute), Inhaber und Geschäftsleiter.",
		"compliance",
		["Erlaubnisantrag", "Erlaubnisbescheid"],
		10,
		{
			relatedRequirements: ["zag:§10", "micar:Art.62-63"],
			tools: {
				startup: ["Spezialkanzlei", "Projektsteuerung"],
				scale: ["dieselben"],
			},
		},
	),
	r(
		"§33",
		"ERL",
		"Versagungsgründe: Kapital, Geschäftsleiter, Organisation",
		"Die Erlaubnis wird versagt, wenn Anfangskapital fehlt, Geschäftsleiter nicht zuverlässig oder fachlich geeignet sind, weniger als zwei Geschäftsleiter bestellt sind oder die Organisation nicht ordnungsgemäß ist.",
		"governance",
		["Fit-&-Proper-Unterlagen", "Geschäftsverteilungsplan"],
		20,
		{
			relatedRequirements: ["micar:Art.68", "zag-marisk:AT3"],
		},
	),
	r(
		"§25c-25d",
		"ERL",
		"Geschäftsleiter und Verwaltungs-/Aufsichtsorgan",
		"Geschäftsleiter widmen der Leitung ausreichend Zeit, begrenzen Mandate und sorgen für Strategien, Risikomanagement und Kontrolle; das Aufsichtsorgan überwacht, bildet bei bedeutenden Instituten Ausschüsse und bewertet sich selbst.",
		"governance",
		["Selbstbewertung", "Mandatsübersicht", "Ausschussordnungen"],
		30,
		{
			relatedRequirements: ["dora:Art.5(2)"],
		},
	),
	r(
		"§2c",
		"ERL",
		"Inhaberkontrolle",
		"Der Erwerb oder die Erhöhung bedeutender Beteiligungen (10/20/30/50 %) wird vorab angezeigt; die Aufsicht beurteilt binnen 60 Arbeitstagen Zuverlässigkeit, Mittelherkunft und Einfluss.",
		"governance",
		["Anzeigen nach InhKontrollV", "Beteiligungsregister"],
		40,
		{
			relatedRequirements: ["zag:§14", "micar:Art.83-85"],
		},
	),
	r(
		"§25a",
		"ORG",
		"Ordnungsgemäße Geschäftsorganisation",
		"Das Institut verfügt über ein angemessenes Risikomanagement (Risikotragfähigkeit, Strategien, interne Kontrollverfahren mit IKS, Risikocontrolling, Compliance, Interne Revision), Personal- und IT-Ausstattung, Notfallkonzept und ein angemessenes Vergütungssystem (InstitutsVergV).",
		"governance",
		["MaRisk-Umsetzungsnachweis", "Vergütungsrichtlinie"],
		100,
		{
			relatedRequirements: ["zag-marisk:AT4.3.2", "iso27001:4.4"],
		},
	),
	r(
		"§25b",
		"ORG",
		"Auslagerung",
		"Wesentliche Auslagerungen werden auf Basis einer Risikoanalyse vertraglich geregelt, gesteuert, überwacht und angezeigt; Leitungsaufgaben sind nicht auslagerbar; ein zentrales Auslagerungsmanagement besteht.",
		"supplier",
		["Auslagerungsregister", "Anzeigen", "Risikoanalysen"],
		110,
		{
			relatedRequirements: ["zag-marisk:AT9", "dora:Art.28(1-2)"],
		},
	),
	r(
		"§25h-25i",
		"ORG",
		"Interne Sicherungsmaßnahmen und Sorgfaltspflichten",
		"Über das GwG hinaus unterhalten Institute Datenverarbeitungssysteme zur Erkennung zweifelhafter Geschäftsbeziehungen und Transaktionen, führen verstärkte Sorgfalt bei Korrespondenzbeziehungen und melden strafbare Handlungen zum Nachteil des Instituts.",
		"aml",
		["Monitoring-System", "Fraud-Prozess", "Korrespondenzbank-Richtlinie"],
		120,
		{
			relatedRequirements: ["gwg:§6", "gwg:§27ZAG-TM"],
		},
	),
	r(
		"§10",
		"CAP",
		"Eigenmittelanforderungen (CRR)",
		"Das Institut hält jederzeit Eigenmittel nach CRR Art. 92 (8 % Gesamtkapitalquote, 6 % Kernkapital, 4,5 % hartes Kernkapital) zuzüglich SREP-Zuschlag und Kapitalpuffern (§ 10i) und meldet nach COREP.",
		"risk",
		["COREP-Meldungen", "SREP-Bescheid", "Kapitalplanung"],
		200,
		{
			relatedRequirements: ["micar:Art.67", "zag:§15"],
			tools: {
				startup: ["Regnology Abacus"],
				scale: ["Regnology", "BearingPoint"],
			},
		},
	),
	r(
		"§11",
		"CAP",
		"Liquidität (LCR, NSFR)",
		"Liquiditätsdeckungsquote und strukturelle Liquiditätsquote werden eingehalten und gemeldet; ein Liquiditätsnotfallplan besteht.",
		"risk",
		["LCR/NSFR-Meldungen", "Liquiditätsnotfallplan"],
		210,
		{
			relatedRequirements: ["zag-marisk:BTR4"],
		},
	),
	r(
		"§13",
		"CAP",
		"Großkredite",
		"Großkredite (≥ 10 % des Kernkapitals) werden angezeigt, Obergrenzen (25 %) eingehalten und Konzentrationen gesteuert.",
		"risk",
		["Großkreditmeldungen", "Limitüberwachung"],
		220,
		{
			relatedRequirements: ["zag-marisk:BTR2"],
		},
	),
	r(
		"§24",
		"MELD",
		"Anzeigepflichten",
		"Änderungen bei Geschäftsleitern, Beteiligungen, Sitz, Rechtsform, Verlusten (25 % des Kernkapitals) und Auslagerungen werden unverzüglich angezeigt.",
		"compliance",
		["Anzeigeregister"],
		300,
		{
			relatedRequirements: ["zag:§28", "micar:Art.69"],
		},
	),
	r(
		"§26-29",
		"MELD",
		"Jahresabschluss, Prüfung, Prüferanzeige",
		"Jahresabschluss und Lagebericht werden geprüft und eingereicht; der Prüfer wird angezeigt und prüft die Einhaltung aufsichtlicher Pflichten (PrüfbV) einschließlich GwG und IT.",
		"compliance",
		["Prüfungsbericht", "Prüferanzeige"],
		310,
		{
			relatedRequirements: ["zag:§22-24"],
		},
	),
	r(
		"§44",
		"MELD",
		"Auskunfts- und Prüfungsrechte",
		"BaFin und Bundesbank erhalten Auskünfte, Unterlagen und Zugang; Sonderprüfungen (auch IT, GwG) werden unterstützt; die Aufsichtskommunikation ist dokumentiert.",
		"compliance",
		["Aufsichtskontakte-Register", "Prüfungsunterlagen"],
		320,
	),
	r(
		"AT4.1",
		"AT",
		"Risikotragfähigkeit (ICAAP normativ und ökonomisch)",
		"Die Risikotragfähigkeit wird in der normativen Perspektive (Kapitalplanung über mindestens drei Jahre inkl. adverser Szenarien) und der ökonomischen Perspektive (barwertnah) sichergestellt; Stresstests ergänzen beide Sichten.",
		"risk",
		["ICAAP-Dokumentation", "Kapitalplanung", "Stresstests"],
		400,
		{
			relatedRequirements: ["zag-marisk:AT4.1"],
		},
	),
	r(
		"AT4.2-4.3",
		"AT",
		"Strategien und internes Kontrollsystem",
		"Geschäfts- und Risikostrategie (einschließlich ESG-Risiken) werden festgelegt und jährlich überprüft; Aufbau- und Ablauforganisation, Risikosteuerungs- und -controllingprozesse und Stresstests bilden das IKS.",
		"governance",
		["Strategiedokumente", "Risikoinventur", "Stresstestkonzept"],
		410,
		{
			relatedRequirements: ["zag-marisk:AT4.2", "zag-marisk:AT4.3.2"],
		},
	),
	r(
		"AT4.4",
		"AT",
		"Risikocontrolling, Compliance, Interne Revision",
		"Die drei Funktionen sind unabhängig, angemessen ausgestattet, mit direktem Zugang zur Geschäftsleitung und zum Aufsichtsorgan; die Leitung der Risikocontrolling-Funktion ist auf Geschäftsleitungsebene oder berichtet dort.",
		"governance",
		["Funktionsbeschreibungen", "Berichte an GL und Aufsichtsorgan"],
		420,
		{
			relatedRequirements: [
				"zag-marisk:AT4.4.1",
				"zag-marisk:AT4.4.2",
				"zag-marisk:AT4.4.3",
			],
		},
	),
	r(
		"AT7-8",
		"AT",
		"Ressourcen, IT (DORA) und Anpassungsprozesse",
		"Personal, Anreizsysteme, technisch-organisatorische Ausstattung (IKT nach DORA) und Notfallmanagement sind angemessen; neue Produkte und wesentliche Änderungen durchlaufen den NPP.",
		"governance",
		["Verweis DORA-Rahmen", "NPP-Richtlinie"],
		430,
		{
			relatedRequirements: [
				"zag-marisk:AT7.2",
				"zag-marisk:AT8",
				"dora:Art.6(1-4)",
			],
		},
	),
	r(
		"BTO1-2",
		"BT",
		"Kredit- und Handelsgeschäft",
		"Kreditgeschäft: Funktionstrennung Markt/Marktfolge, Votierung, Überwachung, Problemkredite, Risikovorsorge. Handelsgeschäft: Handel, Abwicklung, Kontrolle getrennt, Marktgerechtigkeitsprüfung, Limite.",
		"risk",
		["Kompetenzordnung", "Votierungsnachweise", "Handelsrichtlinie"],
		500,
		{
			guidance:
				"Für ein Krypto-Zahlungsinstitut mit Banklizenz vor allem Marktfolge bei Händlerkrediten/Vorleistungen und das Eigenhandelsverbot bzw. -limit relevant.",
		},
	),
	r(
		"BTR1-4",
		"BT",
		"Risikoarten: Adressen, Markt, Liquidität, operationelle Risiken",
		"Je Risikoart bestehen Limite, Messverfahren, Berichterstattung und Verantwortlichkeiten; operationelle Risiken (inkl. IKT, Rechts-, Modell-, Reputationsrisiken) werden mit Schadensfalldatenbank, Self-Assessments und Szenarien gesteuert.",
		"risk",
		["Limitsystem", "Schadensfalldatenbank", "Risikoberichte"],
		510,
		{
			relatedRequirements: [
				"zag-marisk:BTR1",
				"zag-marisk:BTR2",
				"zag-marisk:BTR3",
				"zag-marisk:BTR4",
			],
		},
	),
	r(
		"BT3",
		"BT",
		"Risikoberichterstattung",
		"Gesamtrisikobericht quartalsweise, Teilrisikoberichte nach Risikoart, Ad-hoc-Berichte bei wesentlichen Ereignissen; Berichte an Geschäftsleitung und Aufsichtsorgan mit klarer Handlungsorientierung.",
		"risk",
		["Gesamtrisikobericht", "Ad-hoc-Berichte"],
		520,
		{
			relatedRequirements: ["zag-marisk:BT3"],
		},
	),
	r(
		"EZB-Governance",
		"EU",
		"EZB-Leitfaden zu interner Governance und Risikokultur",
		"Bedeutende Institute richten Governance, Risikokultur, Vergütung und Aufsichtsorgan an den Erwartungen des EZB-Leitfadens aus; weniger bedeutende Institute nutzen ihn als Orientierung (BaFin-Zuständigkeit).",
		"governance",
		["Gap-Analyse zum Leitfaden"],
		600,
		{
			legalBasisRefs: ["EZB-Leitfaden interne Governance und Risikokultur"],
		},
	),
	r(
		"CRD-VI-Art.21c",
		"EU",
		"Drittlandsinstitute und grenzüberschreitende Dienste",
		"Ab 11.01.2027 dürfen Drittlandsunternehmen Bankgeschäfte in der EU grundsätzlich nur über eine zugelassene Zweigstelle erbringen; Korridor-Partner außerhalb der EU werden auf Betroffenheit und Reverse Solicitation geprüft.",
		"compliance",
		["Prüfvermerk je Korridor-Partner"],
		610,
		{
			effectiveFrom: "2027-01-11",
			legalStatus: "upcoming",
			legalBasisRefs: ["RL (EU) 2024/1619 Art. 21c", "KWG § 53"],
		},
	),
	r(
		"EinSiG",
		"EU",
		"Einlagensicherung",
		"CRR-Kreditinstitute sind Mitglied der gesetzlichen Entschädigungseinrichtung (EdB/EdÖ), leisten Beiträge und informieren Kunden mit dem Informationsbogen zur Einlagensicherung.",
		"compliance",
		["Mitgliedschaft", "Informationsbogen"],
		620,
	),
];
