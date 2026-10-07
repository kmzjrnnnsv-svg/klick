import type { CaspService, LicenceStage } from "@/db/schema/enums";
import { deriveApplicabilityMap, type OrgProfile } from "./applicability";
import { ALL_REQUIREMENTS, CONTROLS, EDGES } from "./catalog";
import type { Edge, ReqRef } from "./coverage";
import type { ControlRef, SynergyCatalog } from "./synergy";

// Adapter: der statische Katalog in den Eingabeformen der reinen Funktionen.
// Die DB hält dieselben Daten (geseedet), aber Vorschau und Was-wäre-wenn
// brauchen keine Datenbank.

export const CATALOG_REQ_REFS: ReqRef[] = ALL_REQUIREMENTS.map((r) => ({
	framework: r.framework,
	code: r.code,
	domain: r.domain,
	sectionCode: r.sectionCode,
	legalStatus: r.legalStatus ?? "in_force",
}));

export const CATALOG_EDGES: Edge[] = EDGES.map((e) => ({
	control: e.control,
	requirement: e.requirement,
	coverage: e.coverage,
}));

export const CATALOG_CONTROL_REFS: ControlRef[] = CONTROLS.map((c) => ({
	code: c.code,
	effort: c.effort,
}));

export type ProfileInput = {
	sector: OrgProfile["sector"];
	licenceStage: LicenceStage;
	caspServices: readonly CaspService[];
	frameworks: readonly string[];
	tlptDesignated?: boolean;
	issuesTokens?: OrgProfile["issuesTokens"];
	asOf?: Date;
};

export function toProfile(input: ProfileInput): OrgProfile {
	return {
		sector: input.sector,
		licenceStage: input.licenceStage,
		caspServices: input.caspServices,
		selectedFrameworks: input.frameworks,
		tlptDesignated: input.tlptDesignated,
		issuesTokens: input.issuesTokens,
		asOf: input.asOf,
	};
}

// Anwendbarkeit (true/false) je framework:code für ein Org-Profil — aus dem
// statischen Katalog abgeleitet; manuelle Entscheidungen kommen aus der DB
// und werden vom Aufrufer darübergelegt.
export function profileApplicability(
	input: ProfileInput,
): Map<string, boolean> {
	const profile = toProfile(input);
	const decisions = deriveApplicabilityMap(ALL_REQUIREMENTS, profile);
	const out = new Map<string, boolean>();
	for (const [key, d] of decisions) out.set(key, d.applicable);
	return out;
}

export function synergyCatalogFor(input: ProfileInput): SynergyCatalog {
	return {
		requirements: CATALOG_REQ_REFS,
		edges: CATALOG_EDGES,
		controls: CATALOG_CONTROL_REFS,
		applicability: profileApplicability(input),
	};
}
