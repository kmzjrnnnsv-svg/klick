import type { ImplStatus } from "@/db/schema/enums";
import type { Edge, ReqCoverage, ReqRef } from "./coverage";
import { edgeStatus } from "./coverage";

// Quervergleich zweier Rahmenwerke (Businessplan 17.2/17.6 generiert statt
// handgeschrieben): gemeinsame Controls, je Anforderung von A die Gegenstücke
// in B — „equivalent" (expliziter Querverweis oder gemeinsames Control mit
// voller Kante auf beiden Seiten), „partial" (gemeinsames Control, aber
// mindestens eine Seite nur teilweise) oder „unique" (kein gemeinsames
// Control). Anwendbarkeit (Stichtag, Stufe, Dienste) filtert vorher.

export type CompareCatalog = {
	requirements: readonly ReqRef[];
	edges: readonly Edge[];
	// key framework:code → anwendbar; fehlt = anwendbar
	applicability?: ReadonlyMap<string, boolean>;
	// key → explizite Querverweise (relatedRequirements)
	related?: ReadonlyMap<string, readonly string[]>;
};

export type CompareKind = "equivalent" | "partial" | "unique";

export type CompareRow = {
	key: string; // a:code
	code: string;
	kind: CompareKind;
	counterparts: { key: string; code: string; via: string[] }[];
	sharedControls: string[];
	status: ReqCoverage; // Abdeckung der A-Anforderung aus dem Org-Status
};

export type CompareResult = {
	a: string;
	b: string;
	rows: CompareRow[];
	// Anforderungen von B ohne Gegenstück in A
	uniqueB: { key: string; code: string }[];
	sharedControls: string[];
	onlyA: string[];
	onlyB: string[];
	counts: Record<CompareKind, number> & { uniqueB: number };
};

function applicable(catalog: CompareCatalog, r: ReqRef): boolean {
	return (
		r.legalStatus !== "repealed" &&
		catalog.applicability?.get(`${r.framework}:${r.code}`) !== false
	);
}

function controlsByRequirement(
	edges: readonly Edge[],
	keys: ReadonlySet<string>,
): Map<string, Map<string, Edge["coverage"]>> {
	const map = new Map<string, Map<string, Edge["coverage"]>>();
	for (const e of edges) {
		if (!keys.has(e.requirement)) continue;
		const m = map.get(e.requirement) ?? new Map<string, Edge["coverage"]>();
		// beste Kante je Control behalten
		const prev = m.get(e.control);
		if (!prev || (prev === "partial" && e.coverage === "full"))
			m.set(e.control, e.coverage);
		map.set(e.requirement, m);
	}
	return map;
}

export function compareFrameworks(
	a: string,
	b: string,
	catalog: CompareCatalog,
	implStatus?: ReadonlyMap<string, ImplStatus>,
): CompareResult {
	const reqA = catalog.requirements.filter(
		(r) => r.framework === a && applicable(catalog, r),
	);
	const reqB = catalog.requirements.filter(
		(r) => r.framework === b && applicable(catalog, r),
	);
	const keysA = new Set(reqA.map((r) => `${a}:${r.code}`));
	const keysB = new Set(reqB.map((r) => `${b}:${r.code}`));
	const ctrlA = controlsByRequirement(catalog.edges, keysA);
	const ctrlB = controlsByRequirement(catalog.edges, keysB);

	// Control → B-Anforderungen
	const bByControl = new Map<
		string,
		{ key: string; cov: Edge["coverage"] }[]
	>();
	for (const [key, m] of ctrlB) {
		for (const [control, cov] of m) {
			const list = bByControl.get(control) ?? [];
			list.push({ key, cov });
			bByControl.set(control, list);
		}
	}

	const allControlsA = new Set(
		[...ctrlA.values()].flatMap((m) => [...m.keys()]),
	);
	const allControlsB = new Set(
		[...ctrlB.values()].flatMap((m) => [...m.keys()]),
	);
	const sharedControls = [...allControlsA]
		.filter((c) => allControlsB.has(c))
		.sort();

	const matchedB = new Set<string>();
	const rows: CompareRow[] = reqA.map((r) => {
		const key = `${a}:${r.code}`;
		const controls = ctrlA.get(key) ?? new Map<string, Edge["coverage"]>();
		const counterparts = new Map<string, { via: Set<string>; full: boolean }>();
		for (const [control, covA] of controls) {
			for (const hit of bByControl.get(control) ?? []) {
				const cp = counterparts.get(hit.key) ?? { via: new Set(), full: false };
				cp.via.add(control);
				if (covA === "full" && hit.cov === "full") cp.full = true;
				counterparts.set(hit.key, cp);
			}
		}
		const explicit = new Set(
			(catalog.related?.get(key) ?? []).filter((k) => keysB.has(k)),
		);
		// Rückrichtung: B verweist auf A
		for (const kb of keysB) {
			if ((catalog.related?.get(kb) ?? []).includes(key)) explicit.add(kb);
		}
		for (const kb of explicit) {
			if (!counterparts.has(kb))
				counterparts.set(kb, { via: new Set(), full: false });
		}
		let kind: CompareKind = "unique";
		if (counterparts.size > 0) {
			const anyEquivalent = [...counterparts.entries()].some(
				([kb, cp]) => cp.full || explicit.has(kb),
			);
			kind = anyEquivalent ? "equivalent" : "partial";
		}
		for (const kb of counterparts.keys()) matchedB.add(kb);

		// Abdeckungsstatus der A-Anforderung aus dem Org-Status
		let status: ReqCoverage = "open";
		if (implStatus) {
			for (const [control, cov] of controls) {
				const s = edgeStatus(cov, implStatus.get(control) ?? "not_started");
				if (s === "covered") {
					status = "covered";
					break;
				}
				if (s === "partial") status = "partial";
			}
		}
		return {
			key,
			code: r.code,
			kind,
			counterparts: [...counterparts.entries()]
				.map(([k, cp]) => ({
					key: k,
					code: k.slice(b.length + 1),
					via: [...cp.via].sort(),
				}))
				.sort((x, y) => x.code.localeCompare(y.code)),
			sharedControls: [...controls.keys()]
				.filter((c) => allControlsB.has(c))
				.sort(),
			status,
		};
	});

	const uniqueB = reqB
		.filter((r) => !matchedB.has(`${b}:${r.code}`))
		.map((r) => ({ key: `${b}:${r.code}`, code: r.code }));

	const counts = {
		equivalent: 0,
		partial: 0,
		unique: 0,
		uniqueB: uniqueB.length,
	};
	for (const row of rows) counts[row.kind] += 1;

	return {
		a,
		b,
		rows,
		uniqueB,
		sharedControls,
		onlyA: [...allControlsA].filter((c) => !allControlsB.has(c)).sort(),
		onlyB: [...allControlsB].filter((c) => !allControlsA.has(c)).sort(),
		counts,
	};
}
