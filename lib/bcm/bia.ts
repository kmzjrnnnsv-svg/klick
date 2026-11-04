import type { ProcessBia } from "@/db/schema/registers";

// Geführte Business-Impact-Analyse (BSI 200-4 Kap. 6, ISO 22301 8.2.2,
// DORA Art. 11 Abs. 5): je Schadensart der Risikomethode der Org die Stufe
// je Zeitstufe. Daraus der Vorschlag: MTPD = erste Zeitstufe, ab der eine
// Schadensart nicht mehr tragbar ist; RTO = die Zeitstufe davor. Pure, ohne
// Datenbank; übernommen werden die Werte nur per Klick (saveProcessBia).

export const DEFAULT_BIA_STEPS = [4, 8, 24, 72, 168, 336] as const;
export const BIA_MAX_STEPS = 8;
export const BIA_MAX_HOURS = 8760;
// Vorschläge für den tragbaren Datenverlust (RPO) in Stunden
export const DATA_LOSS_OPTIONS = [0, 1, 4, 8, 24, 72] as const;

export type BiaDimension = { key: string; label: string; enabled: boolean };

// Schwelle „nicht mehr tragbar“: zweithöchste Stufe (5 Stufen → 4 „hoch“,
// 4 Stufen → 3 „beträchtlich“) — ein Vorschlag, je Prozess änderbar
export function defaultThreshold(levels: number): number {
	return Math.max(1, levels - 1);
}

export function emptyBia(
	dimensions: readonly BiaDimension[],
	levels: number,
): Omit<ProcessBia, "assessedAt" | "assessedBy"> {
	const impacts: Record<string, number[]> = {};
	for (const d of dimensions)
		if (d.enabled) impacts[d.key] = DEFAULT_BIA_STEPS.map(() => 0);
	return {
		v: 1,
		steps: [...DEFAULT_BIA_STEPS],
		threshold: defaultThreshold(levels),
		impacts,
		dataLossHours: null,
		notes: null,
	};
}

// Lesbare Dauer: 4 h, 1 Tag, 3 Tage, 1 Woche, 2 Wochen
export function durationParts(hours: number): {
	unit: "hours" | "days" | "weeks";
	count: number;
} {
	if (hours >= 168 && hours % 168 === 0)
		return { unit: "weeks", count: hours / 168 };
	if (hours >= 24 && hours % 24 === 0)
		return { unit: "days", count: hours / 24 };
	return { unit: "hours", count: hours };
}

export type BiaPoint = {
	hours: number;
	level: number;
	// Schadensarten mit der höchsten Stufe in dieser Zeitstufe
	decisive: string[];
};

// Verlauf: je Zeitstufe die höchste Stufe über alle aktiven Schadensarten
export function biaCurve(
	bia: Pick<ProcessBia, "steps" | "impacts">,
	dimensions: readonly BiaDimension[],
): BiaPoint[] {
	const active = dimensions.filter((d) => d.enabled).map((d) => d.key);
	return bia.steps.map((hours, i) => {
		let level = 0;
		let decisive: string[] = [];
		for (const key of active) {
			const v = bia.impacts[key]?.[i] ?? 0;
			if (v > level) {
				level = v;
				decisive = [key];
			} else if (v === level && v > 0) decisive.push(key);
		}
		return { hours, level, decisive };
	});
}

export type BiaCriticality = "critical" | "important" | "standard";

export type BiaSuggestion = {
	// null = in keiner Zeitstufe erreicht (länger als die letzte Zeitstufe)
	mtpdHours: number | null;
	rtoHours: number | null;
	rpoHours: number | null;
	criticality: BiaCriticality;
	// Schadensarten, die die Schwelle zuerst erreichen
	decisive: string[];
};

// Kritikalität aus der MTPD (Vorschlag): bis 1 Tag kritisch, bis 1 Woche
// wichtig, sonst normal
export function criticalityFor(mtpdHours: number | null): BiaCriticality {
	if (mtpdHours === null) return "standard";
	if (mtpdHours <= 24) return "critical";
	if (mtpdHours <= 168) return "important";
	return "standard";
}

export function suggestTargets(
	bia: Pick<ProcessBia, "steps" | "impacts" | "threshold" | "dataLossHours">,
	dimensions: readonly BiaDimension[],
): BiaSuggestion {
	const curve = biaCurve(bia, dimensions);
	const idx = curve.findIndex((p) => p.level >= bia.threshold);
	const rpoHours = bia.dataLossHours ?? null;
	if (idx < 0)
		return {
			mtpdHours: null,
			rtoHours: null,
			rpoHours,
			criticality: "standard",
			decisive: [],
		};
	const point = curve[idx] as BiaPoint;
	const mtpdHours = point.hours;
	// RTO: die Zeitstufe davor; ist schon die erste Stufe untragbar, die Hälfte
	const prev = idx > 0 ? (bia.steps[idx - 1] as number) : null;
	const rtoHours = prev ?? Math.max(1, Math.floor(mtpdHours / 2));
	return {
		mtpdHours,
		rtoHours,
		rpoHours,
		criticality: criticalityFor(mtpdHours),
		decisive: point.decisive,
	};
}

export type BiaIssue =
	| "rto_over_mtpd"
	| "critical_without_targets"
	| "not_assessed"
	| "stale"
	| "decreasing";

// Hinweise am Prozess (pure): RTO über MTPD, kritisch ohne Ziele, ohne BIA,
// BIA älter als 12 Monate, Schaden sinkt mit der Zeit (meist ein Versehen)
export function biaIssues(
	p: {
		criticality: string;
		rtoHours: number | null;
		rpoHours: number | null;
		mtpdHours: number | null;
		bia: ProcessBia | null;
	},
	now = new Date(),
): BiaIssue[] {
	const out: BiaIssue[] = [];
	if (p.rtoHours !== null && p.mtpdHours !== null && p.rtoHours > p.mtpdHours)
		out.push("rto_over_mtpd");
	const critical = p.criticality !== "standard";
	if (critical && (p.rtoHours === null || p.rpoHours === null))
		out.push("critical_without_targets");
	if (!p.bia) {
		if (critical) out.push("not_assessed");
		return out;
	}
	const year = new Date(now);
	year.setUTCFullYear(year.getUTCFullYear() - 1);
	if (new Date(p.bia.assessedAt) < year) out.push("stale");
	for (const levels of Object.values(p.bia.impacts)) {
		if (levels.some((v, i) => i > 0 && v < (levels[i - 1] as number))) {
			out.push("decreasing");
			break;
		}
	}
	return out;
}

// Eingaben bereinigen: Zeitstufen aufsteigend und eindeutig, Stufen auf
// 0 … levels, nur bekannte Schadensarten, Länge passend zu den Zeitstufen
export function normalizeBia(
	input: Omit<ProcessBia, "assessedAt" | "assessedBy">,
	dimensions: readonly BiaDimension[],
	levels: number,
): Omit<ProcessBia, "assessedAt" | "assessedBy"> {
	const order = input.steps
		.map((h, i) => ({ h: Math.round(h), i }))
		.filter((x) => x.h >= 1 && x.h <= BIA_MAX_HOURS)
		.sort((a, b) => a.h - b.h)
		.filter((x, i, all) => i === 0 || x.h !== (all[i - 1] as { h: number }).h)
		.slice(0, BIA_MAX_STEPS);
	const known = new Set(dimensions.filter((d) => d.enabled).map((d) => d.key));
	const impacts: Record<string, number[]> = {};
	for (const key of known) {
		const row = input.impacts[key] ?? [];
		impacts[key] = order.map((x) => {
			const v = Math.round(row[x.i] ?? 0);
			return Math.min(levels, Math.max(0, Number.isFinite(v) ? v : 0));
		});
	}
	const dl = input.dataLossHours;
	return {
		v: 1,
		steps: order.map((x) => x.h),
		threshold: Math.min(levels, Math.max(1, Math.round(input.threshold))),
		impacts,
		dataLossHours:
			dl === null || dl === undefined || !Number.isFinite(dl)
				? null
				: Math.min(BIA_MAX_HOURS, Math.max(0, Math.round(dl))),
		notes: input.notes?.trim() ? input.notes.trim().slice(0, 4000) : null,
	};
}
