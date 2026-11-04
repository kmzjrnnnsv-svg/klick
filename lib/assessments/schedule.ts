import type { ImplStatus } from "@/db/schema/enums";
import {
	type CatalogOrderControl,
	predecessorsOf,
} from "@/lib/compliance/catalog/control-order";
import type { SynergyCatalog } from "@/lib/compliance/synergy";
import type { MeasureKind } from "./measures";

// Umsetzungsplan nach der Gap-Analyse (Teil C, rein): Dauer je Maßnahme als
// Schätzung in Arbeitstagen, Reihenfolge aus dem Hebel-Plan, Vorgänger aus
// dem Katalog (control-order.ts), je verantwortlicher Funktion eine Spur
// (was dieselbe Funktion trägt, läuft nacheinander) und insgesamt höchstens
// N Maßnahmen gleichzeitig. Ein Rahmenwerk ist bereit, wenn jede anwendbare
// Anforderung fertig ist: mit der frühesten vollen Kante, sonst wenn alle
// teilweisen fertig sind. Arbeitstage Mo–Fr, Feiertage noch nicht. Der Plan
// wird immer neu gerechnet; gespeichert werden nur die Einstellungen.

export const PLAN_VERSION = 1;
export const DEFAULT_CAPACITY = 2;
export const MAX_CAPACITY = 5;
export const MAX_DAYS = 250;

// Schätzung je Aufwand (Arbeitstage)
export const EFFORT_DAYS = { S: 5, M: 15, L: 40 } as const;
export const CLARIFY_DAYS = 2;
export const EVIDENCE_DAYS = 3;
// Dokument mit Freigabe (Umlauf)
export const DOCUMENT_DAYS = 5;

export type PlanSettings = {
	start: string;
	capacity: number;
	// je Control eine eigene Dauer in Arbeitstagen
	overrides: Record<string, number>;
	version: number;
};

export type ScheduleMeasure = {
	controlCode: string;
	kind: MeasureKind;
	effort: "S" | "M" | "L";
};

export type ScheduledItem = {
	controlCode: string;
	kind: MeasureKind;
	lane: string;
	days: number;
	estimated: number;
	overridden: boolean;
	// Arbeitstage ab Planbeginn: [startDay, endDay)
	startDay: number;
	endDay: number;
	start: string;
	// letzter Arbeitstag (einschließlich)
	end: string;
	after: string[];
};

export type Schedule = {
	start: string;
	end: string | null;
	workdays: number;
	items: ScheduledItem[];
};

const DAY = 86_400_000;
const ms = (d: string) => new Date(`${d}T00:00:00Z`).getTime();
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
const weekday = (d: string) => new Date(ms(d)).getUTCDay();

export function isWorkday(day: string): boolean {
	const w = weekday(day);
	return w !== 0 && w !== 6;
}

// Der nächste Montag ab heute; ist heute Montag, dann heute
export function nextMonday(today: string): string {
	const w = weekday(today);
	return iso(ms(today) + ((8 - w) % 7) * DAY);
}

// Erster Arbeitstag an oder nach dem Tag
export function firstWorkday(day: string): string {
	let t = ms(day);
	while (!isWorkday(iso(t))) t += DAY;
	return iso(t);
}

// Tag n Arbeitstage nach einem Arbeitstag (n = 0: derselbe)
export function addWorkdays(day: string, n: number): string {
	let t = ms(firstWorkday(day));
	let left = n;
	while (left > 0) {
		t += DAY;
		if (isWorkday(iso(t))) left -= 1;
	}
	return iso(t);
}

export function estimateDays(
	m: Pick<ScheduleMeasure, "kind" | "effort">,
	opts: { partial: boolean; documentation: boolean },
): number {
	if (m.kind === "clarify") return CLARIFY_DAYS;
	if (m.kind === "evidence") return EVIDENCE_DAYS;
	const base = EFFORT_DAYS[m.effort];
	const work = opts.partial ? Math.ceil(base / 2) : base;
	return work + (opts.documentation ? DOCUMENT_DAYS : 0);
}

export function clampCapacity(n: unknown): number {
	const v = typeof n === "number" && Number.isFinite(n) ? Math.round(n) : NaN;
	return Number.isNaN(v)
		? DEFAULT_CAPACITY
		: Math.min(MAX_CAPACITY, Math.max(1, v));
}

// Gespeicherte Einstellungen lesen; Unbekanntes fällt auf den Standard
export function planSettingsOf(
	raw: unknown,
	today: string,
): PlanSettings & { saved: boolean } {
	const r = (raw && typeof raw === "object" ? raw : {}) as Record<
		string,
		unknown
	>;
	const start =
		typeof r.start === "string" && /^\d{4}-\d{2}-\d{2}$/.test(r.start)
			? r.start
			: nextMonday(today);
	const overrides: Record<string, number> = {};
	if (r.overrides && typeof r.overrides === "object")
		for (const [k, v] of Object.entries(r.overrides as object))
			if (
				/^CC-[A-Z0-9]+-[0-9A-Z]+$/.test(k) &&
				typeof v === "number" &&
				Number.isInteger(v) &&
				v >= 1 &&
				v <= MAX_DAYS
			)
				overrides[k] = v;
	return {
		start,
		capacity: clampCapacity(r.capacity),
		overrides,
		version: PLAN_VERSION,
		saved: typeof r.start === "string",
	};
}

export function schedulePlan(input: {
	measures: readonly ScheduleMeasure[];
	controls: ReadonlyMap<string, CatalogOrderControl>;
	partial: ReadonlySet<string>;
	laneOf: (code: string) => string;
	settings: Pick<PlanSettings, "start" | "capacity"> &
		Partial<Pick<PlanSettings, "overrides">>;
}): Schedule {
	const start = firstWorkday(input.settings.start);
	const capacity = clampCapacity(input.settings.capacity);
	const overrides = input.settings.overrides ?? {};
	// je Control einmal, in Reihenfolge des Plans
	const seen = new Set<string>();
	const measures = input.measures.filter((m) => {
		if (seen.has(m.controlCode) || !input.controls.has(m.controlCode))
			return false;
		seen.add(m.controlCode);
		return true;
	});
	const inPlan = new Map(
		measures.map((m) => [
			m.controlCode,
			input.controls.get(m.controlCode) as CatalogOrderControl,
		]),
	);
	const preds = new Map(
		measures.map((m) => [
			m.controlCode,
			predecessorsOf(
				input.controls.get(m.controlCode) as CatalogOrderControl,
				inPlan,
			),
		]),
	);

	const load: number[] = [];
	const laneFree = new Map<string, number>();
	const done = new Map<string, ScheduledItem>();
	const remaining = [...measures];
	while (remaining.length > 0) {
		// erste Maßnahme, deren Vorgänger schon stehen; bei einem Kreis die erste
		let idx = remaining.findIndex((m) =>
			(preds.get(m.controlCode) ?? []).every((p) => done.has(p)),
		);
		if (idx < 0) idx = 0;
		const m = remaining.splice(idx, 1)[0] as ScheduleMeasure;
		const ctl = input.controls.get(m.controlCode) as CatalogOrderControl;
		const estimated = estimateDays(m, {
			partial: input.partial.has(m.controlCode),
			documentation: ctl.kind === "documentation",
		});
		const own = overrides[m.controlCode];
		const days = own ?? estimated;
		const lane = input.laneOf(m.controlCode);
		const after = (preds.get(m.controlCode) ?? []).filter((p) => done.has(p));
		let t = Math.max(
			laneFree.get(lane) ?? 0,
			...after.map((p) => done.get(p)?.endDay ?? 0),
		);
		// frühester Beginn, an dem für die ganze Dauer Platz ist
		for (;;) {
			let free = true;
			for (let d = t; d < t + days; d += 1)
				if ((load[d] ?? 0) >= capacity) {
					free = false;
					t = d + 1;
					break;
				}
			if (free) break;
		}
		for (let d = t; d < t + days; d += 1) load[d] = (load[d] ?? 0) + 1;
		laneFree.set(lane, t + days);
		const item: ScheduledItem = {
			controlCode: m.controlCode,
			kind: m.kind,
			lane,
			days,
			estimated,
			overridden: own !== undefined,
			startDay: t,
			endDay: t + days,
			start: addWorkdays(start, t),
			end: addWorkdays(start, t + days - 1),
			after,
		};
		done.set(m.controlCode, item);
	}
	const items = measures.map((m) => done.get(m.controlCode) as ScheduledItem);
	const workdays = items.reduce((max, i) => Math.max(max, i.endDay), 0);
	return {
		start,
		end: workdays > 0 ? addWorkdays(start, workdays - 1) : null,
		workdays,
		items,
	};
}

export type FrameworkReadiness = {
	slug: string;
	// Tag, ab dem alle erreichbaren Anforderungen fertig sind
	readyAt: string | null;
	readyDay: number | null;
	// Maßnahmen im Plan, die dieses Rahmenwerk tragen
	measures: number;
	// anwendbare Anforderungen, die der Plan nicht erreicht
	missing: number;
	// längste Kette bis zum letzten Schritt (Controls, früheste zuerst)
	chain: string[];
};

export function frameworkReadiness(input: {
	frameworks: readonly string[];
	schedule: Schedule;
	catalog: Pick<SynergyCatalog, "requirements" | "edges" | "applicability">;
	implStatus: ReadonlyMap<string, ImplStatus>;
}): FrameworkReadiness[] {
	const byCode = new Map(input.schedule.items.map((i) => [i.controlCode, i]));
	const edgesByReq = new Map<string, SynergyCatalog["edges"][number][]>();
	for (const e of input.catalog.edges) {
		const list = edgesByReq.get(e.requirement);
		if (list) list.push(e);
		else edgesByReq.set(e.requirement, [e]);
	}
	const isDone = (control: string) =>
		input.implStatus.get(control) === "implemented";
	return input.frameworks.map((slug) => {
		let readyDay = 0;
		let last: ScheduledItem | null = null;
		let missing = 0;
		const carriers = new Set<string>();
		for (const r of input.catalog.requirements) {
			if (r.framework !== slug || r.legalStatus === "repealed") continue;
			const key = `${r.framework}:${r.code}`;
			if (input.catalog.applicability?.get(key) === false) continue;
			const edges = edgesByReq.get(key) ?? [];
			for (const e of edges) if (byCode.has(e.control)) carriers.add(e.control);
			if (edges.some((e) => e.coverage === "full" && isDone(e.control)))
				continue;
			// früheste volle Kante im Plan
			const full = edges
				.filter((e) => e.coverage === "full")
				.map((e) => byCode.get(e.control))
				.filter((i): i is ScheduledItem => Boolean(i))
				.sort((a, b) => a.endDay - b.endDay)[0];
			let doneBy: ScheduledItem | null | undefined = full;
			if (!doneBy) {
				// sonst alle teilweisen: fertig, wenn jede umgesetzt oder im Plan ist
				const partial = edges.filter((e) => e.coverage === "partial");
				const open = partial.filter((e) => !isDone(e.control));
				if (partial.length === 0 || open.some((e) => !byCode.has(e.control))) {
					missing += 1;
					continue;
				}
				doneBy = open
					.map((e) => byCode.get(e.control) as ScheduledItem)
					.sort((a, b) => b.endDay - a.endDay)[0];
				if (!doneBy) continue;
			}
			if (doneBy.endDay > readyDay) {
				readyDay = doneBy.endDay;
				last = doneBy;
			}
		}
		const chain: string[] = [];
		for (let cur: ScheduledItem | null = last; cur; ) {
			chain.unshift(cur.controlCode);
			const prev: ScheduledItem | undefined = cur.after
				.map((p) => byCode.get(p))
				.filter((i): i is ScheduledItem => Boolean(i))
				.sort((a, b) => b.endDay - a.endDay)[0];
			cur = prev ?? null;
		}
		return {
			slug,
			readyDay: last ? readyDay : missing === 0 ? 0 : null,
			readyAt: last
				? addWorkdays(input.schedule.start, readyDay - 1)
				: missing === 0
					? input.schedule.start
					: null,
			measures: carriers.size,
			missing,
			chain,
		};
	});
}
