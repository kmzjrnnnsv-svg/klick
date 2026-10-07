import type { RoleFunction } from "@/db/schema/enums";

// Prozesslandkarte eines Stablecoin-CASP mit ZAG-Erlaubnis (Businessplan
// 5.3/11.6/18.4). Seed für /prozesse: Kategorie, Kritikalität (DORA „kritische
// oder wichtige Funktion"), BIA-Werte, RACI-Funktionen (genau ein A) und
// Controls. `requires` filtert nach gewählten Rahmenwerken (eines genügt);
// ohne `requires` immer anwendbar.

export type CatalogProcess = {
	code: string;
	name: string;
	description: string;
	category: "core" | "support" | "management" | "control";
	criticality: "critical" | "important" | "standard";
	rtoHours?: number;
	rpoHours?: number;
	mtpdHours?: number;
	inputs?: string;
	outputs?: string;
	controls: readonly string[];
	raci: readonly { function: RoleFunction; raci: "R" | "A" | "C" | "I" }[];
	requires?: readonly string[];
};

const GL = "management_body" as const;

export const PROCESSES: readonly CatalogProcess[] = [
	{
		code: "P-01",
		name: "Zahlungsannahme (Stablecoin-Eingang)",
		description:
			"Annahme von EMT-Zahlungen an Händlerwallets, Bestätigungsprüfung, Gutschrift im Positionsregister.",
		category: "core",
		criticality: "critical",
		rtoHours: 4,
		rpoHours: 0,
		mtpdHours: 24,
		inputs: "Zahlungsauftrag, On-Chain-Transaktion",
		outputs: "Gutschrift, Beleg, Monitoring-Event",
		controls: ["CC-OPS-01", "CC-LOG-01", "CC-BCM-02", "CC-CRY-01"],
		raci: [
			{ function: GL, raci: "A" },
			{ function: "isb_ciso", raci: "C" },
			{ function: "aml_officer", raci: "C" },
			{ function: "incident_manager", raci: "I" },
		],
		requires: ["micar", "zag"],
	},
	{
		code: "P-02",
		name: "Herkunftsprüfung (Blockchain-Analytics)",
		description:
			"Risikobewertung der Gegenadresse vor Gutschrift: Sanktionen, Mixer, Darknet-Exposure, Travel-Rule-Daten.",
		category: "core",
		criticality: "critical",
		rtoHours: 4,
		rpoHours: 1,
		mtpdHours: 24,
		controls: ["CC-OPS-01", "CC-LOG-01", "CC-TPR-05"],
		raci: [
			{ function: "aml_officer", raci: "A" },
			{ function: GL, raci: "I" },
			{ function: "isb_ciso", raci: "C" },
		],
		requires: ["gwg", "amlr", "tfr", "sanctions"],
	},
	{
		code: "P-03",
		name: "Umtausch Stablecoin ↔ Euro",
		description:
			"Tausch von EMT gegen Euro (und zurück) zu veröffentlichten Konditionen, Best Execution, Abrechnung.",
		category: "core",
		criticality: "critical",
		rtoHours: 8,
		rpoHours: 1,
		mtpdHours: 48,
		controls: ["CC-OPS-01", "CC-LOG-01", "CC-GOV-11"],
		raci: [
			{ function: GL, raci: "A" },
			{ function: "compliance", raci: "C" },
			{ function: "risk_control", raci: "C" },
		],
		requires: ["micar"],
	},
	{
		code: "P-04",
		name: "Auszahlung an Händler (Euro/Stablecoin)",
		description:
			"Freigabe und Ausführung von Auszahlungen, Vier-Augen-Prinzip, SCA, Abgleich mit Kundengeldkonto.",
		category: "core",
		criticality: "critical",
		rtoHours: 4,
		rpoHours: 0,
		mtpdHours: 24,
		controls: ["CC-IAM-01", "CC-GOV-11", "CC-LOG-01", "CC-BCM-02"],
		raci: [
			{ function: GL, raci: "A" },
			{ function: "risk_control", raci: "C" },
			{ function: "aml_officer", raci: "C" },
		],
		requires: ["zag", "micar"],
	},
	{
		code: "P-05",
		name: "Händler-Onboarding (KYB)",
		description:
			"Identifizierung und Prüfung von Geschäftskunden, UBO-Ermittlung, Risikoklassifizierung, Vertragsabschluss.",
		category: "core",
		criticality: "important",
		rtoHours: 24,
		rpoHours: 4,
		mtpdHours: 120,
		controls: ["CC-TPR-03", "CC-LOG-01", "CC-GOV-11"],
		raci: [
			{ function: "aml_officer", raci: "A" },
			{ function: GL, raci: "I" },
			{ function: "dpo", raci: "C" },
		],
		requires: ["gwg", "amlr"],
	},
	{
		code: "P-06",
		name: "Transaktionsmonitoring",
		description:
			"Regelbasierte und risikobasierte Überwachung von Fiat- und Krypto-Transaktionen, Alert-Bearbeitung, Regelwerk-Tuning.",
		category: "control",
		criticality: "critical",
		rtoHours: 8,
		rpoHours: 1,
		mtpdHours: 48,
		controls: ["CC-LOG-01", "CC-LOG-02", "CC-TPR-05"],
		raci: [
			{ function: "aml_officer", raci: "A" },
			{ function: "isb_ciso", raci: "C" },
			{ function: GL, raci: "I" },
		],
		requires: ["gwg", "amlr"],
	},
	{
		code: "P-07",
		name: "Verdachtsmeldung (FIU / STOR)",
		description:
			"Prüfung von Auffälligkeiten, Entscheidung, Meldung über goAML bzw. an die BaFin, Durchführungsverbot § 46 GwG.",
		category: "control",
		criticality: "important",
		rtoHours: 24,
		mtpdHours: 72,
		controls: ["CC-LOG-01", "CC-INC-03"],
		raci: [
			{ function: "aml_officer", raci: "A" },
			{ function: GL, raci: "I" },
		],
		requires: ["gwg", "amlr", "micar"],
	},
	{
		code: "P-08",
		name: "Beschwerdemanagement",
		description:
			"Entgegennahme, Bestätigung, Bearbeitung und Auswertung von Kundenbeschwerden mit Fristen nach MiCAR Art. 71.",
		category: "support",
		criticality: "standard",
		rtoHours: 72,
		controls: ["CC-GOV-07", "CC-GOV-09"],
		raci: [
			{ function: "compliance", raci: "A" },
			{ function: GL, raci: "I" },
		],
		requires: ["micar", "zag"],
	},
	{
		code: "P-09",
		name: "Vorfallmanagement",
		description:
			"Erkennen, Klassifizieren, Eindämmen, Melden (DORA/NIS2/DSGVO) und Nachbereiten von Sicherheits- und Betriebsvorfällen.",
		category: "control",
		criticality: "critical",
		rtoHours: 2,
		mtpdHours: 24,
		controls: ["CC-INC-01", "CC-INC-02", "CC-INC-03", "CC-INC-05"],
		raci: [
			{ function: "incident_manager", raci: "A" },
			{ function: "isb_ciso", raci: "R" },
			{ function: GL, raci: "I" },
			{ function: "crisis_team", raci: "C" },
		],
	},
	{
		code: "P-10",
		name: "Schlüsselzeremonie und Schlüsselverwaltung",
		description:
			"Erzeugung, Verteilung, Rotation und Vernichtung kryptografischer Schlüssel unter Vier-Augen-Prinzip mit Protokoll.",
		category: "control",
		criticality: "critical",
		rtoHours: 8,
		rpoHours: 0,
		mtpdHours: 48,
		controls: ["CC-CRY-02", "CC-CRY-03", "CC-GOV-11", "CC-LOG-01"],
		raci: [
			{ function: "isb_ciso", raci: "A" },
			{ function: GL, raci: "I" },
			{ function: "internal_audit", raci: "I" },
		],
	},
	{
		code: "P-11",
		name: "Kundengeldabstimmung",
		description:
			"Tägliche Abstimmung von Kundengeldern (Treuhandkonto) und Kundenkryptowerten gegen das Positionsregister, außerhalb des Betriebsbereichs.",
		category: "control",
		criticality: "critical",
		rtoHours: 24,
		rpoHours: 24,
		mtpdHours: 48,
		controls: ["CC-GOV-11", "CC-LOG-01"],
		raci: [
			{ function: "risk_control", raci: "A" },
			{ function: GL, raci: "I" },
			{ function: "internal_audit", raci: "I" },
		],
		requires: ["zag", "zag-marisk", "micar"],
	},
	{
		code: "P-12",
		name: "Eigenmittelberechnung",
		description:
			"Quartalsweise Berechnung der Eigenmittelanforderung (MiCAR Art. 67, § 15 ZAG), Freigabe und Meldung.",
		category: "management",
		criticality: "important",
		rtoHours: 72,
		controls: ["CC-GOV-10"],
		raci: [
			{ function: "risk_control", raci: "R" },
			{ function: GL, raci: "A" },
			{ function: "internal_audit", raci: "I" },
		],
		requires: ["micar", "zag"],
	},
	{
		code: "P-13",
		name: "Meldewesen an Aufsicht",
		description:
			"Fristgerechte Erstellung und Abgabe aufsichtlicher Meldungen (BaFin MVP, Bundesbank, BZSt, FIU).",
		category: "management",
		criticality: "important",
		rtoHours: 72,
		controls: ["CC-GOV-09", "CC-GOV-10"],
		raci: [
			{ function: "compliance", raci: "A" },
			{ function: GL, raci: "I" },
		],
		requires: ["zag", "micar", "dora", "dac8", "awv"],
	},
	{
		code: "P-14",
		name: "Lieferanten- und Auslagerungssteuerung",
		description:
			"Due Diligence, Vertragsklauseln nach DORA Art. 30, laufende Überwachung, Exit-Pläne, Informationsregister.",
		category: "management",
		criticality: "important",
		rtoHours: 120,
		controls: ["CC-TPR-01", "CC-TPR-03", "CC-TPR-04", "CC-TPR-05", "CC-TPR-06"],
		raci: [
			{ function: "outsourcing_officer", raci: "A" },
			{ function: "isb_ciso", raci: "C" },
			{ function: GL, raci: "I" },
		],
	},
	{
		code: "P-15",
		name: "Änderungsmanagement und neue Produkte",
		description:
			"Bewertung, Freigabe und kontrollierte Einführung von Änderungen an IKT-Systemen und neuen Produkten (NPP).",
		category: "management",
		criticality: "important",
		rtoHours: 120,
		controls: ["CC-DEV-02", "CC-OPS-02", "CC-GOV-12"],
		raci: [
			{ function: "ict_risk_function", raci: "A" },
			{ function: "isb_ciso", raci: "R" },
			{ function: GL, raci: "C" },
		],
	},
	{
		code: "P-16",
		name: "Zugriffsverwaltung",
		description:
			"Beantragung, Genehmigung, Vergabe, Rezertifizierung und Entzug von Berechtigungen; privilegierte Zugriffe.",
		category: "support",
		criticality: "important",
		rtoHours: 24,
		controls: ["CC-IAM-01", "CC-IAM-02", "CC-IAM-03", "CC-IAM-04"],
		raci: [
			{ function: "isb_ciso", raci: "A" },
			{ function: GL, raci: "I" },
		],
	},
	{
		code: "P-17",
		name: "Datensicherung und Wiederherstellung",
		description:
			"Tägliche Sicherungen, Offsite-Kopien, regelmäßige Wiederherstellungstests mit Nachweis.",
		category: "support",
		criticality: "critical",
		rtoHours: 8,
		rpoHours: 24,
		mtpdHours: 48,
		controls: ["CC-BCM-03", "CC-BCM-04"],
		raci: [
			{ function: "bcm_manager", raci: "A" },
			{ function: "isb_ciso", raci: "C" },
		],
	},
	{
		code: "P-18",
		name: "Schulung und Awareness",
		description:
			"Planung, Durchführung und Nachweis von Pflichtschulungen (GwG, DORA-Leitung, Phishing, Datenschutz).",
		category: "support",
		criticality: "standard",
		controls: ["CC-HR-03", "CC-GOV-16"],
		raci: [
			{ function: "isb_ciso", raci: "A" },
			{ function: "aml_officer", raci: "R" },
			{ function: GL, raci: "I" },
		],
	},
	{
		code: "P-19",
		name: "Internes Audit",
		description:
			"Mehrjähriges Auditprogramm, Durchführung, Findings, Follow-up — unabhängig vom operativen Betrieb.",
		category: "control",
		criticality: "standard",
		controls: ["CC-GOV-06", "CC-GOV-13"],
		raci: [
			{ function: "internal_audit", raci: "A" },
			{ function: GL, raci: "I" },
		],
	},
	{
		code: "P-20",
		name: "Managementbewertung",
		description:
			"Jährliche Bewertung des Managementsystems durch die Leitung mit allen Pflicht-Inputs; Beschlüsse und Maßnahmen.",
		category: "management",
		criticality: "standard",
		controls: ["CC-GOV-05", "CC-GOV-03"],
		raci: [
			{ function: GL, raci: "A" },
			{ function: "isb_ciso", raci: "R" },
			{ function: "compliance", raci: "C" },
			{ function: "internal_audit", raci: "C" },
		],
	},
];

export const PROCESS_BY_CODE: ReadonlyMap<string, CatalogProcess> = new Map(
	PROCESSES.map((p) => [p.code, p]),
);

export function applicableProcesses(
	frameworks: readonly string[],
): CatalogProcess[] {
	const set = new Set(frameworks);
	return PROCESSES.filter(
		(p) => !p.requires || p.requires.some((f) => set.has(f)),
	);
}

// RACI-Regel: genau ein A je Prozess.
export function raciValid(raci: readonly { raci: "R" | "A" | "C" | "I" }[]): {
	ok: boolean;
	accountable: number;
} {
	const accountable = raci.filter((r) => r.raci === "A").length;
	return { ok: accountable === 1, accountable };
}
