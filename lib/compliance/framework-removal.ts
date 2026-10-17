import type { ImplStatus, LicenceStage } from "@/db/schema/enums";
import { applicableObligations } from "./catalog/obligations";
import { applicableProcesses } from "./catalog/processes";
import { requiredFunctions } from "./catalog/required-functions";
import { requiredResolutions } from "./catalog/resolutions-required";
import type { Edge, ReqRef } from "./coverage";

// Was fällt weg, wenn eine Org ein Rahmenwerk entfernt? Reine Vorschau für
// den Bestätigungsdialog — entfernt wird nur der Status in org_frameworks
// ("retired"); Controls, Nachweise, Status und Historie bleiben erhalten und
// sind beim Wieder-Aktivieren sofort zurück.

export type FrameworkRemovalInput = {
	slug: string;
	activeSlugs: readonly string[];
	licenceStage: LicenceStage;
	tlptDesignated?: boolean;
	requirements: readonly ReqRef[];
	edges: readonly Edge[];
	applicability: ReadonlyMap<string, boolean>;
	implStatus: ReadonlyMap<string, ImplStatus>;
	// Laufende Audits (planned/in_progress), die das Rahmenwerk prüfen.
	openAudits: readonly { id: string; title: string; frameworkIds: string[] }[];
};

export type FrameworkRemovalImpact = {
	slug: string;
	// anwendbare Anforderungen, die aus Abdeckung/SoA/Gap herausfallen
	requirements: number;
	// Controls, die nur noch dieses Rahmenwerk fordert (bleiben erhalten,
	// gelten danach als „nicht mehr gefordert“)
	controlsOnlyHere: string[];
	implementedOnlyHere: number;
	controlsShared: number;
	obligations: { code: string; title: string }[];
	functions: { code: string; title: string }[];
	resolutions: { code: string; title: string }[];
	processes: { code: string; title: string }[];
	blockingAudits: { id: string; title: string }[];
	lastFramework: boolean;
	canRemove: boolean;
};

function dropped<T extends { code: string; title: string }>(
	before: readonly T[],
	after: readonly T[],
): { code: string; title: string }[] {
	const keep = new Set(after.map((x) => x.code));
	return before
		.filter((x) => !keep.has(x.code))
		.map((x) => ({ code: x.code, title: x.title }));
}

export function frameworkRemovalImpact(
	input: FrameworkRemovalInput,
): FrameworkRemovalImpact {
	const remaining = input.activeSlugs.filter((s) => s !== input.slug);
	const remainingSet = new Set(remaining);

	const applicable = (key: string) => input.applicability.get(key) !== false;
	const removedReqs = input.requirements.filter(
		(r) =>
			r.framework === input.slug &&
			r.legalStatus !== "repealed" &&
			applicable(`${r.framework}:${r.code}`),
	);
	const removedKeys = new Set(
		removedReqs.map((r) => `${r.framework}:${r.code}`),
	);
	const fwOf = (key: string) => key.slice(0, key.indexOf(":"));

	const here = new Set<string>();
	const elsewhere = new Set<string>();
	for (const e of input.edges) {
		if (removedKeys.has(e.requirement)) here.add(e.control);
		else if (remainingSet.has(fwOf(e.requirement)) && applicable(e.requirement))
			elsewhere.add(e.control);
	}
	const controlsOnlyHere = [...here].filter((c) => !elsewhere.has(c)).sort();
	const implementedOnlyHere = controlsOnlyHere.filter(
		(c) => input.implStatus.get(c) === "implemented",
	).length;

	const stage = input.licenceStage;
	const opts = { tlptDesignated: input.tlptDesignated };
	const functions = dropped(
		requiredFunctions(input.activeSlugs, stage).map((f) => ({
			code: f.function,
			title: f.title,
		})),
		requiredFunctions(remaining, stage).map((f) => ({
			code: f.function,
			title: f.title,
		})),
	);

	const blockingAudits = input.openAudits
		.filter((a) => a.frameworkIds.includes(input.slug))
		.map((a) => ({ id: a.id, title: a.title }));
	const lastFramework = remaining.length === 0;

	return {
		slug: input.slug,
		requirements: removedReqs.length,
		controlsOnlyHere,
		implementedOnlyHere,
		controlsShared: [...here].filter((c) => elsewhere.has(c)).length,
		obligations: dropped(
			applicableObligations(input.activeSlugs, stage, opts),
			applicableObligations(remaining, stage, opts),
		),
		functions,
		resolutions: dropped(
			requiredResolutions(input.activeSlugs, stage),
			requiredResolutions(remaining, stage),
		),
		processes: dropped(
			applicableProcesses(input.activeSlugs).map((p) => ({
				code: p.code,
				title: p.name,
			})),
			applicableProcesses(remaining).map((p) => ({
				code: p.code,
				title: p.name,
			})),
		),
		blockingAudits,
		lastFramework,
		canRemove: !lastFramework && blockingAudits.length === 0,
	};
}
