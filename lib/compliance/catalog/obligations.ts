import type { DueRule } from "@/db/schema/aml";
import type { LicenceStage } from "@/db/schema/enums";
import { stageAtLeast } from "./required-functions";

// Pflichten-Kalender (Businessplan 11.6/18.3/18.9, Anforderungskatalog):
// wiederkehrende Melde-, Prüf- und Berichtspflichten je Lizenzstufe. Der
// compliance-tick legt obligation_runs mit Vorlauf (leadDays) an; /kalender
// zeigt die Jahresansicht. Termine teils aus Modellwissen — vor Verlass
// gegen BaFin/Bundesbank-Veröffentlichungen prüfen.

export type ObligationFrequency =
	| "per_event"
	| "daily"
	| "weekly"
	| "monthly"
	| "quarterly"
	| "semiannual"
	| "annual"
	| "triennial";

export type ObligationRecipient =
	| "bafin_mvp"
	| "bundesbank"
	| "bzst"
	| "fiu_goaml"
	| "bsi"
	| "pruefer"
	| "kunden"
	| "intern";

export type CatalogObligation = {
	code: string;
	title: string;
	legalBasis: string;
	// Rahmenwerk, aus dem die Pflicht stammt (für Filter/Nav); eines genügt
	frameworks: readonly string[];
	frequency: ObligationFrequency;
	dueRule?: DueRule;
	// zweiter Termin bei halbjährlichen Pflichten (Monat)
	secondMonth?: number;
	recipient: ObligationRecipient;
	leadDays: number;
	appliesFromStage?: LicenceStage;
	description?: string;
	// Control, dessen Nachweis der erledigte Lauf liefert
	control?: string;
};

export const OBLIGATIONS: readonly CatalogObligation[] = [
	// ── Stufe 0: ISMS-Betrieb ───────────────────────────────────────────
	{
		code: "OBL-ISMS-POLICY-REVIEW",
		title: "Jährlicher Richtlinien-Review (alle gelenkten Dokumente)",
		legalBasis: "ISO 27001 7.5 / A.5.1 · DORA Art. 5(2)(e)",
		frameworks: ["iso27001", "dora", "nis2"],
		frequency: "annual",
		dueRule: { kind: "fixed", month: 8, day: 31 },
		recipient: "intern",
		leadDays: 45,
		control: "CC-GOV-08",
	},
	{
		code: "OBL-ISMS-MGMT-REVIEW",
		title: "Managementbewertung durchführen",
		legalBasis: "ISO 27001 9.3 · DORA Art. 6(5)",
		frameworks: ["iso27001", "dora"],
		frequency: "annual",
		dueRule: { kind: "fixed", month: 11, day: 30 },
		recipient: "intern",
		leadDays: 45,
		control: "CC-GOV-05",
	},
	{
		code: "OBL-ISMS-INTERNAL-AUDIT",
		title: "Internes Audit nach Programm",
		legalBasis: "ISO 27001 9.2 · ZAG-MaRisk BT 2",
		frameworks: ["iso27001", "zag-marisk"],
		frequency: "annual",
		dueRule: { kind: "fixed", month: 10, day: 31 },
		recipient: "intern",
		leadDays: 60,
		control: "CC-GOV-06",
	},
	{
		code: "OBL-ACCESS-RECERT",
		title: "Rezertifizierung der Zugriffsrechte",
		legalBasis: "ISO 27001 A.5.18 · DORA Art. 9(4)(c) · ZAG-MaRisk AT 7.2",
		frameworks: ["iso27001", "dora", "zag-marisk"],
		frequency: "semiannual",
		dueRule: { kind: "fixed", month: 4, day: 30 },
		secondMonth: 10,
		recipient: "intern",
		leadDays: 21,
		control: "CC-IAM-04",
	},
	{
		code: "OBL-FIREWALL-REVIEW",
		title: "Firewall- und Netzregel-Review",
		legalBasis: "ISO 27001 A.8.20–A.8.22 · DORA RTS 2024/1774 Art. 13",
		frameworks: ["iso27001", "dora"],
		frequency: "semiannual",
		dueRule: { kind: "fixed", month: 5, day: 31 },
		secondMonth: 10,
		recipient: "intern",
		leadDays: 21,
		control: "CC-NET-01",
	},
	{
		code: "OBL-BCP-TEST",
		title: "Notfall-/Wiederanlaufübung",
		legalBasis: "ISO 27001 A.5.30 · DORA Art. 11(6) · NIS2 Art. 21(2)(c)",
		frameworks: ["iso27001", "dora", "nis2"],
		frequency: "annual",
		dueRule: { kind: "fixed", month: 6, day: 30 },
		recipient: "intern",
		leadDays: 60,
		control: "CC-BCM-05",
	},
	{
		code: "OBL-RESTORE-TEST",
		title: "Wiederherstellungstest der Backups",
		legalBasis: "ISO 27001 A.8.13 · DORA Art. 12",
		frameworks: ["iso27001", "dora"],
		frequency: "quarterly",
		dueRule: { kind: "quarterly", dayOfMonthAfterQuarter: 15 },
		recipient: "intern",
		leadDays: 14,
		control: "CC-BCM-03",
	},
	{
		code: "OBL-PENTEST",
		title: "Penetrationstest der kritischen Systeme",
		legalBasis: "DORA Art. 24–25 · ISO 27001 A.8.8",
		frameworks: ["dora", "iso27001", "nis2"],
		frequency: "annual",
		dueRule: { kind: "fixed", month: 9, day: 30 },
		recipient: "intern",
		leadDays: 90,
		control: "CC-TST-01",
	},
	{
		code: "OBL-DORA-LEGACY-REVIEW",
		title: "Jahresbewertung der Altsysteme",
		legalBasis: "DORA Art. 8(7)",
		frameworks: ["dora"],
		frequency: "annual",
		dueRule: { kind: "fixed", month: 3, day: 31 },
		recipient: "intern",
		leadDays: 30,
	},
	{
		code: "OBL-DORA-MGMT-TRAINING",
		title: "Schulung des Leitungsorgans zu IKT-Risiken",
		legalBasis: "DORA Art. 5(4) · NIS2 Art. 20(2)",
		frameworks: ["dora", "nis2"],
		frequency: "annual",
		dueRule: { kind: "fixed", month: 2, day: 28 },
		recipient: "intern",
		leadDays: 45,
		control: "CC-GOV-16",
	},
	{
		code: "OBL-DORA-CTPP-CHECK",
		title:
			"Abgleich der Dienstleister mit der ESA-Liste kritischer IKT-Drittdienstleister",
		legalBasis: "DORA Art. 31 · Art. 28(3)",
		frameworks: ["dora"],
		frequency: "annual",
		dueRule: { kind: "fixed", month: 1, day: 31 },
		recipient: "intern",
		leadDays: 21,
		control: "CC-TPR-09",
	},
	{
		code: "OBL-NIS2-REG-DATA",
		title: "NIS2-Registrierungsdaten beim BSI prüfen und aktualisieren",
		legalBasis: "§ 33 BSIG",
		frameworks: ["nis2"],
		frequency: "annual",
		dueRule: { kind: "fixed", month: 1, day: 31 },
		recipient: "bsi",
		leadDays: 21,
		control: "CC-GOV-18",
	},
	{
		code: "OBL-SANCTIONS-LIST",
		title: "Tagesaktueller Sanktionslisten-Abgleich (EU/OFAC/BIS)",
		legalBasis: "VO (EU) 2014/833 · AWG § 18 · GwG § 6",
		frameworks: ["sanctions", "gwg"],
		frequency: "daily",
		recipient: "intern",
		leadDays: 0,
		description:
			"Läuft automatisiert; Nachweis über control_tests (method automated). Keine Einzelläufe im Kalender.",
	},
	// ── Stufe 1: Agent / Verpflichteter nach GwG ────────────────────────
	{
		code: "OBL-GWG-ANNUAL-REPORT",
		title: "Jahresbericht der Geldwäschebeauftragten an die Geschäftsleitung",
		legalBasis: "§ 7 Abs. 5 GwG · BaFin-AuA 4.2",
		frameworks: ["gwg", "amlr"],
		frequency: "annual",
		dueRule: { kind: "fixed", month: 12, day: 15 },
		recipient: "intern",
		leadDays: 45,
		appliesFromStage: "1_agent",
	},
	{
		code: "OBL-GWG-RISK-ANALYSIS",
		title: "Risikoanalyse nach § 5 GwG aktualisieren und genehmigen lassen",
		legalBasis: "§ 5 Abs. 1–2 GwG · AMLR Art. 10",
		frameworks: ["gwg", "amlr"],
		frequency: "annual",
		dueRule: { kind: "fixed", month: 3, day: 31 },
		recipient: "intern",
		leadDays: 60,
		appliesFromStage: "1_agent",
	},
	{
		code: "OBL-GWG-TRAINING",
		title: "Unterrichtung der Mitarbeitenden zu Geldwäscheprävention",
		legalBasis: "§ 6 Abs. 2 Nr. 6 GwG",
		frameworks: ["gwg", "amlr"],
		frequency: "annual",
		dueRule: { kind: "fixed", month: 6, day: 30 },
		recipient: "intern",
		leadDays: 45,
		appliesFromStage: "1_agent",
		control: "CC-HR-03",
	},
	// ── Stufe 2: CASP + ZAG ─────────────────────────────────────────────
	{
		code: "OBL-OWN-FUNDS-Q",
		title: "Eigenmittelberechnung und -meldung",
		legalBasis: "MiCAR Art. 67 · § 15 ZAG · ZahlPrüfbV",
		frameworks: ["micar", "zag"],
		frequency: "quarterly",
		dueRule: { kind: "quarterly", dayOfMonthAfterQuarter: 15 },
		recipient: "bafin_mvp",
		leadDays: 21,
		appliesFromStage: "2_casp_zag",
	},
	{
		code: "OBL-ZAG-MONTHLY",
		title: "Monatsausweis an die Bundesbank",
		legalBasis: "§ 29 ZAG",
		frameworks: ["zag"],
		frequency: "monthly",
		dueRule: { kind: "monthly", day: 15 },
		recipient: "bundesbank",
		leadDays: 7,
		appliesFromStage: "2_casp_zag",
	},
	{
		code: "OBL-DORA-REGISTER",
		title: "Informationsregister an die BaFin melden",
		legalBasis: "DORA Art. 28(3) · ITS 2024/2956",
		frameworks: ["dora"],
		frequency: "annual",
		dueRule: { kind: "fixed", month: 3, day: 30 },
		recipient: "bafin_mvp",
		leadDays: 45,
		appliesFromStage: "2_casp_zag",
		description: "Meldefenster 9.–30.03.; xBRL-CSV oder BaFin-Excel-Vorlage.",
		control: "CC-TPR-01",
	},
	{
		code: "OBL-ANNUAL-ACCOUNTS",
		title: "Jahresabschluss und Prüfungsbericht einreichen",
		legalBasis: "§ 22 ZAG · MiCAR Art. 68(9)",
		frameworks: ["zag", "micar"],
		frequency: "annual",
		dueRule: { kind: "fixed", month: 6, day: 30 },
		recipient: "bafin_mvp",
		leadDays: 90,
		appliesFromStage: "2_casp_zag",
	},
	{
		code: "OBL-AUDITOR-NOTICE",
		title: "Prüferanzeige",
		legalBasis: "§ 24 ZAG",
		frameworks: ["zag"],
		frequency: "annual",
		dueRule: { kind: "fixed", month: 1, day: 31 },
		recipient: "bafin_mvp",
		leadDays: 30,
		appliesFromStage: "2_casp_zag",
	},
	{
		code: "OBL-DAC8",
		title: "DAC8-Meldung der Kryptowerte-Transaktionen an das BZSt",
		legalBasis: "KStTG §§ 9, 17",
		frameworks: ["dac8"],
		frequency: "annual",
		dueRule: { kind: "fixed", month: 7, day: 31 },
		recipient: "bzst",
		leadDays: 60,
		appliesFromStage: "2_casp_zag",
	},
	{
		code: "OBL-AWV-MONTHLY",
		title: "AWV-Meldung grenzüberschreitender Zahlungen > 50 000 €",
		legalBasis: "§ 67 AWV",
		frameworks: ["awv"],
		frequency: "monthly",
		dueRule: { kind: "monthly", day: 7 },
		recipient: "bundesbank",
		leadDays: 5,
		appliesFromStage: "2_casp_zag",
	},
	{
		code: "OBL-PAYMENT-STATS",
		title: "Zahlungsverkehrsstatistik",
		legalBasis: "EZB-VO 2020/2011 · § 16 FinDAG",
		frameworks: ["zag", "awv"],
		frequency: "semiannual",
		dueRule: { kind: "fixed", month: 2, day: 28 },
		secondMonth: 8,
		recipient: "bundesbank",
		leadDays: 21,
		appliesFromStage: "2_casp_zag",
	},
	{
		code: "OBL-ZAG-OPRISK-REPORT",
		title: "Jahresbericht zu operationellen und sicherheitsrelevanten Risiken",
		legalBasis: "§ 53 Abs. 2 ZAG · BaFin RS 05/2024",
		frameworks: ["zag"],
		frequency: "annual",
		dueRule: { kind: "fixed", month: 3, day: 31 },
		recipient: "bafin_mvp",
		leadDays: 60,
		appliesFromStage: "2_casp_zag",
	},
	{
		code: "OBL-EBA-FRAUD",
		title: "EBA-Betrugsstatistik",
		legalBasis: "§ 54 ZAG · EBA/GL/2018/05",
		frameworks: ["zag"],
		frequency: "semiannual",
		dueRule: { kind: "fixed", month: 2, day: 28 },
		secondMonth: 8,
		recipient: "bundesbank",
		leadDays: 21,
		appliesFromStage: "2_casp_zag",
	},
	{
		code: "OBL-TRA-QUARTERLY",
		title: "TRA-Betrugsquoten je Ausnahmeschwelle berechnen",
		legalBasis: "§ 55 ZAG · RTS 2018/389 Art. 18–21",
		frameworks: ["zag"],
		frequency: "quarterly",
		dueRule: { kind: "quarterly", dayOfMonthAfterQuarter: 20 },
		recipient: "intern",
		leadDays: 14,
		appliesFromStage: "2_casp_zag",
	},
	{
		code: "OBL-ZAG-RISK-REPORT",
		title: "Jährlicher Risikobericht an die Geschäftsleitung",
		legalBasis: "ZAG-MaRisk BT 3",
		frameworks: ["zag-marisk"],
		frequency: "annual",
		dueRule: { kind: "fixed", month: 3, day: 31 },
		recipient: "intern",
		leadDays: 45,
		appliesFromStage: "2_casp_zag",
	},
	{
		code: "OBL-MICAR-SUSTAINABILITY",
		title: "Nachhaltigkeitsindikatoren der Konsensmechanismen aktualisieren",
		legalBasis: "MiCAR Art. 66(5) · DelVO 2025/305",
		frameworks: ["micar"],
		frequency: "annual",
		dueRule: { kind: "fixed", month: 12, day: 31 },
		recipient: "kunden",
		leadDays: 30,
		appliesFromStage: "2_casp_zag",
	},
	{
		code: "OBL-MICAR-STATEMENTS",
		title: "Kontoauszüge / Positionsaufstellung an Kunden",
		legalBasis: "MiCAR Art. 75(5)",
		frameworks: ["micar"],
		frequency: "quarterly",
		dueRule: { kind: "quarterly", dayOfMonthAfterQuarter: 10 },
		recipient: "kunden",
		leadDays: 7,
		appliesFromStage: "2_casp_zag",
	},
	{
		code: "OBL-COMPLAINTS-REVIEW",
		title: "Beschwerdeauswertung und Bericht",
		legalBasis: "MiCAR Art. 71 · DelVO 2025/1141 · ZAG § 62",
		frameworks: ["micar", "zag"],
		frequency: "quarterly",
		dueRule: { kind: "quarterly", dayOfMonthAfterQuarter: 31 },
		recipient: "intern",
		leadDays: 14,
		appliesFromStage: "2_casp_zag",
	},
	{
		code: "OBL-TLPT",
		title: "Bedrohungsorientierter Penetrationstest (TLPT)",
		legalBasis: "DORA Art. 26 · RTS 2025/1190",
		frameworks: ["dora"],
		frequency: "triennial",
		dueRule: { kind: "fixed", month: 12, day: 31 },
		recipient: "bafin_mvp",
		leadDays: 180,
		appliesFromStage: "2_casp_zag",
		description: "Nur bei Benennung durch die BaFin (tlptDesignated).",
		control: "CC-TST-02",
	},
];

export const OBLIGATION_BY_CODE: ReadonlyMap<string, CatalogObligation> =
	new Map(OBLIGATIONS.map((o) => [o.code, o]));

export function applicableObligations(
	frameworks: readonly string[],
	stage: LicenceStage,
	opts: { tlptDesignated?: boolean } = {},
): CatalogObligation[] {
	const set = new Set(frameworks);
	return OBLIGATIONS.filter((o) => {
		if (!o.frameworks.some((f) => set.has(f))) return false;
		if (!stageAtLeast(stage, o.appliesFromStage)) return false;
		if (o.code === "OBL-TLPT" && !opts.tlptDesignated) return false;
		return true;
	});
}
