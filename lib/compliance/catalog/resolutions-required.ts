import type { LicenceStage } from "@/db/schema/enums";
import { stageAtLeast } from "./required-functions";

// Pflichtbeschlüsse der Leitung je Rahmenwerk/Stufe. Fehlender oder
// veralteter Beschluss = Gap in /beschluesse, /organisation und /ueberblick.
// Quellen: DORA Art. 5(2), ISO 27001 4.3/5.2/6.1.2/9.3, NIS2 Art. 20(1),
// ZAG-MaRisk AT 4.1/4.2, MiCAR Art. 68/71/72, GwG § 5/§ 7. Kein Rechtsrat.

export type RequiredResolution = {
	code: string;
	title: string;
	frameworks: readonly string[];
	appliesFromStage?: LicenceStage;
	legalBasis: string;
	// once = einmal (bis Änderung), annual = jährlich zu erneuern
	frequency: "once" | "annual";
	// welche Entität typischerweise verknüpft wird
	linkedKind?: "document" | "scope" | "risk" | "provider" | "organization";
	hint?: string;
};

export const REQUIRED_RESOLUTIONS: readonly RequiredResolution[] = [
	{
		code: "RES-ISMS-SCOPE",
		title: "Geltungsbereich des ISMS festlegen",
		frameworks: ["iso27001"],
		legalBasis: "ISO 27001 4.3",
		frequency: "once",
		linkedKind: "scope",
	},
	{
		code: "RES-ISMS-POLICY",
		title: "Informationssicherheitsleitlinie verabschieden",
		frameworks: ["iso27001", "nis2", "zag-marisk"],
		legalBasis: "ISO 27001 5.2 · NIS2 Art. 21(2)(a) · ZAG-MaRisk AT 7.2",
		frequency: "annual",
		linkedKind: "document",
		hint: "Jährliche Bestätigung oder Neufassung durch die Leitung.",
	},
	{
		code: "RES-RISK-APPETITE",
		title: "Risikoappetit und Akzeptanzkriterien beschließen",
		frameworks: ["iso27001", "dora", "zag-marisk", "micar"],
		legalBasis: "ISO 27001 6.1.2 · DORA Art. 6(8)(b) · ZAG-MaRisk AT 4.2",
		frequency: "annual",
		linkedKind: "organization",
	},
	{
		code: "RES-DORA-FRAMEWORK",
		title: "IKT-Risikomanagementrahmen genehmigen",
		frameworks: ["dora"],
		legalBasis: "DORA Art. 5(2)(a), Art. 6(5)",
		frequency: "annual",
		linkedKind: "document",
	},
	{
		code: "RES-DORA-STRATEGY",
		title: "Strategie für digitale operationale Resilienz beschließen",
		frameworks: ["dora"],
		legalBasis: "DORA Art. 6(8)",
		frequency: "annual",
		linkedKind: "document",
	},
	{
		code: "RES-DORA-BUDGET",
		title: "IKT-Budget und Ressourcen genehmigen",
		frameworks: ["dora", "iso27001"],
		legalBasis: "DORA Art. 5(2)(g) · ISO 27001 7.1",
		frequency: "annual",
		linkedKind: "organization",
	},
	{
		code: "RES-DORA-TPR",
		title: "Drittparteien-Richtlinie und wesentliche Vereinbarungen genehmigen",
		frameworks: ["dora", "zag-marisk", "micar"],
		legalBasis:
			"DORA Art. 5(2)(h), Art. 28(2) · ZAG-MaRisk AT 9 · MiCAR Art. 73",
		frequency: "annual",
		linkedKind: "document",
	},
	{
		code: "RES-DORA-BCP",
		title: "Geschäftsfortführungsleitlinie und Notfallpläne genehmigen",
		frameworks: ["dora", "zag-marisk"],
		legalBasis: "DORA Art. 5(2)(e), Art. 11 · ZAG-MaRisk AT 7.3",
		frequency: "annual",
		linkedKind: "document",
	},
	{
		code: "RES-NIS2-MEASURES",
		title: "Risikomanagementmaßnahmen billigen und Umsetzung überwachen",
		frameworks: ["nis2"],
		legalBasis: "NIS2 Art. 20(1) · § 38 BSIG",
		frequency: "annual",
		linkedKind: "organization",
	},
	{
		code: "RES-MGMT-REVIEW",
		title: "Managementbewertung abnehmen und Maßnahmen beschließen",
		frameworks: ["iso27001", "dora", "nis2"],
		legalBasis: "ISO 27001 9.3 · DORA Art. 6(5)",
		frequency: "annual",
		linkedKind: "organization",
	},
	{
		code: "RES-GWG-RISK",
		title: "Risikoanalyse nach § 5 GwG genehmigen",
		frameworks: ["gwg", "amlr"],
		appliesFromStage: "1_agent",
		legalBasis: "§ 5 Abs. 2 GwG · AMLR Art. 10",
		frequency: "annual",
		linkedKind: "document",
	},
	{
		code: "RES-GWG-AMLO",
		title: "Geldwäschebeauftragte:n und Stellvertretung bestellen",
		frameworks: ["gwg", "amlr"],
		appliesFromStage: "1_agent",
		legalBasis: "§ 7 Abs. 1 GwG",
		frequency: "once",
		linkedKind: "organization",
	},
	{
		code: "RES-ZAG-STRATEGY",
		title: "Geschäfts- und Risikostrategie beschließen",
		frameworks: ["zag-marisk", "kwg"],
		appliesFromStage: "2_casp_zag",
		legalBasis: "ZAG-MaRisk AT 4.2 · MaRisk AT 4.2",
		frequency: "annual",
		linkedKind: "document",
	},
	{
		code: "RES-ZAG-RTF",
		title: "Risikotragfähigkeitskonzept und Kapitalplanung genehmigen",
		frameworks: ["zag-marisk", "kwg"],
		appliesFromStage: "2_casp_zag",
		legalBasis: "ZAG-MaRisk AT 4.1 · MaRisk AT 4.1",
		frequency: "annual",
		linkedKind: "organization",
	},
	{
		code: "RES-MICAR-GOV",
		title: "Governance-Regelungen und Richtlinien nach MiCAR verabschieden",
		frameworks: ["micar"],
		appliesFromStage: "2_casp_zag",
		legalBasis: "MiCAR Art. 68(1)–(3)",
		frequency: "annual",
		linkedKind: "document",
	},
	{
		code: "RES-MICAR-COI",
		title: "Grundsätze zu Interessenkonflikten beschließen",
		frameworks: ["micar"],
		appliesFromStage: "2_casp_zag",
		legalBasis: "MiCAR Art. 72",
		frequency: "annual",
		linkedKind: "document",
	},
	{
		code: "RES-MICAR-COMPLAINTS",
		title: "Beschwerdeverfahren genehmigen",
		frameworks: ["micar", "zag"],
		appliesFromStage: "2_casp_zag",
		legalBasis: "MiCAR Art. 71 · ZAG § 62",
		frequency: "once",
		linkedKind: "document",
	},
];

export function requiredResolutions(
	frameworks: readonly string[],
	stage: LicenceStage,
): RequiredResolution[] {
	const set = new Set(frameworks);
	return REQUIRED_RESOLUTIONS.filter(
		(r) =>
			r.frameworks.some((slug) => set.has(slug)) &&
			stageAtLeast(stage, r.appliesFromStage),
	);
}

export type ResolutionCoverageItem = {
	required: RequiredResolution;
	satisfied: boolean;
	lastAt: Date | null;
	// jährlich fällig und letzter Beschluss älter als 12 Monate
	stale: boolean;
	resolutionNumber: string | null;
};

export function resolutionCoverage(
	required: readonly RequiredResolution[],
	resolutions: readonly {
		requiredCode: string | null;
		date: string | Date;
		resolutionNumber: string;
	}[],
	now = new Date(),
): { items: ResolutionCoverageItem[]; gaps: ResolutionCoverageItem[] } {
	const yearAgo = new Date(now);
	yearAgo.setFullYear(yearAgo.getFullYear() - 1);
	const items = required.map((req) => {
		const matching = resolutions
			.filter((r) => r.requiredCode === req.code)
			.map((r) => ({ ...r, d: new Date(r.date) }))
			.sort((a, b) => b.d.getTime() - a.d.getTime());
		const last = matching[0] ?? null;
		const stale = Boolean(
			last &&
				req.frequency === "annual" &&
				last.d.getTime() < yearAgo.getTime(),
		);
		return {
			required: req,
			satisfied: Boolean(last) && !stale,
			lastAt: last?.d ?? null,
			stale,
			resolutionNumber: last?.resolutionNumber ?? null,
		};
	});
	return { items, gaps: items.filter((i) => !i.satisfied) };
}

// Beschlussnummer: B-<Jahr>-<lfd>, fortlaufend je Org.
export function nextResolutionNumber(
	existing: readonly string[],
	now = new Date(),
): string {
	const year = now.getFullYear();
	const prefix = `B-${year}-`;
	const max = existing
		.filter((n) => n.startsWith(prefix))
		.map((n) => Number.parseInt(n.slice(prefix.length), 10))
		.filter((n) => Number.isFinite(n))
		.reduce((m, n) => Math.max(m, n), 0);
	return `${prefix}${String(max + 1).padStart(3, "0")}`;
}
