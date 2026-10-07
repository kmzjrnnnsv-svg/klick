// Produkt- und Tool-Landkarte (Anforderungskatalog Abschnitt 8): ~20 Werkzeug-
// kategorien, die alle Rahmenwerke abdecken. Marktbeispiele, keine Empfehlung
// im Rechtssinn; vor Vertragsschluss greift die Due Diligence nach DORA
// Art. 28 (Tab Werkzeuge in /dienstleister → „Als Dienstleister anlegen").

export type ToolCategory = {
	code: string;
	name: string;
	// Was die Kategorie abdeckt (lesbar)
	covers: string;
	// Controls, die typischerweise mit dieser Kategorie umgesetzt werden
	controls: readonly string[];
	startup: readonly string[];
	scale: readonly string[];
	// Vorbelegung für das Dienstleister-Formular
	provider: {
		partnerType:
			| "ict"
			| "outsourcing"
			| "licence_partner"
			| "bank"
			| "issuer"
			| "exchange"
			| "custodian"
			| "distribution";
		serviceType:
			| "cloud_iaas"
			| "cloud_paas"
			| "cloud_saas"
			| "hosting"
			| "network"
			| "software"
			| "security"
			| "payment"
			| "data"
			| "other";
		isIct: boolean;
		isOutsourcing: boolean;
		criticality: "critical" | "important" | "standard";
		processesPersonalData: boolean;
	};
};

const saas = (
	criticality: ToolCategory["provider"]["criticality"],
	pii = true,
	outsourcing = false,
): ToolCategory["provider"] => ({
	partnerType: outsourcing ? "outsourcing" : "ict",
	serviceType: "cloud_saas",
	isIct: true,
	isOutsourcing: outsourcing,
	criticality,
	processesPersonalData: pii,
});

export const TOOL_LANDSCAPE: readonly ToolCategory[] = [
	{
		code: "grc",
		name: "GRC / ISMS",
		covers: "ISO 27001 Kl. 4–10, DORA Art. 5–6, ZAG-MaRisk AT 4, MiCAR Art. 68",
		controls: ["CC-GOV-01", "CC-GOV-05", "CC-GOV-08", "CC-RSK-02"],
		startup: ["Klick", "Secjur", "Vanta", "Drata", "verinice"],
		scale: ["HiScout GRC", "ServiceNow IRM", "OneTrust", "avedos risk2value"],
		provider: saas("important"),
	},
	{
		code: "tprm",
		name: "Drittparteien / Informationsregister",
		covers: "DORA Art. 28–30, ISO A.5.19–22, ZAG § 26, MiCAR Art. 73",
		controls: ["CC-TPR-01", "CC-TPR-03", "CC-TPR-05", "CC-TPR-10"],
		startup: ["BaFin-Excel-Vorlage + Klick Dienstleister"],
		scale: [
			"OneTrust TPRM",
			"Mitratech Prevalent",
			"Regnology",
			"Horn & Company Tool",
		],
		provider: saas("standard", false),
	},
	{
		code: "iam",
		name: "Identität & Zugriff",
		covers: "ISO A.5.15–18, A.8.2–5, DORA Art. 9",
		controls: ["CC-IAM-01", "CC-IAM-02", "CC-IAM-03", "CC-IAM-04"],
		startup: ["Microsoft Entra ID", "Okta", "YubiKey", "Teleport"],
		scale: ["SailPoint", "CyberArk", "BeyondTrust"],
		provider: saas("critical"),
	},
	{
		code: "endpoint",
		name: "Endpunkt & MDM",
		covers: "ISO A.8.1, A.8.7",
		controls: ["CC-OPS-01", "CC-OPS-02", "CC-PHY-04"],
		startup: ["Microsoft Intune + Defender for Endpoint"],
		scale: ["CrowdStrike Falcon", "SentinelOne"],
		provider: saas("important"),
	},
	{
		code: "siem",
		name: "SIEM / SOC",
		covers: "ISO A.8.15–16, DORA Art. 10",
		controls: ["CC-LOG-01", "CC-LOG-02", "CC-LOG-03"],
		startup: ["Wazuh", "Elastic", "MDR-Dienst"],
		scale: ["Microsoft Sentinel", "Splunk", "Telekom MDR"],
		provider: saas("critical", true, true),
	},
	{
		code: "vuln",
		name: "Schwachstellen & Code",
		covers: "ISO A.8.8, A.8.25–29, DORA Art. 25",
		controls: ["CC-OPS-03", "CC-DEV-03", "CC-DEV-04", "CC-DEV-05"],
		startup: ["Greenbone", "Trivy", "Semgrep", "OWASP ZAP"],
		scale: ["Tenable", "Qualys", "GitHub Advanced Security", "Snyk"],
		provider: saas("important", false),
	},
	{
		code: "hsm",
		name: "Kryptografie & Schlüssel",
		covers: "ISO A.8.24, DORA Art. 9, MiCAR Art. 75",
		controls: ["CC-CRY-03", "CC-CRY-04", "CC-KEY-01"],
		startup: ["AWS CloudHSM / KMS", "HashiCorp Vault"],
		scale: ["Utimaco", "Thales Luna"],
		provider: {
			partnerType: "ict",
			serviceType: "security",
			isIct: true,
			isOutsourcing: false,
			criticality: "critical",
			processesPersonalData: false,
		},
	},
	{
		code: "custody",
		name: "Krypto-Verwahrung",
		covers: "MiCAR Art. 70, 75",
		controls: ["CC-CUS-01", "CC-CUS-02", "CC-CUS-03", "CC-KEY-01"],
		startup: ["Fireblocks", "Sub-Verwahrung bei Tangany oder Finoa"],
		scale: ["Taurus", "Ledger Enterprise", "BitGo"],
		provider: {
			partnerType: "custodian",
			serviceType: "software",
			isIct: true,
			isOutsourcing: true,
			criticality: "critical",
			processesPersonalData: true,
		},
	},
	{
		code: "bcm",
		name: "Backup & BCM",
		covers: "ISO A.5.29–30, A.8.13–14, DORA Art. 11–12, ZAG-MaRisk AT 7.3",
		controls: ["CC-BCM-01", "CC-BCM-03", "CC-BCM-04", "CC-BCM-05"],
		startup: ["Veeam", "S3 Object Lock", "F24"],
		scale: ["Rubrik", "HiScout BCM", "Fusion"],
		provider: saas("critical"),
	},
	{
		code: "incident",
		name: "Vorfallmanagement & Meldewesen",
		covers: "ISO A.5.24–28, DORA Art. 17–23",
		controls: ["CC-INC-01", "CC-INC-02", "CC-INC-03", "CC-INC-04"],
		startup: ["Jira Service Management", "PagerDuty", "BaFin-MVP"],
		scale: ["ServiceNow SecOps", "Regnology"],
		provider: saas("important"),
	},
	{
		code: "awareness",
		name: "Awareness & Schulung",
		covers: "ISO A.6.3, DORA Art. 5(4), Art. 13, GwG § 6",
		controls: ["CC-HR-03", "CC-GOV-16"],
		startup: ["SoSafe", "KnowBe4", "lawpilots"],
		scale: ["dieselben", "ACAMS-Zertifizierungen"],
		provider: saas("standard"),
	},
	{
		code: "kyc",
		name: "KYC / Ident",
		covers: "GwG §§ 10–13, AMLR Art. 19–28",
		controls: ["CC-AML-04", "CC-AML-05", "CC-AML-10"],
		startup: ["IDnow", "WebID", "Nect", "Sumsub"],
		scale: ["Fenergo (CLM)"],
		provider: saas("critical", true, true),
	},
	{
		code: "sanctions",
		name: "Sanktions- & PEP-Screening",
		covers: "GwG § 10, EU-Sanktionsrecht, OFAC",
		controls: ["CC-SAN-01", "CC-SAN-02"],
		startup: ["ComplyAdvantage"],
		scale: ["LSEG World-Check", "Dow Jones R&C"],
		provider: saas("critical", true, true),
	},
	{
		code: "tm-fiat",
		name: "Transaktionsmonitoring Fiat",
		covers: "GwG § 6, § 27 ZAG",
		controls: ["CC-AML-06", "CC-FRD-01"],
		startup: ["Hawk AI", "ComplyAdvantage"],
		scale: ["Feedzai", "Napier"],
		provider: saas("critical", true, true),
	},
	{
		code: "analytics",
		name: "Blockchain-Analytics",
		covers: "GwG, MiCAR Art. 68, TFR",
		controls: ["CC-AML-06", "CC-SAN-01", "CC-TR-02"],
		startup: ["Chainalysis KYT", "Elliptic", "TRM Labs"],
		scale: ["dieselben im Enterprise-Paket", "Crystal", "Merkle Science"],
		provider: saas("critical", false, true),
	},
	{
		code: "travel-rule",
		name: "Travel Rule",
		covers: "TFR Art. 14–21, EBA/GL/2024/11",
		controls: ["CC-TR-01", "CC-TR-02"],
		startup: ["Notabene", "Sumsub Travel Rule", "TRISA"],
		scale: ["21 Analytics (self-hosted)", "GTR", "Veriscope"],
		provider: saas("critical", true, true),
	},
	{
		code: "fraud",
		name: "Betrugsprävention & SCA",
		covers: "ZAG § 55, RTS 2018/389, ZAG-MaRisk BTO 2",
		controls: ["CC-FRD-01", "CC-FRD-02", "CC-IAM-03"],
		startup: ["SEON", "Sardine", "Netcetera 3DS"],
		scale: ["Featurespace", "Nevis", "Transmit Security"],
		provider: saas("critical"),
	},
	{
		code: "surveillance",
		name: "Marktmissbrauch",
		covers: "MiCAR Art. 89–92 (STOR)",
		controls: ["CC-CND-04"],
		startup: ["Solidus Labs"],
		scale: ["Eventus", "b-next", "Nasdaq Trade Surveillance"],
		provider: saas("important", false),
	},
	{
		code: "complaints",
		name: "Beschwerden",
		covers: "MiCAR Art. 71, ZAG § 62, ZAG-MaRisk BTO 2",
		controls: ["CC-CND-05"],
		startup: ["Zendesk", "Freshdesk"],
		scale: ["Salesforce Service Cloud"],
		provider: saas("standard"),
	},
	{
		code: "whistleblowing",
		name: "Hinweisgeber",
		covers: "GwG § 6(5), HinSchG, MiCAR Art. 116",
		controls: ["CC-INC-07"],
		startup: ["EQS Integrity Line"],
		scale: ["dieselben"],
		provider: saas("standard"),
	},
	{
		code: "audit",
		name: "Revision",
		covers: "ISO 9.2, DORA Art. 6(6), ZAG-MaRisk AT 4.4.3 / BT 2",
		controls: ["CC-GOV-06"],
		startup: ["ausgelagerte Interne Revision"],
		scale: ["Audimex", "TeamMate+"],
		provider: {
			partnerType: "outsourcing",
			serviceType: "other",
			isIct: false,
			isOutsourcing: true,
			criticality: "important",
			processesPersonalData: true,
		},
	},
];

export const TOOL_CATEGORY_BY_CODE: ReadonlyMap<string, ToolCategory> = new Map(
	TOOL_LANDSCAPE.map((t) => [t.code, t]),
);
