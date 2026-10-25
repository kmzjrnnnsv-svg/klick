import {
	type FunctionKey,
	ROLE_FUNCTIONS,
	type RoleFunction,
} from "@/db/schema/enums";
import { APPOINTMENT_TEMPLATE_BY_FUNCTION } from "./catalog/appointment-templates";

// Organigramm (N3), pure: Funktionen als Baum über „berichtet an“
// (role_assignments.reportsToFunction). Ohne Angabe hängt eine Funktion
// direkt unter der Geschäftsleitung. Unbesetzte Pflichtfunktionen erscheinen
// als „nicht besetzt“. Warnungen statt Fehler: Unabhängigkeitsfunktionen
// (ISB, Compliance, Revision, GWB, DSB …) müssen direkt an die Leitung
// berichten; Kreise werden aufgelöst und gemeldet. Eigene Rollen (ADR-024)
// sind Knoten wie Funktionen (Schlüssel `role:<id>`), hinter dem Katalog.

export type ChartAssignment = {
	function: FunctionKey;
	reportsToFunction: FunctionKey | null;
	holder: string | null;
	deputy: string | null;
};

export type ChartNode = {
	function: FunctionKey;
	holders: string[];
	deputies: string[];
	vacant: boolean;
	parent: FunctionKey | null;
	children: ChartNode[];
};

export type ChartWarning =
	| {
			kind: "not_direct";
			function: FunctionKey;
			parent: FunctionKey;
			basis: string;
	  }
	| { kind: "cycle"; function: FunctionKey }
	| { kind: "no_management" };

const TOP: RoleFunction = "management_body";
// Katalog-Reihenfolge, eigene Rollen dahinter (stabil nach Schlüssel)
const order = (f: FunctionKey) => {
	const i = ROLE_FUNCTIONS.indexOf(f as RoleFunction);
	return i === -1 ? ROLE_FUNCTIONS.length : i;
};

export function buildOrgChart(
	assignments: readonly ChartAssignment[],
	required: readonly FunctionKey[] = [],
): { roots: ChartNode[]; warnings: ChartWarning[]; size: number } {
	const fns = [
		...new Set<FunctionKey>([
			...assignments.map((a) => a.function),
			...required,
		]),
	].sort((a, b) => order(a) - order(b) || a.localeCompare(b));
	const hasTop = fns.includes(TOP);
	const warnings: ChartWarning[] = [];
	if (fns.length > 0 && !hasTop) warnings.push({ kind: "no_management" });

	const fallback = (f: FunctionKey) => (f !== TOP && hasTop ? TOP : null);
	const parent = new Map<FunctionKey, FunctionKey | null>();
	for (const f of fns) {
		const declared =
			assignments.find((a) => a.function === f && a.reportsToFunction)
				?.reportsToFunction ?? null;
		parent.set(
			f,
			f === TOP
				? null
				: declared && declared !== f && fns.includes(declared)
					? declared
					: fallback(f),
		);
	}
	// Kreise auflösen: wer sich selbst über die Kette erreicht, hängt unter
	// der Leitung (bzw. wird Wurzel)
	for (const f of fns) {
		const seen = new Set<FunctionKey>([f]);
		let p = parent.get(f) ?? null;
		while (p) {
			if (seen.has(p)) {
				parent.set(f, fallback(f));
				warnings.push({ kind: "cycle", function: f });
				break;
			}
			seen.add(p);
			p = parent.get(p) ?? null;
		}
	}
	for (const f of fns) {
		const p = parent.get(f) ?? null;
		const t = APPOINTMENT_TEMPLATE_BY_FUNCTION.get(f as RoleFunction);
		if (hasTop && p && p !== TOP && t?.reportsDirectly)
			warnings.push({
				kind: "not_direct",
				function: f,
				parent: p,
				basis: t.independenceBasis ?? "",
			});
	}

	const nodes = new Map<FunctionKey, ChartNode>(
		fns.map((f) => {
			const own = assignments.filter((a) => a.function === f);
			const holders = own.flatMap((a) => (a.holder ? [a.holder] : []));
			return [
				f,
				{
					function: f,
					holders,
					deputies: own.flatMap((a) => (a.deputy ? [a.deputy] : [])),
					vacant: holders.length === 0,
					parent: parent.get(f) ?? null,
					children: [],
				},
			];
		}),
	);
	const roots: ChartNode[] = [];
	for (const f of fns) {
		const n = nodes.get(f);
		if (!n) continue;
		const p = n.parent ? nodes.get(n.parent) : undefined;
		if (p) p.children.push(n);
		else roots.push(n);
	}
	return { roots, warnings, size: fns.length };
}

// Baum als Zeilen mit Tiefe (PDF-Tabelle)
export function flattenChart(
	roots: readonly ChartNode[],
): { node: ChartNode; depth: number }[] {
	const out: { node: ChartNode; depth: number }[] = [];
	const walk = (n: ChartNode, depth: number) => {
		out.push({ node: n, depth });
		for (const c of n.children) walk(c, depth + 1);
	};
	for (const r of roots) walk(r, 0);
	return out;
}
