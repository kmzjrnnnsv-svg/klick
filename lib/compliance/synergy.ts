import type { ImplStatus } from "@/db/schema/enums";
import {
	type CoverageInput,
	deriveCoverage,
	type Edge,
	edgeStatus,
	type ReqRef,
} from "./coverage";

// Synergie-Rechnung: Rahmenwerke wählen → gemeinsame Controls, Überlappung,
// Aufwand; Was-wäre-wenn für ein weiteres Rahmenwerk; priorisierter Plan
// (greedy nach Hebel/Aufwand). Alles pure, getestet mit Mini-Katalog.

export type ControlRef = { code: string; effort: "S" | "M" | "L" };

export type SynergyCatalog = {
	requirements: readonly ReqRef[];
	edges: readonly Edge[];
	controls: readonly ControlRef[];
	// key framework:code → anwendbar; fehlt = anwendbar
	applicability?: ReadonlyMap<string, boolean>;
};

export type SynergyResult = {
	frameworks: string[];
	requirementCount: number;
	controlCount: number;
	multiFrameworkControls: number;
	overlapPct: number | null;
	effortBuckets: { S: number; M: number; L: number };
	perFramework: Record<
		string,
		{
			requirements: number;
			controls: number;
			exclusiveControls: number;
			sharedControls: number;
		}
	>;
};

const EFFORT_WEIGHT: Record<"S" | "M" | "L", number> = { S: 1, M: 3, L: 8 };

function applicableRequirements(
	catalog: SynergyCatalog,
	frameworks: readonly string[],
): ReqRef[] {
	const set = new Set(frameworks);
	return catalog.requirements.filter(
		(r) =>
			set.has(r.framework) &&
			r.legalStatus !== "repealed" &&
			catalog.applicability?.get(`${r.framework}:${r.code}`) !== false,
	);
}

// Control → Menge der Rahmenwerke, für die es (anwendbare) Anforderungen erfüllt.
function controlFrameworkMap(
	catalog: SynergyCatalog,
	frameworks: readonly string[],
): Map<string, Set<string>> {
	const reqKeys = new Set(
		applicableRequirements(catalog, frameworks).map(
			(r) => `${r.framework}:${r.code}`,
		),
	);
	const map = new Map<string, Set<string>>();
	for (const e of catalog.edges) {
		if (!reqKeys.has(e.requirement)) continue;
		const fw = e.requirement.slice(0, e.requirement.indexOf(":"));
		const set = map.get(e.control) ?? new Set<string>();
		set.add(fw);
		map.set(e.control, set);
	}
	return map;
}

export function computeSynergy(
	frameworks: readonly string[],
	catalog: SynergyCatalog,
): SynergyResult {
	const reqs = applicableRequirements(catalog, frameworks);
	const cfm = controlFrameworkMap(catalog, frameworks);
	const effortOf = new Map(catalog.controls.map((c) => [c.code, c.effort]));

	const effortBuckets = { S: 0, M: 0, L: 0 };
	let multi = 0;
	for (const [code, fws] of cfm) {
		const effort = effortOf.get(code) ?? "M";
		effortBuckets[effort] += 1;
		if (fws.size >= 2) multi += 1;
	}

	const perFramework: SynergyResult["perFramework"] = {};
	for (const fw of frameworks) {
		const controls = [...cfm.entries()].filter(([, fws]) => fws.has(fw));
		perFramework[fw] = {
			requirements: reqs.filter((r) => r.framework === fw).length,
			controls: controls.length,
			exclusiveControls: controls.filter(([, fws]) => fws.size === 1).length,
			sharedControls: controls.filter(([, fws]) => fws.size > 1).length,
		};
	}

	return {
		frameworks: [...frameworks],
		requirementCount: reqs.length,
		controlCount: cfm.size,
		multiFrameworkControls: multi,
		overlapPct:
			frameworks.length > 1 && cfm.size > 0
				? Math.round((multi / cfm.size) * 1000) / 10
				: null,
		effortBuckets,
		perFramework,
	};
}

export type WhatIfResult = {
	candidate: string;
	candidateRequirements: number;
	newControls: string[];
	alreadyNeededControls: number;
	// Anteil der Kandidaten-Anforderungen, die durch umgesetzte/laufende
	// Controls bereits abgedeckt (covered) bzw. angefangen (partial) sind.
	alreadyCoveredPct: number | null;
	alreadyPartialPct: number | null;
};

export function whatIfAddFramework(
	current: readonly string[],
	candidate: string,
	catalog: SynergyCatalog,
	implStatus?: ReadonlyMap<string, ImplStatus>,
): WhatIfResult {
	const currentControls = new Set(controlFrameworkMap(catalog, current).keys());
	const candidateControls = controlFrameworkMap(catalog, [candidate]);
	const newControls = [...candidateControls.keys()]
		.filter((c) => !currentControls.has(c))
		.sort();

	const cov = deriveCoverage({
		frameworks: [candidate],
		requirements: catalog.requirements,
		applicability: catalog.applicability,
		edges: catalog.edges,
		implStatus,
	});
	const bucket = cov.byFramework.get(candidate);
	return {
		candidate,
		candidateRequirements: bucket?.applicable ?? 0,
		newControls,
		alreadyNeededControls: candidateControls.size - newControls.length,
		alreadyCoveredPct: bucket?.coveragePct ?? null,
		alreadyPartialPct:
			bucket && bucket.applicable > 0
				? Math.round((bucket.partial / bucket.applicable) * 1000) / 10
				: null,
	};
}

export type PlanStep = {
	control: string;
	effort: "S" | "M" | "L";
	// neu erfüllte (full) bzw. teilweise erfüllte Anforderungen
	gainCovered: number;
	gainPartial: number;
	frameworks: string[];
	cumulativeCoveragePct: number;
	cumulativeProgressPct: number;
};

export type PrioritizedPlan = {
	baselineCoveragePct: number | null;
	baselineProgressPct: number | null;
	applicable: number;
	steps: PlanStep[];
};

// Greedy: in jedem Schritt das Control mit dem besten Verhältnis aus neu
// gewonnener Abdeckung (covered = 1, partial = 0.5) zu Aufwandsgewicht
// (S 1, M 3, L 8). Liefert die kumulierte Abdeckungskurve.
export function prioritizePlan(
	frameworks: readonly string[],
	catalog: SynergyCatalog,
	implStatus?: ReadonlyMap<string, ImplStatus>,
	limit = 30,
): PrioritizedPlan {
	const effortOf = new Map(catalog.controls.map((c) => [c.code, c.effort]));
	const impl = new Map<string, ImplStatus>(implStatus ?? []);
	const base: CoverageInput = {
		frameworks,
		requirements: catalog.requirements,
		applicability: catalog.applicability,
		edges: catalog.edges,
		implStatus: impl,
	};
	const start = deriveCoverage(base);
	const applicable = start.total.applicable;
	const steps: PlanStep[] = [];

	// Kandidaten: Controls mit Kante zu einer anwendbaren Anforderung der
	// gewählten Rahmenwerke, die noch nicht implemented/not_applicable sind.
	const candidates = new Set(
		[...start.leverage.keys()].filter((c) => {
			const s = impl.get(c) ?? "not_started";
			return s !== "implemented" && s !== "not_applicable";
		}),
	);

	let current = start;
	while (candidates.size > 0 && steps.length < limit) {
		let best: {
			control: string;
			gain: number;
			covered: number;
			partial: number;
		} | null = null;
		for (const control of candidates) {
			let covered = 0;
			let partial = 0;
			for (const e of catalog.edges) {
				if (e.control !== control) continue;
				const before = current.byRequirement.get(e.requirement);
				if (!before || before === "not_applicable" || before === "covered")
					continue;
				const after = edgeStatus(e.coverage, "implemented");
				if (after === "covered") covered += 1;
				else if (after === "partial" && before === "open") partial += 1;
			}
			const gain =
				(covered + 0.5 * partial) / EFFORT_WEIGHT[effortOf.get(control) ?? "M"];
			if (
				gain > 0 &&
				(!best ||
					gain > best.gain ||
					(gain === best.gain && control < best.control))
			) {
				best = { control, gain, covered, partial };
			}
		}
		if (!best) break;
		candidates.delete(best.control);
		impl.set(best.control, "implemented");
		current = deriveCoverage({ ...base, implStatus: impl });
		steps.push({
			control: best.control,
			effort: effortOf.get(best.control) ?? "M",
			gainCovered: best.covered,
			gainPartial: best.partial,
			frameworks: [
				...new Set(
					(start.leverage.get(best.control)?.satisfies ?? []).map((k) =>
						k.slice(0, k.indexOf(":")),
					),
				),
			].sort(),
			cumulativeCoveragePct: current.total.coveragePct ?? 0,
			cumulativeProgressPct: current.total.progressPct ?? 0,
		});
	}

	return {
		baselineCoveragePct: start.total.coveragePct,
		baselineProgressPct: start.total.progressPct,
		applicable,
		steps,
	};
}
