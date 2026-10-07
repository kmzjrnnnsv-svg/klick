import type {
	CaspService,
	LegalStatus,
	LicenceStage,
	OrgRoleLegal,
} from "@/db/schema/enums";

// Anwendbarkeit einer Anforderung für eine Organisation — reine Funktion.
// Quellen (in dieser Reihenfolge, die erste greift):
//   rule          Rechtsstand (repealed / noch nicht in Kraft / ausser Kraft),
//                 TLPT ohne Benennung
//   services      MiCAR-Dienst wird nicht erbracht
//   stage         Lizenzstufe zu niedrig oder Rolle passt nicht (ab Stufe 1)
//   lex_specialis DORA verdrängt NIS2 Art. 20/21/23 für Finanzunternehmen
// Manuelle Entscheidungen (source "manual") überschreiben alles — die trifft
// die Org in requirement_applicability, nicht diese Funktion.

export type ApplicabilitySource =
	| "rule"
	| "services"
	| "stage"
	| "lex_specialis"
	| "default";

export type ApplicabilityDecision = {
	applicable: boolean;
	source: ApplicabilitySource;
	note?: string;
};

export type RequirementForApplicability = {
	framework: string;
	code: string;
	services?: CaspService[] | null;
	appliesFromStage?: LicenceStage | null;
	appliesToRoles?: OrgRoleLegal[] | null;
	effectiveFrom?: string | null;
	effectiveUntil?: string | null;
	legalStatus?: LegalStatus | null;
};

export type OrgProfile = {
	sector: "casp" | "bank" | "payment" | "emi" | "other";
	licenceStage: LicenceStage;
	caspServices: readonly CaspService[];
	selectedFrameworks: readonly string[];
	tlptDesignated?: boolean;
	issuesTokens?: "none" | "art" | "emt" | "other";
	asOf?: Date;
};

export const STAGE_INDEX: Record<LicenceStage, number> = {
	"0_vorbereitung": 0,
	"1_agent": 1,
	"2_casp_zag": 2,
	"3_emi": 3,
	"4_bank": 4,
};

const FINANCIAL_SECTORS = new Set(["casp", "bank", "payment", "emi"]);

// NIS2-Pflichten, die § 28 Abs. 6 BSIG für DORA-Finanzunternehmen ausnimmt.
// Betroffenheitsprüfung (Art. 2–3, Art. 4), Registrierung (Art. 27, § 34)
// und Anlage 1 bleiben anwendbar.
const NIS2_DISPLACED_PREFIXES = ["Art.20", "Art.21", "Art.23"];

export function orgRolesFor(profile: OrgProfile): OrgRoleLegal[] {
	const stage = STAGE_INDEX[profile.licenceStage];
	const roles: OrgRoleLegal[] = ["any"];
	if (stage === 1) roles.push("agent", "aml_obliged", "ict_provider");
	if (stage >= 2) roles.push("financial_entity", "aml_obliged");
	if (profile.issuesTokens && profile.issuesTokens !== "none") {
		roles.push("issuer");
	}
	return roles;
}

export function deriveApplicability(
	req: RequirementForApplicability,
	profile: OrgProfile,
): ApplicabilityDecision {
	const asOf = profile.asOf ?? new Date();
	const stage = STAGE_INDEX[profile.licenceStage];

	// Rechtsstand
	if (req.legalStatus === "repealed") {
		return { applicable: false, source: "rule", note: "Aufgehoben" };
	}
	if (req.effectiveFrom && new Date(req.effectiveFrom) > asOf) {
		return {
			applicable: false,
			source: "rule",
			note: `Gilt ab ${req.effectiveFrom}`,
		};
	}
	if (req.effectiveUntil && new Date(req.effectiveUntil) < asOf) {
		return {
			applicable: false,
			source: "rule",
			note: `Ausser Kraft seit ${req.effectiveUntil}`,
		};
	}
	if (
		req.framework === "dora" &&
		req.code === "Art.26" &&
		!profile.tlptDesignated
	) {
		return {
			applicable: false,
			source: "rule",
			note: "Negativnachweis: nicht von der BaFin für TLPT benannt",
		};
	}

	// Dienste (MiCAR Art. 75–82 u. ä.)
	if (req.services && req.services.length > 0) {
		const offered = new Set(profile.caspServices);
		if (!req.services.some((s) => offered.has(s))) {
			return {
				applicable: false,
				source: "services",
				note: `Dienst nicht erbracht (${req.services.join(", ")})`,
			};
		}
	}

	// Lizenzstufe
	if (
		req.appliesFromStage &&
		STAGE_INDEX[req.appliesFromStage] > stage &&
		stage >= 1
	) {
		return {
			applicable: false,
			source: "stage",
			note: `Gilt ab Lizenzstufe ${req.appliesFromStage}`,
		};
	}
	// Rollen greifen erst ab Stufe 1 — in der Vorbereitung ist alles
	// Gewählte Arbeitsgegenstand.
	if (stage >= 1 && req.appliesToRoles && req.appliesToRoles.length > 0) {
		const roles = new Set(orgRolesFor(profile));
		if (!req.appliesToRoles.some((r) => roles.has(r))) {
			return {
				applicable: false,
				source: "stage",
				note: `Gilt für Rolle ${req.appliesToRoles.join("/")} (trägt der Lizenzpartner)`,
			};
		}
	}

	// Lex specialis
	if (
		req.framework === "nis2" &&
		FINANCIAL_SECTORS.has(profile.sector) &&
		profile.selectedFrameworks.includes("dora") &&
		NIS2_DISPLACED_PREFIXES.some((p) => req.code.startsWith(p))
	) {
		return {
			applicable: false,
			source: "lex_specialis",
			note: "DORA ist lex specialis (Art. 4 NIS2, § 28 Abs. 6 BSIG)",
		};
	}

	return { applicable: true, source: "default" };
}

export function deriveApplicabilityMap(
	requirements: readonly RequirementForApplicability[],
	profile: OrgProfile,
): Map<string, ApplicabilityDecision> {
	const out = new Map<string, ApplicabilityDecision>();
	for (const r of requirements) {
		out.set(`${r.framework}:${r.code}`, deriveApplicability(r, profile));
	}
	return out;
}
