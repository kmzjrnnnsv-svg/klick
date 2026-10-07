import type { RoleFunction } from "@/db/schema/enums";

// Pflichtschulungen je Funktion/Rolle (Schulungsplan, Kompetenzmatrix).
export type TrainingRequirementTemplate = {
	code: string;
	title: string;
	description: string;
	function?: RoleFunction;
	orgRole?: "owner" | "editor" | "viewer" | "auditor" | "all";
	frequencyMonths: number;
	legalBasis: string;
	frameworks: string[];
};

export const TRAINING_REQUIREMENTS: TrainingRequirementTemplate[] = [
	{
		code: "SEC-AWARENESS",
		title: "Informationssicherheits-Grundschulung",
		description: "Leitlinie, Passwörter/MFA, Phishing, Meldewege, Clean Desk.",
		orgRole: "all",
		frequencyMonths: 12,
		legalBasis: "ISO 27001 7.3 / A.6.3; NIS2 Art. 21(2)(g); DORA Art. 13(6)",
		frameworks: ["iso27001", "nis2", "dora"],
	},
	{
		code: "PHISHING-SIM",
		title: "Phishing-Simulation",
		description: "Regelmässige Simulation mit Auswertung.",
		orgRole: "all",
		frequencyMonths: 3,
		legalBasis: "ISO 27001 A.6.3; NIS2 Art. 21(2)(g)",
		frameworks: ["iso27001", "nis2"],
	},
	{
		code: "MGMT-ICT",
		title: "IKT-Risiko-Schulung der Geschäftsleitung",
		description:
			"Pflichten nach DORA Art. 5, Bedrohungslage, Entscheidungen im Vorfall.",
		function: "management_body",
		frequencyMonths: 12,
		legalBasis: "DORA Art. 5(4); NIS2 Art. 20(2)",
		frameworks: ["dora", "nis2"],
	},
	{
		code: "PRIVACY",
		title: "Datenschutz-Schulung",
		description: "Grundsätze, Betroffenenrechte, Meldepflichten.",
		orgRole: "all",
		frequencyMonths: 24,
		legalBasis: "DSGVO Art. 39 Abs. 1 lit. b",
		frameworks: ["dsgvo", "iso27001"],
	},
	{
		code: "AML-BASE",
		title: "GwG-Grundschulung",
		description:
			"Sorgfaltspflichten, Verdachtsmeldung, Tipping-off, Sanktionen.",
		orgRole: "all",
		frequencyMonths: 12,
		legalBasis: "GwG § 6 Abs. 2 Nr. 6",
		frameworks: ["gwg", "amlr"],
	},
	{
		code: "AML-OFFICER",
		title: "Fortbildung Geldwäschebeauftragte:r",
		description: "Aktuelle Typologien, FIU-Praxis, Rechtsänderungen (AMLR).",
		function: "aml_officer",
		frequencyMonths: 12,
		legalBasis: "GwG § 7; AMLR Art. 9–11",
		frameworks: ["gwg", "amlr"],
	},
	{
		code: "SANCTIONS",
		title: "Sanktions-Screening",
		description: "EU-/OFAC-Listen, Länderrisiko, Umgang mit Treffern.",
		function: "compliance",
		frequencyMonths: 12,
		legalBasis: "EU 833/2014; AWG § 18",
		frameworks: ["sanctions", "gwg"],
	},
	{
		code: "KEY-CEREMONY",
		title: "Schlüsselzeremonie und Verwahrung",
		description: "Vier-Augen, Backups, Wiederherstellung, Protokollierung.",
		function: "isb_ciso",
		frequencyMonths: 12,
		legalBasis: "MiCAR Art. 75; ISO 27001 A.8.24",
		frameworks: ["micar", "iso27001"],
	},
	{
		code: "INCIDENT-RESPONSE",
		title: "Vorfallreaktion und Meldewesen",
		description: "Klassifizierung, Fristen, BaFin-MVP, Krisenkommunikation.",
		function: "incident_manager",
		frequencyMonths: 12,
		legalBasis: "DORA Art. 17–19; NIS2 Art. 23",
		frameworks: ["dora", "nis2"],
	},
	{
		code: "SECURE-DEV",
		title: "Sichere Entwicklung",
		description: "OWASP Top 10, Secrets, Abhängigkeiten, Review.",
		orgRole: "editor",
		frequencyMonths: 12,
		legalBasis: "ISO 27001 A.8.28; DORA Art. 9(4)(e)",
		frameworks: ["iso27001", "dora"],
	},
];
