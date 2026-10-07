import type { LicenceStage, RoleFunction } from "@/db/schema/enums";

// Pflichtfunktionen je Rahmenwerk und Lizenzstufe („Oberste Leitung ist
// bestimmt" = benannte Person mit Vertretung und Nachweis). Unbesetzte
// Funktion = Gap in /organisation, Setup-Checkliste und /ueberblick.
// Quelle: Anforderungskatalog 2026-10 (ISO 5.3, DORA Art. 5/6(4)/5(3),
// NIS2 Art. 20 + § 38 BSIG, ZAG-MaRisk AT 4.4, MiCAR Art. 68, GwG § 7,
// AMLR Art. 9, DSGVO Art. 37). Kein Rechtsrat.

export type RequiredFunction = {
	function: RoleFunction;
	title: string;
	// Rahmenwerke, die die Funktion verlangen (eines genügt)
	frameworks: readonly string[];
	// ab dieser Lizenzstufe (Default: immer)
	appliesFromStage?: LicenceStage;
	legalBasis: string;
	// Vertretung ausdrücklich gefordert
	deputyRequired?: boolean;
	// Fit-&-Proper-Prüfung (MiCAR Art. 68, ZAG § 10, KWG § 25c)
	fitProper?: boolean;
	hint?: string;
};

export const REQUIRED_FUNCTIONS: readonly RequiredFunction[] = [
	{
		function: "management_body",
		title: "Leitungsorgan / Geschäftsleitung",
		frameworks: [
			"iso27001",
			"dora",
			"nis2",
			"micar",
			"zag",
			"zag-marisk",
			"gwg",
			"kwg",
		],
		legalBasis:
			"ISO 27001 5.1 · DORA Art. 5(2) · NIS2 Art. 20(1) · MiCAR Art. 68 · ZAG-MaRisk AT 3",
		fitProper: true,
		hint: "Trägt die Gesamtverantwortung; genehmigt Rahmen, Strategie, Budget und Richtlinien.",
	},
	{
		function: "isb_ciso",
		title: "Informationssicherheitsbeauftragte:r (ISB/CISO)",
		frameworks: ["iso27001", "nis2", "dora", "zag-marisk"],
		legalBasis: "ISO 27001 5.3 / A.5.2 · ZAG-MaRisk AT 7.2 · NIS2 Art. 21",
		deputyRequired: true,
		hint: "Steuert das ISMS, berichtet direkt an die Leitung; organisatorisch unabhängig vom IT-Betrieb.",
	},
	{
		function: "ict_risk_function",
		title: "Unabhängige IKT-Risikokontrollfunktion",
		frameworks: ["dora"],
		legalBasis: "DORA Art. 6(4)",
		deputyRequired: true,
		hint: "Zweite Verteidigungslinie für IKT-Risiken; unabhängig von Entwicklung und Betrieb.",
	},
	{
		function: "outsourcing_officer",
		title: "Verantwortliche:r für Drittparteien-/Auslagerungssteuerung",
		frameworks: ["dora", "zag-marisk", "micar"],
		legalBasis: "DORA Art. 5(3) · ZAG-MaRisk AT 9 · MiCAR Art. 73",
		hint: "Überwacht Vereinbarungen mit IKT-Drittdienstleistern und Auslagerungen, führt das Informationsregister.",
	},
	{
		function: "incident_manager",
		title: "Vorfall-Manager:in",
		frameworks: ["dora", "nis2", "iso27001", "zag"],
		legalBasis: "DORA Art. 17 · NIS2 Art. 23 · ISO 27001 A.5.24",
		deputyRequired: true,
		hint: "Klassifiziert Vorfälle, hält die Meldefristen, führt das Vorfallregister.",
	},
	{
		function: "bcm_manager",
		title: "BCM-Verantwortliche:r",
		frameworks: ["dora", "iso27001", "zag-marisk"],
		legalBasis: "DORA Art. 11 · ISO 27001 A.5.29/A.5.30 · ZAG-MaRisk AT 7.3",
		hint: "Pflegt Notfall- und Wiederanlaufpläne, plant Übungen und die BIA.",
	},
	{
		function: "crisis_team",
		title: "Krisenstab",
		frameworks: ["dora", "zag-marisk"],
		legalBasis: "DORA Art. 11(7) / Art. 14 · ZAG-MaRisk AT 7.3",
		hint: "Entscheidet im Krisenfall; Kontaktliste muss offline verfügbar sein (Kommunikationsmatrix).",
	},
	{
		function: "nis2_responsible",
		title: "NIS2-Verantwortliche:r / Ansprechperson BSI",
		frameworks: ["nis2"],
		legalBasis: "§ 33 BSIG (Registrierung) · § 38 BSIG",
		hint: "Hält Registrierungsdaten aktuell und ist Kontaktstelle des BSI.",
	},
	{
		function: "compliance",
		title: "Compliance-Funktion",
		frameworks: ["zag-marisk", "micar", "zag", "kwg"],
		appliesFromStage: "2_casp_zag",
		legalBasis: "ZAG-MaRisk AT 4.4.2 · MiCAR Art. 68(3) · KWG § 25a",
		deputyRequired: true,
		hint: "Unabhängig von den Geschäftsbereichen; berichtet mindestens jährlich an die Leitung.",
	},
	{
		function: "risk_control",
		title: "Risikocontrolling-Funktion",
		frameworks: ["zag-marisk", "kwg"],
		appliesFromStage: "2_casp_zag",
		legalBasis: "ZAG-MaRisk AT 4.4.1 · MaRisk AT 4.4.1",
		deputyRequired: true,
	},
	{
		function: "internal_audit",
		title: "Interne Revision",
		frameworks: ["zag-marisk", "micar", "kwg", "iso27001"],
		appliesFromStage: "2_casp_zag",
		legalBasis: "ZAG-MaRisk AT 4.4.3 / BT 2 · MiCAR Art. 68 · ISO 27001 9.2",
		hint: "Darf keine operativen Aufgaben wahrnehmen; kann ausgelagert sein (externe Person eintragen).",
	},
	{
		function: "aml_officer",
		title: "Geldwäschebeauftragte:r (GWB)",
		frameworks: ["gwg", "amlr"],
		appliesFromStage: "1_agent",
		legalBasis: "§ 7 GwG · AMLR Art. 11",
		deputyRequired: true,
		fitProper: true,
		hint: "Auf Führungsebene, mit Stellvertretung; Bestellung der BaFin anzeigen.",
	},
	{
		function: "compliance_manager",
		title: "Verantwortliches Leitungsmitglied für Geldwäscheprävention",
		frameworks: ["gwg", "amlr"],
		appliesFromStage: "1_agent",
		legalBasis: "§ 4 Abs. 3 GwG · AMLR Art. 9",
	},
	{
		function: "dpo",
		title: "Datenschutzbeauftragte:r",
		frameworks: ["dsgvo", "gwg", "micar", "zag"],
		legalBasis: "DSGVO Art. 37 · § 38 BDSG",
		hint: "Pflicht bei umfangreicher Verarbeitung (Transaktionsmonitoring, KYC); darf nicht die Leitung sein.",
	},
];

const STAGE_INDEX: Record<LicenceStage, number> = {
	"0_vorbereitung": 0,
	"1_agent": 1,
	"2_casp_zag": 2,
	"3_emi": 3,
	"4_bank": 4,
};

export function stageAtLeast(stage: LicenceStage, min?: LicenceStage): boolean {
	return !min || STAGE_INDEX[stage] >= STAGE_INDEX[min];
}

// Welche Funktionen diese Org besetzen muss (Rahmenwerke + Stufe).
export function requiredFunctions(
	frameworks: readonly string[],
	stage: LicenceStage,
): RequiredFunction[] {
	const set = new Set(frameworks);
	return REQUIRED_FUNCTIONS.filter(
		(f) =>
			f.frameworks.some((slug) => set.has(slug)) &&
			stageAtLeast(stage, f.appliesFromStage),
	);
}

export type FunctionAssignment = {
	function: RoleFunction;
	userId: string | null;
	externalName: string | null;
	deputyUserId: string | null;
	evidenceId: string | null;
	documentsValidUntil?: string | Date | null;
};

export type FunctionCoverage = {
	required: RequiredFunction;
	filled: boolean;
	holder: string | null; // userId oder externer Name
	hasDeputy: boolean;
	deputyMissing: boolean; // gefordert, aber nicht gesetzt
	hasEvidence: boolean;
	documentsExpired: boolean;
};

// Abgleich Pflichtfunktionen × Besetzung → Gaps.
export function roleCoverage(
	required: readonly RequiredFunction[],
	assignments: readonly FunctionAssignment[],
	now = new Date(),
): { items: FunctionCoverage[]; gaps: FunctionCoverage[] } {
	const items = required.map((req) => {
		const a = assignments.find((x) => x.function === req.function);
		const filled = Boolean(a && (a.userId || a.externalName));
		const hasDeputy = Boolean(a?.deputyUserId);
		const until = a?.documentsValidUntil
			? new Date(a.documentsValidUntil)
			: null;
		return {
			required: req,
			filled,
			holder: a?.userId ?? a?.externalName ?? null,
			hasDeputy,
			deputyMissing: Boolean(req.deputyRequired) && filled && !hasDeputy,
			hasEvidence: Boolean(a?.evidenceId),
			documentsExpired: Boolean(until && until.getTime() < now.getTime()),
		};
	});
	return { items, gaps: items.filter((i) => !i.filled) };
}
