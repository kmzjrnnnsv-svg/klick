import type {
	CatalogFrameworkMeta,
	CatalogRequirement,
	CatalogSection,
} from "./types";

// Korridor-Jurisdiktionen (Businessplan 23): Kurzindizes für Zielländer, in
// denen Partner-VASPs/Banken sitzen oder Kunden angesprochen werden. Je Land
// die fünf bis sechs Pflichten, die ein deutscher CASP im Korridor berühren
// muss (Lizenz/Registrierung, AML, Travel Rule, Marketing, Kundenvermögen,
// Partner-Due-Diligence). Rechtsstand Oktober 2026 — Fremdrecht, vor
// Verlass lokale Beratung einholen. Kein Rechtsrat.

const FE = ["financial_entity"] as const;
const q = (
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
	appliesFromStage: "2_casp_zag",
	evidenceHints,
	sortOrder,
	...extra,
});

const SECTIONS = (country: string): CatalogSection[] => [
	{ code: "LIZ", title: `${country}: Zulassung und Perimeter`, sortOrder: 10 },
	{
		code: "AML",
		title: `${country}: Geldwäsche, Sanktionen, Travel Rule`,
		sortOrder: 20,
	},
	{
		code: "KUN",
		title: `${country}: Kunden, Marketing, Vermögen`,
		sortOrder: 30,
	},
];

// ── Vereinigtes Königreich (FCA) ───────────────────────────────────────────
export const UK_SECTIONS = SECTIONS("UK");
export const UK_REQUIREMENTS: CatalogRequirement[] = [
	q(
		"FSMA-Crypto",
		"LIZ",
		"Zulassung für Kryptowerte-Dienstleistungen (FCA)",
		"Mit dem Kryptoregime der FCA (FSMA 2000 Cryptoassets Order) werden Handel, Verwahrung, Staking und Stablecoin-Emission regulierte Tätigkeiten; Dienste für UK-Kunden brauchen ab Anwendungsbeginn eine FCA-Zulassung oder laufen über einen zugelassenen Partner.",
		"compliance",
		["Perimeter-Analyse UK", "Partnervertrag"],
		10,
		{
			effectiveFrom: "2027-10-25",
			legalStatus: "upcoming",
			legalBasisRefs: [
				"FSMA 2000 (Regulated Activities and Miscellaneous Provisions) (Cryptoassets) Order 2025",
			],
		},
	),
	q(
		"MLR-Reg",
		"LIZ",
		"Registrierung nach den Money Laundering Regulations",
		"Bis zum Vollregime gilt die AML-Registrierung von Kryptowerte-Unternehmen bei der FCA (MLR 2017); ohne Registrierung keine aktive Ansprache von UK-Kunden — Reverse Solicitation dokumentieren.",
		"compliance",
		["Registrierungsstatus", "Reverse-Solicitation-Nachweise"],
		20,
	),
	q(
		"MLR-TR",
		"AML",
		"UK Travel Rule",
		"Seit 01.09.2023 übermitteln UK-Kryptounternehmen Begleitdaten zu Transfers (MLR 2017 Part 7A); grenzüberschreitend gelten Vollständigkeitsprüfung und risikobasierte Verfahren für fehlende Daten.",
		"payments",
		["Protokoll mit UK-Partner"],
		100,
		{
			relatedRequirements: ["tfr:Art.14(1-4)"],
		},
	),
	q(
		"SAMLA",
		"AML",
		"UK-Sanktionen (OFSI)",
		"UK-Sanktionslisten (OFSI consolidated list) werden zusätzlich zur EU-Liste gescreent; Russland-Maßnahmen weichen von der EU ab.",
		"aml",
		["Screening-Konfiguration UK-Listen"],
		110,
		{
			relatedRequirements: ["sanctions:Screening"],
		},
	),
	q(
		"FinProm",
		"KUN",
		"Financial Promotions für Kryptowerte",
		"Werbung an UK-Verbraucher braucht Freigabe durch einen autorisierten Approver, Risikohinweise, 24-Stunden-Bedenkfrist für Neukunden und ein Verbot von Anreizen („refer a friend“).",
		"conduct",
		["Werbemittel-Freigaben", "Risikohinweise"],
		200,
		{
			legalBasisRefs: ["FCA PS23/6", "COBS 4.12A"],
			relatedRequirements: ["micar:Art.66(1-4)"],
		},
	),
	q(
		"ConsumerDuty",
		"KUN",
		"Consumer Duty und Kundenvermögen",
		"Produkte und Kommunikation müssen gute Ergebnisse für Verbraucher liefern (PRIN 2A); Kundenvermögen unterliegt den Sicherungsregeln (CASS) des Kryptoregimes.",
		"conduct",
		["Consumer-Duty-Bewertung", "Safeguarding-Konzept UK"],
		210,
	),
];

// ── Vereinigte Arabische Emirate ───────────────────────────────────────────
export const AE_SECTIONS = SECTIONS("VAE");
export const AE_REQUIREMENTS: CatalogRequirement[] = [
	q(
		"CBUAE-RPS",
		"LIZ",
		"Zahlungsdienste: CBUAE Retail Payment Services Regulation",
		"Zahlungsdienste und Stored-Value-Facilities für Kunden in den VAE (Onshore) brauchen eine CBUAE-Lizenz; Zahlungs-Token-Dienste richten sich nach der Payment Token Services Regulation (Dirham-Token).",
		"compliance",
		["Lizenzprüfung Partner", "Perimeter-Vermerk"],
		10,
		{
			legalBasisRefs: [
				"CBUAE Retail Payment Services and Card Schemes Regulation",
				"CBUAE Payment Token Services Regulation 2024",
			],
		},
	),
	q(
		"VARA-ADGM-DIFC",
		"LIZ",
		"Krypto-Dienste: VARA (Dubai), ADGM FSRA, DIFC DFSA",
		"Kryptowerte-Dienste unterliegen je Zone eigenen Regelwerken (VARA Rulebooks, FSRA Virtual Asset Framework, DFSA Crypto Token Regime); Partner werden auf Lizenzkategorie und zulässige Token geprüft.",
		"compliance",
		["Partner-Lizenznachweis", "Token-Zulässigkeit je Zone"],
		20,
	),
	q(
		"AML-FDL20",
		"AML",
		"AML/CFT-Rahmen der VAE",
		"Federal Decree-Law 20/2018 und Cabinet Decision 10/2019 verlangen KYC, Transaktionsmonitoring, Verdachtsmeldungen über goAML UAE und Sanktions-Screening (EOCN); Partner-Programme werden im Rahmen der Korrespondenz-Due-Diligence bewertet.",
		"aml",
		["Partner-DD-Akte", "Sanktionslisten EOCN"],
		100,
		{
			relatedRequirements: ["amlr:Art.37"],
		},
	),
	q(
		"AE-TR",
		"AML",
		"Travel Rule in den VAE",
		"Lizenzierte VASPs übermitteln Begleitdaten (FATF R.16); die Umsetzung je Zone (VARA Compliance & Risk Rulebook, FSRA) ist mit dem Partnerprotokoll abzugleichen.",
		"payments",
		["Protokollabgleich"],
		110,
		{
			relatedRequirements: ["tfr:Art.14(1-4)"],
		},
	),
	q(
		"VARA-Marketing",
		"KUN",
		"Marketing-Regeln (VARA Marketing Regulations)",
		"Werbung für Kryptowerte-Dienste in Dubai ist vorab zu prüfen, fair und mit Risikohinweisen; nicht lizenzierte Anbieter dürfen nicht aktiv werben.",
		"conduct",
		["Marketing-Freigaben VAE"],
		200,
		{
			relatedRequirements: ["micar:Art.66(1-4)"],
		},
	),
];

// ── Bahrain (CBB) ──────────────────────────────────────────────────────────
export const BH_SECTIONS = SECTIONS("Bahrain");
export const BH_REQUIREMENTS: CatalogRequirement[] = [
	q(
		"CBB-CRA",
		"LIZ",
		"CBB Crypto-asset Module (Volume 6)",
		"Kryptowerte-Dienste in Bahrain brauchen eine CBB-Lizenz (Kategorien 1–4 nach Tätigkeit) mit Kapital-, Governance- und Verwahrungsanforderungen; Partner werden auf Kategorie und Umfang geprüft.",
		"compliance",
		["Partner-Lizenz", "Kategorie-Abgleich"],
		10,
	),
	q(
		"CBB-FC",
		"AML",
		"AML-Modul (Financial Crime) und Travel Rule",
		"Das Financial-Crime-Modul des CBB verlangt KYC, Monitoring, Verdachtsmeldungen an die FIU Bahrain und die Übermittlung von Begleitdaten bei Transfers.",
		"aml",
		["Partner-DD", "Protokollabgleich"],
		100,
		{
			relatedRequirements: ["tfr:Art.14(1-4)", "amlr:Art.37"],
		},
	),
	q(
		"CBB-Client",
		"KUN",
		"Kundenvermögen und Verwahrung",
		"Kundenvermögen ist getrennt zu halten, Schlüssel sicher zu verwahren, Reconciliation durchzuführen; Versicherungs- oder Kapitalpuffer je Kategorie.",
		"custody",
		["Segregationsnachweis Partner"],
		200,
		{
			relatedRequirements: ["micar:Art.70"],
		},
	),
	q(
		"CBB-Cyber",
		"KUN",
		"Cybersicherheit und Meldungen",
		"Das CBB-Cybersecurity-Modul verlangt Risikomanagement, Tests und Meldung von Vorfällen; Vertragsklauseln mit Partnern decken Vorfallinformation ab.",
		"operations",
		["Vertragsklauseln", "Vorfallmeldewege"],
		210,
		{
			relatedRequirements: ["dora:Art.30"],
		},
	),
];

// ── Schweiz (FINMA) ────────────────────────────────────────────────────────
export const CH_SECTIONS = SECTIONS("Schweiz");
export const CH_REQUIREMENTS: CatalogRequirement[] = [
	q(
		"GwG-CH",
		"LIZ",
		"Finanzintermediär: SRO-Anschluss oder FINMA-Bewilligung",
		"Wer in der Schweiz Kryptowerte verwahrt, tauscht oder überträgt, ist Finanzintermediär nach GwG CH und braucht den Anschluss an eine Selbstregulierungsorganisation oder eine FINMA-Bewilligung (FinIG/Bankengesetz 1b Fintech-Lizenz bei Publikumseinlagen).",
		"compliance",
		["Partner-SRO-Nachweis", "Perimeter-Vermerk"],
		10,
	),
	q(
		"DLT-Segregation",
		"KUN",
		"Aussonderung von Kryptowerten (DLT-Gesetz)",
		"Verwahrte Kryptowerte werden im Konkurs des Verwahrers ausgesondert, wenn sie jederzeit individuell zugeordnet sind (Art. 242a SchKG); Partnerverträge und Wallet-Struktur müssen das sicherstellen.",
		"custody",
		["Verwahrvertrag", "Zuordnungsnachweis"],
		200,
		{
			relatedRequirements: ["micar:Art.75"],
		},
	),
	q(
		"TR-CH",
		"AML",
		"Travel Rule ohne Schwellenwert",
		"Die FINMA verlangt Begleitdaten für jeden Transfer (keine Schwelle) und erlaubt Transfers an externe Wallets nur nach Nachweis der Verfügungsmacht des Kunden.",
		"payments",
		["Protokollabgleich", "Wallet-Nachweisverfahren"],
		100,
		{
			legalBasisRefs: [
				"FINMA-Aufsichtsmitteilung 02/2019",
				"GwV-FINMA Art. 10",
			],
			relatedRequirements: ["tfr:Art.14(5)"],
		},
	),
	q(
		"CH-Sanktionen",
		"AML",
		"Schweizer Sanktionen (SECO)",
		"Die Schweiz übernimmt EU-Sanktionen in der Regel, aber mit zeitlichem Versatz und Abweichungen; SECO-Listen werden zusätzlich gescreent.",
		"aml",
		["Screening-Konfiguration SECO"],
		110,
		{
			relatedRequirements: ["sanctions:Screening"],
		},
	),
	q(
		"CH-Crossborder",
		"KUN",
		"Grenzüberschreitende Dienste und Reverse Solicitation",
		"Aktive Kundenansprache in der Schweiz kann eine Bewilligung auslösen; passive Dienstleistungserbringung ist zu dokumentieren; FIDLEG-Verhaltensregeln bei Anlageberatung.",
		"conduct",
		["Reverse-Solicitation-Policy"],
		210,
	),
];

// ── Brasilien (BCB) ────────────────────────────────────────────────────────
export const BR_SECTIONS = SECTIONS("Brasilien");
export const BR_REQUIREMENTS: CatalogRequirement[] = [
	q(
		"Lei-14478",
		"LIZ",
		"Rechtsrahmen für virtuelle Vermögenswerte und BCB-Zulassung",
		"Lei 14.478/2022 unterstellt Dienstleister für virtuelle Vermögenswerte (SPSAV) der Aufsicht der Banco Central do Brasil; Zulassung, Governance, Kundenvermögen und Prudenzialregeln folgen den BCB-Resolutionen zur Umsetzung.",
		"compliance",
		["Partner-Zulassung BCB", "Perimeter-Vermerk"],
		10,
		{
			guidance:
				"BCB-Durchführungsregeln (Resolutionen 2025) mit Übergangsfristen — Rechtsstand vor Korridorstart prüfen.",
		},
	),
	q(
		"BR-AML",
		"AML",
		"Geldwäscheprävention (Lei 9.613/1998, COAF)",
		"Partner melden Verdachtsfälle an den COAF, führen KYC und Monitoring nach BCB-Circulars; Sanktionslisten (UN, nationale) werden gescreent.",
		"aml",
		["Partner-DD-Akte"],
		100,
		{
			relatedRequirements: ["amlr:Art.37"],
		},
	),
	q(
		"BR-TR",
		"AML",
		"Travel Rule und Transferdaten",
		"Begleitdaten bei Transfers virtueller Vermögenswerte nach FATF R.16 in der BCB-Umsetzung; Abgleich mit dem Partnerprotokoll.",
		"payments",
		["Protokollabgleich"],
		110,
		{
			relatedRequirements: ["tfr:Art.14(1-4)"],
		},
	),
	q(
		"Pix",
		"KUN",
		"Pix als Fiat-Schiene",
		"Auszahlungen in BRL laufen über Pix (Resolução BCB 1/2020) ausschließlich über einen direkten oder indirekten Pix-Teilnehmer; Betrugsregeln (MED, Limits) und Datenschutz (LGPD) gelten.",
		"payments",
		["Pix-Partnervertrag", "LGPD-Prüfung"],
		200,
		{
			relatedRequirements: ["dsgvo:Art.44-49"],
		},
	),
	q(
		"BR-Verbraucher",
		"KUN",
		"Verbraucherschutz und Werbung",
		"Verbraucherschutzgesetz (CDC) und BCB-Transparenzregeln gelten für Information, Gebühren und Beschwerden; Werbung ohne lokale Zulassung ist zu vermeiden.",
		"conduct",
		["Marketing-Vermerk BR", "Beschwerdeweg"],
		210,
	),
];

export const CORRIDOR_FRAMEWORK_METAS: CatalogFrameworkMeta[] = [
	{
		slug: "uk-fca",
		name: "Korridor UK (FCA)",
		authority: "FCA / OFSI",
		jurisdiction: "uk",
		legalBasis: "FSMA 2000; MLR 2017",
		description:
			"Kurzindex für den UK-Korridor: Kryptoregime der FCA (Vollzulassung ab 25.10.2027), MLR-Registrierung, Travel Rule, Financial Promotions, Consumer Duty, OFSI-Sanktionen.",
		sortOrder: 210,
		appliesFromStage: "2_casp_zag",
		phase: "P5",
	},
	{
		slug: "ae-vara",
		name: "Korridor VAE (CBUAE / VARA / ADGM / DIFC)",
		authority: "CBUAE, VARA, FSRA, DFSA",
		jurisdiction: "ae",
		legalBasis: "CBUAE RPSCS; VARA Rulebooks; Federal Decree-Law 20/2018",
		description:
			"Kurzindex für den VAE-Korridor: Zahlungs- und Krypto-Lizenzen je Zone, AML/CFT-Rahmen, Travel Rule, Marketing-Regeln.",
		sortOrder: 220,
		appliesFromStage: "2_casp_zag",
		phase: "P5",
	},
	{
		slug: "bh-cbb",
		name: "Korridor Bahrain (CBB)",
		authority: "Central Bank of Bahrain",
		jurisdiction: "bh",
		legalBasis: "CBB Rulebook Volume 6",
		description:
			"Kurzindex für den Bahrain-Korridor: Crypto-asset Module, Financial Crime, Kundenvermögen, Cybersicherheit.",
		sortOrder: 230,
		appliesFromStage: "2_casp_zag",
		phase: "P5",
	},
	{
		slug: "ch-finma",
		name: "Korridor Schweiz (FINMA / SRO)",
		authority: "FINMA, SRO, SECO",
		jurisdiction: "ch",
		legalBasis: "GwG CH; DLT-Gesetz; FinIG",
		description:
			"Kurzindex für den Schweiz-Korridor: SRO-Anschluss, DLT-Aussonderung, Travel Rule ohne Schwelle, SECO-Sanktionen, Reverse Solicitation.",
		sortOrder: 240,
		appliesFromStage: "2_casp_zag",
		phase: "P5",
	},
	{
		slug: "br-bcb",
		name: "Korridor Brasilien (BCB)",
		authority: "Banco Central do Brasil, COAF",
		jurisdiction: "br",
		legalBasis: "Lei 14.478/2022; Lei 9.613/1998",
		description:
			"Kurzindex für den Brasilien-Korridor: SPSAV-Zulassung, AML/COAF, Travel Rule, Pix, Verbraucherschutz.",
		sortOrder: 250,
		appliesFromStage: "2_casp_zag",
		phase: "P5",
	},
];

export const CORRIDOR_INDICES: Record<
	string,
	{ sections: CatalogSection[]; requirements: CatalogRequirement[] }
> = {
	"uk-fca": { sections: UK_SECTIONS, requirements: UK_REQUIREMENTS },
	"ae-vara": { sections: AE_SECTIONS, requirements: AE_REQUIREMENTS },
	"bh-cbb": { sections: BH_SECTIONS, requirements: BH_REQUIREMENTS },
	"ch-finma": { sections: CH_SECTIONS, requirements: CH_REQUIREMENTS },
	"br-bcb": { sections: BR_SECTIONS, requirements: BR_REQUIREMENTS },
};
