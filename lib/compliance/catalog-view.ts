import type { CaspService, LicenceStage } from "@/db/schema/enums";
import {
	type ApplicabilityDecision,
	deriveApplicabilityMap,
	inWorkQueue,
	type OrgProfile,
} from "./applicability";
import { ALL_REQUIREMENTS, CONTROLS, EDGES } from "./catalog";
import { FRAMEWORKS } from "./catalog/frameworks";
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
	productRoles?: OrgProfile["productRoles"];
	frameworkVariants?: OrgProfile["frameworkVariants"];
	asOf?: Date;
};

// Gewählte Varianten je Rahmenwerk, ergänzt um die erste Variante als
// Standard (BSI 200-2: Standard-Absicherung, PCI DSS: SAQ D)
export function resolveFrameworkVariants(
	chosen: OrgProfile["frameworkVariants"],
): Record<string, string> {
	const out: Record<string, string> = {};
	for (const f of FRAMEWORKS) {
		if (!f.variants || f.variants.length === 0) continue;
		const pick = chosen?.[f.slug];
		out[f.slug] =
			pick && f.variants.some((v) => v.key === pick)
				? pick
				: (f.variants[0]?.key ?? "");
	}
	return out;
}

export function toProfile(input: ProfileInput): OrgProfile {
	return {
		sector: input.sector,
		licenceStage: input.licenceStage,
		caspServices: input.caspServices,
		selectedFrameworks: input.frameworks,
		tlptDesignated: input.tlptDesignated,
		issuesTokens: input.issuesTokens,
		productRoles: input.productRoles,
		frameworkVariants: resolveFrameworkVariants(input.frameworkVariants),
		asOf: input.asOf,
	};
}

// Anwendbarkeit (true/false) je framework:code für ein Org-Profil — aus dem
// statischen Katalog abgeleitet; manuelle Entscheidungen kommen aus der DB
// und werden vom Aufrufer darübergelegt.
export function profileApplicability(
	input: ProfileInput,
): Map<string, boolean> {
	const out = new Map<string, boolean>();
	for (const [key, d] of profileApplicabilityDetail(input))
		out.set(key, d.applicable);
	return out;
}

// Wie profileApplicability, aber mit Quelle und Begründung je Anforderung.
export function profileApplicabilityDetail(
	input: ProfileInput,
): Map<string, ApplicabilityDecision> {
	return deriveApplicabilityMap(ALL_REQUIREMENTS, toProfile(input));
}

export function synergyCatalogFor(input: ProfileInput): SynergyCatalog {
	return {
		requirements: CATALOG_REQ_REFS,
		edges: CATALOG_EDGES,
		controls: CATALOG_CONTROL_REFS,
		applicability: profileApplicability(input),
	};
}

// Controls, die die aktiven Rahmenwerke fordern (heute oder ab Stichtag,
// manuelle Entscheidungen darübergelegt). Alles andere in
// control_implementations ist „nicht mehr gefordert“ — etwa nach dem
// Entfernen eines Rahmenwerks.
export function requiredControlCodes(
	input: ProfileInput,
	manual: ReadonlyMap<string, boolean>,
	// Katalog der Org (R4): Anforderungen und Kanten eigener Rahmenwerke
	catalog?: {
		requirements: readonly (typeof ALL_REQUIREMENTS)[number][];
		edges: readonly { control: string; requirement: string }[];
	},
): Set<string> {
	const profile = toProfile(input);
	const selected = new Set(input.frameworks);
	const keys = new Set<string>();
	for (const r of catalog?.requirements ?? ALL_REQUIREMENTS) {
		if (!selected.has(r.framework)) continue;
		const key = `${r.framework}:${r.code}`;
		const m = manual.get(key);
		if (m === true || (m === undefined && inWorkQueue(r, profile)))
			keys.add(key);
	}
	const out = new Set<string>();
	for (const e of catalog?.edges ?? EDGES)
		if (keys.has(e.requirement)) out.add(e.control);
	return out;
}
