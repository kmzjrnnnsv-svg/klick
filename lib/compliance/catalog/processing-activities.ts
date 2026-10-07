// Verarbeitungsverzeichnis — Startliste für einen Stablecoin-CASP/ZAG
// (Businessplan 17.9, DSGVO Art. 30). Rechtsgrundlagen und Fristen sind
// Vorschläge; die DSB prüft je Tätigkeit. Kein Rechtsrat.

export type CatalogProcessingActivity = {
	key: string;
	name: string;
	purpose: string;
	dataCategories: readonly string[];
	dataSubjects: readonly string[];
	recipients: readonly string[];
	thirdCountryTransfer: string | null;
	retention: string;
	legalBasis: string;
	dsfaRequired: boolean;
	requires?: readonly string[];
};

export const PROCESSING_ACTIVITIES: readonly CatalogProcessingActivity[] = [
	{
		key: "kyc",
		name: "Kunden-Onboarding und Identifizierung (KYC/KYB)",
		purpose:
			"Identifizierung und Überprüfung von Kunden und wirtschaftlich Berechtigten, Risikoklassifizierung.",
		dataCategories: [
			"Identitätsdaten",
			"Ausweisdaten",
			"biometrische Daten (Video-Ident)",
			"Adress- und Kontaktdaten",
			"wirtschaftlich Berechtigte",
		],
		dataSubjects: [
			"Kunden",
			"Vertretungsberechtigte",
			"wirtschaftlich Berechtigte",
		],
		recipients: [
			"Ident-Dienstleister",
			"Screening-Dienstleister",
			"BaFin/FIU auf Anfrage",
		],
		thirdCountryTransfer: null,
		retention:
			"5 Jahre nach Ende der Geschäftsbeziehung (GwG § 8), max. 10 Jahre",
		legalBasis:
			"Art. 6 Abs. 1 c DSGVO i. V. m. GwG §§ 10–13, § 11a; Art. 9 Abs. 2 a/g bei Biometrie",
		dsfaRequired: true,
		requires: ["gwg", "amlr", "micar", "zag"],
	},
	{
		key: "payments",
		name: "Zahlungsabwicklung und Transfers",
		purpose:
			"Ausführung von Zahlungen und Kryptowertetransfers, Buchung, Belege.",
		dataCategories: [
			"Zahlungsdaten",
			"Wallet-Adressen",
			"Transaktionsdaten",
			"Händlerdaten",
		],
		dataSubjects: ["Kunden", "Zahlungsempfänger", "Händler"],
		recipients: [
			"Banken",
			"Custody-Dienstleister",
			"Travel-Rule-Partner",
			"Steuerbehörden (DAC8)",
		],
		thirdCountryTransfer:
			"Partner-VASPs in Korridorländern (SCC/TIA je Partner)",
		retention: "10 Jahre (HGB § 257, AO § 147); GwG § 8 fünf Jahre",
		legalBasis:
			"Art. 6 Abs. 1 b DSGVO (Vertrag), Art. 6 Abs. 1 c (ZAG, TFR, KStTG)",
		dsfaRequired: false,
		requires: ["zag", "micar", "tfr"],
	},
	{
		key: "monitoring",
		name: "Transaktionsmonitoring und Sanktions-Screening",
		purpose:
			"Erkennung von Geldwäsche, Terrorismusfinanzierung, Sanktionsverstößen und Betrug; Verdachtsmeldungen.",
		dataCategories: [
			"Transaktionsdaten",
			"Risikoscores",
			"Screening-Treffer",
			"On-Chain-Analysen",
		],
		dataSubjects: ["Kunden", "Gegenparteien"],
		recipients: ["Monitoring-/Analytics-Dienstleister", "FIU (goAML)", "BaFin"],
		thirdCountryTransfer: "Analytics-Anbieter mit US-Bezug (DPF/SCC prüfen)",
		retention: "5 Jahre (GwG § 8), Verdachtsmeldungen 5 Jahre",
		legalBasis:
			"Art. 6 Abs. 1 c DSGVO i. V. m. GwG §§ 6, 10, 43, § 27 ZAG; Art. 22 Abs. 2 b",
		dsfaRequired: true,
		requires: ["gwg", "amlr"],
	},
	{
		key: "complaints",
		name: "Beschwerden und Hinweisgebersystem",
		purpose:
			"Bearbeitung von Beschwerden (Art. 71 MiCAR, § 62 ZAG) und Hinweisen (HinSchG).",
		dataCategories: [
			"Kontaktdaten",
			"Sachverhaltsdaten",
			"Hinweisgeberdaten (vertraulich)",
		],
		dataSubjects: ["Kunden", "Hinweisgeber", "betroffene Mitarbeitende"],
		recipients: ["Compliance", "Schlichtungsstelle", "BaFin bei Eskalation"],
		thirdCountryTransfer: null,
		retention: "3 Jahre nach Abschluss (HinSchG § 11), Beschwerden 5 Jahre",
		legalBasis:
			"Art. 6 Abs. 1 c DSGVO i. V. m. MiCAR Art. 71, ZAG § 62, HinSchG § 10",
		dsfaRequired: false,
	},
	{
		key: "employees",
		name: "Mitarbeiterdaten und Zuverlässigkeitsprüfung",
		purpose:
			"Beschäftigungsverhältnis, Zuverlässigkeitsprüfung (GwG § 6), Schulungsnachweise, Zugriffskontrolle.",
		dataCategories: [
			"Personalstammdaten",
			"Qualifikationen",
			"Zuverlässigkeitsnachweise",
			"Zugriffsprotokolle",
		],
		dataSubjects: ["Mitarbeitende", "Bewerbende"],
		recipients: ["Lohnabrechnung", "Schulungsanbieter"],
		thirdCountryTransfer: null,
		retention: "Ende Beschäftigung + 3 Jahre; Lohnunterlagen 10 Jahre",
		legalBasis:
			"§ 26 BDSG; Art. 6 Abs. 1 c DSGVO i. V. m. GwG § 6 Abs. 2 Nr. 5",
		dsfaRequired: false,
	},
	{
		key: "platform",
		name: "Plattformbetrieb, Protokollierung, Sicherheit",
		purpose:
			"Betrieb der Anwendung, Audit-Logging, Sicherheitsüberwachung, Vorfallbearbeitung.",
		dataCategories: [
			"Nutzerkonten",
			"IP-Adressen",
			"Geräteinformationen",
			"Audit-Log-Einträge",
		],
		dataSubjects: ["Nutzer:innen (Mandanten)", "Mitarbeitende"],
		recipients: ["Hosting (Hetzner, EU)", "Mail-Dienstleister"],
		thirdCountryTransfer: null,
		retention:
			"Sitzungen 30 Tage nach Ablauf; Audit-Log 10 Jahre (unveränderbar)",
		legalBasis: "Art. 6 Abs. 1 b und f DSGVO; Art. 32; DORA Art. 10",
		dsfaRequired: false,
	},
	{
		key: "marketing",
		name: "Website, Kontaktanfragen, Marketing",
		purpose:
			"Information über Dienste, Kontaktaufnahme, Newsletter mit Einwilligung.",
		dataCategories: ["Kontaktdaten", "Nutzungsdaten (ohne Tracking Dritter)"],
		dataSubjects: ["Interessenten", "Website-Besucher"],
		recipients: ["Mail-Dienstleister (EU)"],
		thirdCountryTransfer: null,
		retention: "Bis Widerruf; Kontaktanfragen 12 Monate",
		legalBasis: "Art. 6 Abs. 1 a und f DSGVO; § 25 TDDDG",
		dsfaRequired: false,
	},
	{
		key: "regulatory",
		name: "Melde- und Berichtspflichten an Behörden",
		purpose: "DAC8-Meldungen, AWV, Verdachtsmeldungen, Aufsichtsanfragen.",
		dataCategories: ["Identitäts- und Steuerdaten", "Transaktionsaggregate"],
		dataSubjects: ["Kunden"],
		recipients: ["BZSt", "Bundesbank", "FIU", "BaFin"],
		thirdCountryTransfer:
			"Automatischer Informationsaustausch über BZSt (DAC8/CARF)",
		retention: "6 Jahre (KStTG § 19) bzw. gesetzliche Fristen",
		legalBasis: "Art. 6 Abs. 1 c DSGVO i. V. m. KStTG, AWV, GwG § 43",
		dsfaRequired: false,
		requires: ["dac8", "awv", "gwg"],
	},
];

export function applicableProcessingActivities(
	frameworks: readonly string[],
): CatalogProcessingActivity[] {
	const set = new Set(frameworks);
	return PROCESSING_ACTIVITIES.filter(
		(p) => !p.requires || p.requires.some((f) => set.has(f)),
	);
}
