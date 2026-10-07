import type { Domain, ImplStatus, LegalStatus } from "@/db/schema/enums";

// Abgeleitete Abdeckung — zentrale, reine Ableitung, nie gespeichert.
//
// Für jede Anforderung der gewählten Rahmenwerke: anwendbar? → beste Kante
// aus control_requirements × Status des Controls:
//   full + implemented      → covered
//   partial + implemented   → partial
//   * + in_progress         → partial
//   sonst                   → open
// Daraus: Abdeckung je Rahmenwerk/Section/Domäne, Heatmap, Hebel je Control.
//   coveragePct = covered / applicable           (Headline)
//   progressPct = (covered + 0.5·partial) / applicable

export type ReqRef = {
	framework: string;
	code: string;
	domain: Domain;
	sectionCode?: string;
	legalStatus?: LegalStatus | null;
};

export type Edge = {
	control: string;
	requirement: string; // framework:code
	coverage: "full" | "partial";
};

export type ReqCoverage = "covered" | "partial" | "open" | "not_applicable";

export type CoverageBucket = {
	total: number;
	applicable: number;
	covered: number;
	partial: number;
	open: number;
	coveragePct: number | null;
	progressPct: number | null;
};

export type ControlLeverage = {
	control: string;
	requirements: number; // anwendbare Anforderungen mit Kante
	frameworks: number; // verschiedene Rahmenwerke darunter
	score: number; // full = 1, partial = 0.5, summiert
	satisfies: string[]; // Anforderungs-Keys
};

export type CoverageInput = {
	frameworks: readonly string[];
	requirements: readonly ReqRef[];
	// key framework:code → anwendbar; fehlt = anwendbar
	applicability?: ReadonlyMap<string, boolean> | Record<string, boolean>;
	edges: readonly Edge[];
	// Control-Code → Status; fehlt = not_started
	implStatus?: ReadonlyMap<string, ImplStatus> | Record<string, ImplStatus>;
};

export type CoverageResult = {
	byRequirement: Map<string, ReqCoverage>;
	byFramework: Map<string, CoverageBucket>;
	bySection: Map<string, Map<string, CoverageBucket>>;
	byDomain: Map<string, Map<Domain, CoverageBucket>>;
	leverage: Map<string, ControlLeverage>;
	total: CoverageBucket;
};

const RANK: Record<ReqCoverage, number> = {
	not_applicable: -1,
	open: 0,
	partial: 1,
	covered: 2,
};

function get<V>(
	source: ReadonlyMap<string, V> | Record<string, V> | undefined,
	key: string,
): V | undefined {
	if (!source) return undefined;
	if (source instanceof Map) return source.get(key);
	return (source as Record<string, V>)[key];
}

export function emptyBucket(): CoverageBucket {
	return {
		total: 0,
		applicable: 0,
		covered: 0,
		partial: 0,
		open: 0,
		coveragePct: null,
		progressPct: null,
	};
}

function add(bucket: CoverageBucket, status: ReqCoverage): void {
	bucket.total += 1;
	if (status === "not_applicable") return;
	bucket.applicable += 1;
	if (status === "covered") bucket.covered += 1;
	else if (status === "partial") bucket.partial += 1;
	else bucket.open += 1;
}

export function finalize(bucket: CoverageBucket): CoverageBucket {
	if (bucket.applicable === 0) {
		bucket.coveragePct = null;
		bucket.progressPct = null;
		return bucket;
	}
	bucket.coveragePct = round1((bucket.covered / bucket.applicable) * 100);
	bucket.progressPct = round1(
		((bucket.covered + 0.5 * bucket.partial) / bucket.applicable) * 100,
	);
	return bucket;
}

function round1(n: number): number {
	return Math.round(n * 10) / 10;
}

export function edgeStatus(
	coverage: "full" | "partial",
	status: ImplStatus,
): ReqCoverage | null {
	if (status === "not_applicable") return null;
	if (status === "implemented")
		return coverage === "full" ? "covered" : "partial";
	if (status === "in_progress") return "partial";
	return "open";
}

export function deriveCoverage(input: CoverageInput): CoverageResult {
	const selected = new Set(input.frameworks);
	const edgesByReq = new Map<string, Edge[]>();
	for (const e of input.edges) {
		const list = edgesByReq.get(e.requirement);
		if (list) list.push(e);
		else edgesByReq.set(e.requirement, [e]);
	}

	const byRequirement = new Map<string, ReqCoverage>();
	const byFramework = new Map<string, CoverageBucket>();
	const bySection = new Map<string, Map<string, CoverageBucket>>();
	const byDomain = new Map<string, Map<Domain, CoverageBucket>>();
	const leverage = new Map<string, ControlLeverage>();
	const total = emptyBucket();

	for (const fw of input.frameworks) {
		byFramework.set(fw, emptyBucket());
		bySection.set(fw, new Map());
		byDomain.set(fw, new Map());
	}

	for (const req of input.requirements) {
		if (!selected.has(req.framework)) continue;
		const key = `${req.framework}:${req.code}`;
		const applicable =
			req.legalStatus !== "repealed" && get(input.applicability, key) !== false;

		let status: ReqCoverage = "not_applicable";
		if (applicable) {
			status = "open";
			for (const e of edgesByReq.get(key) ?? []) {
				const implStatus = get(input.implStatus, e.control) ?? "not_started";
				const s = edgeStatus(e.coverage, implStatus);
				if (s && RANK[s] > RANK[status]) status = s;
				if (s) {
					const lev = leverage.get(e.control) ?? {
						control: e.control,
						requirements: 0,
						frameworks: 0,
						score: 0,
						satisfies: [],
					};
					lev.requirements += 1;
					lev.score += e.coverage === "full" ? 1 : 0.5;
					lev.satisfies.push(key);
					leverage.set(e.control, lev);
				}
			}
		}
		byRequirement.set(key, status);

		const fwBucket = byFramework.get(req.framework) ?? emptyBucket();
		add(fwBucket, status);
		byFramework.set(req.framework, fwBucket);
		add(total, status);

		const sectionCode = req.sectionCode ?? "_";
		const sections = bySection.get(req.framework) ?? new Map();
		const sBucket = sections.get(sectionCode) ?? emptyBucket();
		add(sBucket, status);
		sections.set(sectionCode, sBucket);
		bySection.set(req.framework, sections);

		const domains =
			byDomain.get(req.framework) ?? new Map<Domain, CoverageBucket>();
		const dBucket = domains.get(req.domain) ?? emptyBucket();
		add(dBucket, status);
		domains.set(req.domain, dBucket);
		byDomain.set(req.framework, domains);
	}

	for (const b of byFramework.values()) finalize(b);
	for (const sections of bySection.values())
		for (const b of sections.values()) finalize(b);
	for (const domains of byDomain.values())
		for (const b of domains.values()) finalize(b);
	finalize(total);

	for (const lev of leverage.values()) {
		lev.frameworks = new Set(
			lev.satisfies.map((k) => k.slice(0, k.indexOf(":"))),
		).size;
		lev.score = Math.round(lev.score * 10) / 10;
	}

	return { byRequirement, byFramework, bySection, byDomain, leverage, total };
}

// Hebel-Ranking: zuerst Anzahl erfüllter Anforderungen × Rahmenwerke, dann Score.
export function rankByLeverage(
	leverage: ReadonlyMap<string, ControlLeverage>,
): ControlLeverage[] {
	return [...leverage.values()].sort(
		(a, b) =>
			b.score * b.frameworks - a.score * a.frameworks ||
			b.requirements - a.requirements ||
			a.control.localeCompare(b.control),
	);
}

// Was ändert sich, wenn ein Control auf einen Status wechselt? Liefert die
// betroffenen Anforderungen (für den Toast „Erfüllt damit …") und die
// Abdeckungsdifferenz je Rahmenwerk.
export function coverageDelta(
	input: CoverageInput,
	control: string,
	newStatus: ImplStatus,
): {
	affected: { key: string; before: ReqCoverage; after: ReqCoverage }[];
	frameworks: {
		framework: string;
		before: number | null;
		after: number | null;
	}[];
} {
	const before = deriveCoverage(input);
	const impl = new Map<string, ImplStatus>();
	if (input.implStatus instanceof Map) {
		for (const [k, v] of input.implStatus) impl.set(k, v);
	} else if (input.implStatus) {
		for (const [k, v] of Object.entries(input.implStatus)) impl.set(k, v);
	}
	impl.set(control, newStatus);
	const after = deriveCoverage({ ...input, implStatus: impl });
	const affected: { key: string; before: ReqCoverage; after: ReqCoverage }[] =
		[];
	for (const [key, b] of before.byRequirement) {
		const a = after.byRequirement.get(key) ?? b;
		if (a !== b) affected.push({ key, before: b, after: a });
	}
	const frameworks = input.frameworks.map((fw) => ({
		framework: fw,
		before: before.byFramework.get(fw)?.coveragePct ?? null,
		after: after.byFramework.get(fw)?.coveragePct ?? null,
	}));
	return { affected, frameworks };
}
