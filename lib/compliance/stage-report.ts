import type { ImplStatus } from "@/db/schema/enums";
import {
	CATALOG_CONTROL_REFS,
	CATALOG_EDGES,
	CATALOG_REQ_REFS,
	type ProfileInput,
	profileApplicability,
} from "./catalog-view";
import { deriveCoverage, type Edge, type ReqRef } from "./coverage";
import type { ControlRef } from "./synergy";

// Synergie-Report bei Stufenwechsel oder Stichtag („Stufe 2: +180 anwendbare
// Anforderungen, 95 bereits durch umgesetzte Controls erfüllt, 31 neue
// Controls, davon 12 S / 14 M / 5 L"). Reine Ableitung aus zwei
// Anwendbarkeits-Karten; die Profil-Variante rechnet auf dem statischen Katalog.

export type ApplicabilityDeltaInput = {
	frameworks: readonly string[];
	requirements: readonly ReqRef[];
	edges: readonly Edge[];
	controls: readonly ControlRef[];
	before: ReadonlyMap<string, boolean>;
	after: ReadonlyMap<string, boolean>;
	implStatus?: ReadonlyMap<string, ImplStatus>;
};

export type StageReport = {
	applicableBefore: number;
	applicableAfter: number;
	newlyApplicable: string[]; // framework:code
	noLongerApplicable: string[];
	// davon durch umgesetzte Controls bereits erfüllt / teilweise
	alreadyCovered: number;
	alreadyPartial: number;
	newControls: string[];
	droppedControls: string[];
	effortBuckets: { S: number; M: number; L: number };
	coverageBeforePct: number | null;
	coverageAfterPct: number | null;
};

export function applicabilityDelta(
	input: ApplicabilityDeltaInput,
): StageReport {
	const fws = new Set(input.frameworks);
	const inScope = input.requirements.filter(
		(r) => fws.has(r.framework) && r.legalStatus !== "repealed",
	);
	const key = (r: ReqRef) => `${r.framework}:${r.code}`;
	const isOn = (map: ReadonlyMap<string, boolean>, r: ReqRef) =>
		map.get(key(r)) !== false;

	const before = new Set(inScope.filter((r) => isOn(input.before, r)).map(key));
	const after = new Set(inScope.filter((r) => isOn(input.after, r)).map(key));
	const newlyApplicable = [...after].filter((k) => !before.has(k)).sort();
	const noLongerApplicable = [...before].filter((k) => !after.has(k)).sort();

	const covAfter = deriveCoverage({
		frameworks: input.frameworks,
		requirements: input.requirements,
		applicability: input.after,
		edges: input.edges,
		implStatus: input.implStatus,
	});
	const covBefore = deriveCoverage({
		frameworks: input.frameworks,
		requirements: input.requirements,
		applicability: input.before,
		edges: input.edges,
		implStatus: input.implStatus,
	});

	let alreadyCovered = 0;
	let alreadyPartial = 0;
	for (const k of newlyApplicable) {
		const s = covAfter.byRequirement.get(k);
		if (s === "covered") alreadyCovered += 1;
		else if (s === "partial") alreadyPartial += 1;
	}

	const controlsFor = (keys: ReadonlySet<string>) => {
		const set = new Set<string>();
		for (const e of input.edges)
			if (keys.has(e.requirement)) set.add(e.control);
		return set;
	};
	const cBefore = controlsFor(before);
	const cAfter = controlsFor(after);
	const newControls = [...cAfter].filter((c) => !cBefore.has(c)).sort();
	const droppedControls = [...cBefore].filter((c) => !cAfter.has(c)).sort();

	const effortOf = new Map(input.controls.map((c) => [c.code, c.effort]));
	const effortBuckets = { S: 0, M: 0, L: 0 };
	for (const c of newControls) {
		const impl = input.implStatus?.get(c);
		if (impl === "implemented") continue; // schon umgesetzt — kein Aufwand
		effortBuckets[effortOf.get(c) ?? "M"] += 1;
	}

	return {
		applicableBefore: before.size,
		applicableAfter: after.size,
		newlyApplicable,
		noLongerApplicable,
		alreadyCovered,
		alreadyPartial,
		newControls,
		droppedControls,
		effortBuckets,
		coverageBeforePct: covBefore.total.coveragePct,
		coverageAfterPct: covAfter.total.coveragePct,
	};
}

// Profil-Variante: zwei Org-Profile (z. B. Stufe 1 → 2, oder heute → Stichtag)
// auf dem statischen Katalog; manuelle Entscheidungen legt der Aufrufer über
// `overrides` auf beide Seiten.
export function stageChangeReport(
	before: ProfileInput,
	after: ProfileInput,
	implStatus?: ReadonlyMap<string, ImplStatus>,
	overrides?: ReadonlyMap<string, boolean>,
): StageReport {
	const withOverrides = (m: Map<string, boolean>) => {
		if (overrides) for (const [k, v] of overrides) m.set(k, v);
		return m;
	};
	return applicabilityDelta({
		frameworks: after.frameworks,
		requirements: CATALOG_REQ_REFS,
		edges: CATALOG_EDGES,
		controls: CATALOG_CONTROL_REFS,
		before: withOverrides(profileApplicability(before)),
		after: withOverrides(profileApplicability(after)),
		implStatus,
	});
}
