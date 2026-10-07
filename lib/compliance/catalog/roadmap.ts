import type { LicenceStage } from "@/db/schema/enums";

// Roadmap-Vorlage (Businessplan 10 / 21.9): Vorbereitung → Agent → CASP+ZAG-
// Antrag → BaFin-Verfahren → Go-Live → optional E-Geld → Bank. Meilensteine
// mit Monatsversatz zum Startdatum; „Vorlage anwenden" legt sie als
// `milestones` an, Verknüpfung zu Controls über milestone_controls.
// Fristen (Art. 63 MiCAR: 25 Arbeitstage Vollständigkeitsprüfung + 40
// Arbeitstage Prüfung; § 10 ZAG: 3 Monate) sind Orientierung, kein Rechtsrat.

export type RoadmapPhase =
	| "0_vorbereitung"
	| "1_agent"
	| "2_antrag"
	| "2_verfahren"
	| "2_golive"
	| "3_emi"
	| "4_bank";

export type RoadmapMilestone = {
	code: string;
	phase: RoadmapPhase;
	title: string;
	description: string;
	// Monate nach Startdatum
	monthOffset: number;
	controls: readonly string[];
	// ab welcher Zielstufe der Meilenstein sinnvoll ist
	fromStage: LicenceStage;
};

export const ROADMAP_PHASES: readonly {
	key: RoadmapPhase;
	title: string;
	stage: LicenceStage;
}[] = [
	{
		key: "0_vorbereitung",
		title: "Vorbereitung & ISMS",
		stage: "0_vorbereitung",
	},
	{ key: "1_agent", title: "Agent / Dienstleister", stage: "1_agent" },
	{
		key: "2_antrag",
		title: "Antragsunterlagen CASP + ZAG",
		stage: "2_casp_zag",
	},
	{ key: "2_verfahren", title: "BaFin-Verfahren", stage: "2_casp_zag" },
	{ key: "2_golive", title: "Go-Live", stage: "2_casp_zag" },
	{ key: "3_emi", title: "E-Geld-Institut (optional)", stage: "3_emi" },
	{ key: "4_bank", title: "Bank (CRR-Institut)", stage: "4_bank" },
];

export const ROADMAP_TEMPLATE: readonly RoadmapMilestone[] = [
	// ── Stufe 0 ─────────────────────────────────────────────────────────────
	{
		code: "RM-01",
		phase: "0_vorbereitung",
		title: "Gesellschaft gegründet, Gesellschafterstruktur dokumentiert",
		description:
			"GmbH mit Sitz Frankfurt, Gesellschaftervertrag, Kapitalnachweis; UBO-Kette für Inhaberkontrolle vorbereitet.",
		monthOffset: 0,
		controls: ["CC-GOV-22"],
		fromStage: "0_vorbereitung",
	},
	{
		code: "RM-02",
		phase: "0_vorbereitung",
		title: "Pflichtfunktionen benannt (GL, ISB, Compliance, GWB, Revision)",
		description:
			"Rollenregister besetzt, Vertretungen festgelegt, Funktionstrennung geprüft.",
		monthOffset: 1,
		controls: ["CC-GOV-02", "CC-GOV-11", "CC-AML-03"],
		fromStage: "0_vorbereitung",
	},
	{
		code: "RM-03",
		phase: "0_vorbereitung",
		title: "ISMS-Grundgerüst: Leitlinie, Geltungsbereich, Risikomethodik",
		description:
			"ISO 27001 Klauseln 4–6 dokumentiert; Risikoappetit beschlossen; Asset-Inventar begonnen.",
		monthOffset: 2,
		controls: ["CC-GOV-01", "CC-GOV-04", "CC-RSK-01", "CC-AST-01"],
		fromStage: "0_vorbereitung",
	},
	{
		code: "RM-04",
		phase: "0_vorbereitung",
		title: "Richtliniensatz aus Vorlagen übernommen und freigegeben",
		description:
			"Zugriff, Krypto, Change, Vorfall, BCM, Drittparteien, AML-Handbuch — Freigabe über Workflow, Kenntnisnahme läuft.",
		monthOffset: 3,
		controls: ["CC-GOV-08", "CC-IAM-01", "CC-CRY-04", "CC-INC-01", "CC-BCM-01"],
		fromStage: "0_vorbereitung",
	},
	{
		code: "RM-05",
		phase: "0_vorbereitung",
		title: "AML-Risikoanalyse v1 von der Geschäftsleitung freigegeben",
		description: "§ 5 GwG / AMLR Art. 10: Kunden, Produkte, Länder, Kanäle.",
		monthOffset: 3,
		controls: ["CC-AML-01", "CC-AML-02"],
		fromStage: "0_vorbereitung",
	},
	{
		code: "RM-06",
		phase: "0_vorbereitung",
		title: "Internes Audit und erste Managementbewertung durchgeführt",
		description: "Voraussetzung für Stage-1-Audit der ISO-Zertifizierung.",
		monthOffset: 5,
		controls: ["CC-GOV-05", "CC-GOV-06"],
		fromStage: "0_vorbereitung",
	},
	{
		code: "RM-07",
		phase: "0_vorbereitung",
		title: "ISO 27001 Stage 1 + Stage 2 bestanden",
		description:
			"Zertifikat als Nachweisbündel für DORA/ZAG-MaRisk und Bankpartner.",
		monthOffset: 7,
		controls: ["CC-CMP-02"],
		fromStage: "0_vorbereitung",
	},
	// ── Stufe 1 ─────────────────────────────────────────────────────────────
	{
		code: "RM-10",
		phase: "1_agent",
		title: "Lizenzpartner ausgewählt, Agentenvertrag (§ 25 ZAG) geschlossen",
		description:
			"Due Diligence Partner-Institut; Weisungen, Schulung, Haftung; Anzeige durch den Partner.",
		monthOffset: 4,
		controls: ["CC-PAY-01", "CC-TPR-03", "CC-TPR-04"],
		fromStage: "1_agent",
	},
	{
		code: "RM-11",
		phase: "1_agent",
		title: "DORA-Drittdienstleister-Paket für den Partner geliefert",
		description:
			"Art. 30-Klauseln, Informationsregister-Datenblatt, Vorfallmeldung ≤ 2 h an den Partner, Exit-Plan.",
		monthOffset: 5,
		controls: ["CC-TPR-04", "CC-TPR-06", "CC-INC-03"],
		fromStage: "1_agent",
	},
	{
		code: "RM-12",
		phase: "1_agent",
		title: "Händlerkasse: TSE, DSFinV-K, Belegausgabe produktiv",
		description:
			"Kassenrecht erfüllt; Verfahrensdokumentation nach GoBD versioniert.",
		monthOffset: 6,
		controls: ["CC-PAY-02"],
		fromStage: "1_agent",
	},
	// ── Stufe 2: Antrag ─────────────────────────────────────────────────────
	{
		code: "RM-20",
		phase: "2_antrag",
		title: "Eigenmittelplanung und Kapitalzusage (Art. 67 / §§ 12, 15 ZAG)",
		description:
			"Erster freigegebener Eigenmittel-Lauf; Finanzierungsplan über drei Jahre.",
		monthOffset: 8,
		controls: ["CC-CAP-01", "CC-RSK-06"],
		fromStage: "2_casp_zag",
	},
	{
		code: "RM-21",
		phase: "2_antrag",
		title: "Fit & Proper-Unterlagen der Geschäftsleiter vollständig",
		description:
			"Lebensläufe, Führungszeugnisse, Erklärungen, Zeitbudget, Interessenkonflikte.",
		monthOffset: 8,
		controls: ["CC-GOV-22"],
		fromStage: "2_casp_zag",
	},
	{
		code: "RM-22",
		phase: "2_antrag",
		title:
			"Kundengeld- und Kryptowerte-Trennung konzipiert (Treuhandkonto, Custody)",
		description:
			"Art. 70/75 MiCAR, § 17 ZAG, BTO 1: Treuhandvertrag, Custody-Vertrag, tägliche Abstimmung.",
		monthOffset: 9,
		controls: ["CC-CUS-01", "CC-CUS-02", "CC-CUS-03", "CC-KEY-01"],
		fromStage: "2_casp_zag",
	},
	{
		code: "RM-23",
		phase: "2_antrag",
		title: "Antragsmappen MiCAR (Art. 62) und ZAG (§ 10) vollständig",
		description:
			"/antrag zeigt 100 %; externe Prüfung durch Kanzlei; Einreichung über BaFin-MVP.",
		monthOffset: 10,
		controls: ["CC-REG-03"],
		fromStage: "2_casp_zag",
	},
	// ── Stufe 2: Verfahren ──────────────────────────────────────────────────
	{
		code: "RM-30",
		phase: "2_verfahren",
		title: "Vollständigkeitsbestätigung der BaFin (Art. 63(1): 25 Arbeitstage)",
		description:
			"Nachforderungen beantworten; Aufsichtskontakte im Register führen.",
		monthOffset: 12,
		controls: ["CC-REG-03", "CC-GOV-09"],
		fromStage: "2_casp_zag",
	},
	{
		code: "RM-31",
		phase: "2_verfahren",
		title: "Zulassungsbescheid CASP + ZAG-Erlaubnis",
		description:
			"Art. 63(9): Entscheidung binnen 40 Arbeitstagen nach Vollständigkeit (verlängerbar).",
		monthOffset: 15,
		controls: ["CC-REG-03"],
		fromStage: "2_casp_zag",
	},
	// ── Stufe 2: Go-Live ────────────────────────────────────────────────────
	{
		code: "RM-40",
		phase: "2_golive",
		title: "Informationsregister (ITS 2024/2956) erstmals eingereicht",
		description: "Meldefenster März; xBRL-CSV oder BaFin-Excel.",
		monthOffset: 16,
		controls: ["CC-TPR-01", "CC-TPR-09"],
		fromStage: "2_casp_zag",
	},
	{
		code: "RM-41",
		phase: "2_golive",
		title:
			"Pflichten-Kalender aktiv: Eigenmittel, Monatsausweis, GWB-Bericht, DAC8",
		description:
			"Alle Läufe mit Verantwortlichen und Vorlauf; erster Quartalslauf erledigt.",
		monthOffset: 16,
		controls: ["CC-REG-01", "CC-REG-02", "CC-TAX-01", "CC-STAT-01"],
		fromStage: "2_casp_zag",
	},
	{
		code: "RM-42",
		phase: "2_golive",
		title: "Externer Pentest bestanden, BCM-Übung durchgeführt",
		description:
			"DORA Art. 24–25 / Art. 11(6); Findings als Abweichungen nachverfolgt.",
		monthOffset: 17,
		controls: ["CC-TST-01", "CC-BCM-05"],
		fromStage: "2_casp_zag",
	},
	{
		code: "RM-43",
		phase: "2_golive",
		title: "Erster Korridor live (Pilot)",
		description:
			"Korridor-Vorlage (8 Schritte) durchlaufen; Länderdossier abgeschlossen.",
		monthOffset: 18,
		controls: ["CC-SAN-02", "CC-TR-01"],
		fromStage: "2_casp_zag",
	},
	// ── Stufe 3 / 4 ─────────────────────────────────────────────────────────
	{
		code: "RM-50",
		phase: "3_emi",
		title: "E-Geld-Erlaubnis (§ 11 ZAG) für eigenen Euro-EMT",
		description:
			"Anfangskapital 350 000 €; Whitepaper Titel IV MiCAR; Rücktauschpflicht.",
		monthOffset: 30,
		controls: ["CC-CAP-01", "CC-REG-03"],
		fromStage: "3_emi",
	},
	{
		code: "RM-60",
		phase: "4_bank",
		title: "KWG-Erlaubnis / CRR-Institut",
		description:
			"Banken-MaRisk, EZB-Aufsicht, Einlagensicherung — eigener Katalog in P5.",
		monthOffset: 48,
		controls: ["CC-REG-03"],
		fromStage: "4_bank",
	},
];

const STAGE_INDEX: Record<LicenceStage, number> = {
	"0_vorbereitung": 0,
	"1_agent": 1,
	"2_casp_zag": 2,
	"3_emi": 3,
	"4_bank": 4,
};

// Meilensteine bis zur Zielstufe, mit Fälligkeit ab Startdatum.
export function buildRoadmap(
	start: Date,
	targetStage: LicenceStage,
): (RoadmapMilestone & { dueAt: string })[] {
	const target = STAGE_INDEX[targetStage];
	return ROADMAP_TEMPLATE.filter((m) => STAGE_INDEX[m.fromStage] <= target).map(
		(m) => {
			const d = new Date(
				Date.UTC(
					start.getUTCFullYear(),
					start.getUTCMonth() + m.monthOffset,
					1,
				),
			);
			// Monatsende als Fälligkeit
			const end = new Date(
				Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0),
			);
			return { ...m, dueAt: end.toISOString().slice(0, 10) };
		},
	);
}
