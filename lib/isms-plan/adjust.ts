import {
	ISMS_ITEM_BY_KEY,
	ISMS_WORKDAYS,
	type IsmsItem,
	type Range,
} from "@/lib/compliance/catalog/isms-programme";
import {
	adjustedNumbers,
	type IsmsItemAdjust,
	type IsmsNumbers,
	unitsLine,
} from "./adjust-math";
import type { RollupItem } from "./rollup";

// ISMS-Jahresplan je Organisation (P2b, pure): was in der Org entfällt, eigener
// Aufwand, Einheiten, Arbeitstage je Jahr. Gespeichert in
// org_settings.isms_plan, gelesen nur über ismsPlanSettingsOf — ein kaputter
// oder fremder Wert fällt auf die Vorlage zurück, nie auf eine falsche Zahl.

export type { IsmsItemAdjust } from "./adjust-math";

export type IsmsPlanSettings = {
	workdays: number;
	items: Record<string, IsmsItemAdjust>;
};

export const ISMS_WORKDAYS_BOUNDS = [150, 230] as const;
export const ISMS_UNITS_BOUNDS = [1, 100] as const;
export const ISMS_YEAR_MAX = 365;
export const ISMS_OFF_REASON_MIN = 10;
export const ISMS_OFF_REASON_MAX = 500;

const r10 = (n: number) => Math.round(n * 10) / 10;

function objectOf(raw: unknown): Record<string, unknown> {
	return raw !== null && typeof raw === "object" && !Array.isArray(raw)
		? (raw as Record<string, unknown>)
		: {};
}

function rangeOf(raw: unknown): Range | null {
	if (!Array.isArray(raw) || raw.length !== 2) return null;
	const [lo, hi] = raw;
	if (typeof lo !== "number" || typeof hi !== "number") return null;
	if (!Number.isFinite(lo) || !Number.isFinite(hi)) return null;
	if (lo < 0 || hi > ISMS_YEAR_MAX || lo > hi) return null;
	return [r10(lo), r10(hi)];
}

// Anpassung eines Punkts prüfen; null = keine (gültige) Anpassung
export function itemAdjustOf(
	item: Pick<IsmsItem, "basis">,
	raw: unknown,
): IsmsItemAdjust | null {
	const obj = objectOf(raw);
	const out: IsmsItemAdjust = {};
	const off = objectOf(obj.off);
	if (typeof off.reason === "string") {
		const reason = off.reason.trim();
		if (
			reason.length >= ISMS_OFF_REASON_MIN &&
			reason.length <= ISMS_OFF_REASON_MAX
		)
			out.off = { reason };
	}
	const year = rangeOf(obj.year);
	if (year) out.year = year;
	const [umin, umax] = ISMS_UNITS_BOUNDS;
	if (
		typeof obj.units === "number" &&
		Number.isInteger(obj.units) &&
		obj.units >= umin &&
		obj.units <= umax &&
		unitsLine(item.basis)
	)
		out.units = obj.units;
	return Object.keys(out).length ? out : null;
}

export function ismsPlanSettingsOf(raw: unknown): IsmsPlanSettings {
	const obj = objectOf(raw);
	const [wmin, wmax] = ISMS_WORKDAYS_BOUNDS;
	const workdays =
		typeof obj.workdays === "number" &&
		Number.isInteger(obj.workdays) &&
		obj.workdays >= wmin &&
		obj.workdays <= wmax
			? obj.workdays
			: ISMS_WORKDAYS;
	const items: Record<string, IsmsItemAdjust> = {};
	for (const [key, value] of Object.entries(objectOf(obj.items))) {
		const item = ISMS_ITEM_BY_KEY.get(key);
		if (!item) continue;
		const adj = itemAdjustOf(item, value);
		if (adj) items[key] = adj;
	}
	return { workdays, items };
}

// neuer Stand mit (oder ohne) Anpassung eines Punkts; leer = Vorlage
export function withItemAdjust(
	settings: IsmsPlanSettings,
	key: string,
	adj: IsmsItemAdjust | null,
): IsmsPlanSettings {
	const items = { ...settings.items };
	if (adj && Object.keys(adj).length) items[key] = adj;
	else delete items[key];
	return { ...settings, items };
}

// gespeicherte Form (Arbeitstage nur, wenn abweichend)
export function storedIsmsPlan(
	settings: IsmsPlanSettings,
): Record<string, unknown> {
	return {
		...(settings.workdays !== ISMS_WORKDAYS
			? { workdays: settings.workdays }
			: {}),
		items: settings.items,
	};
}

export type IsmsOff = { reason: string } | { via: string };

export type AdjustedRow = {
	item: IsmsItem;
	numbers: IsmsNumbers;
	adjust: IsmsItemAdjust | null;
	// entfällt selbst (reason) oder mit dem übergeordneten Punkt (via)
	off: IsmsOff | null;
};

// entfällt ein Punkt? auch, wenn ein übergeordneter Punkt entfällt
function offOf(
	item: IsmsItem,
	settings: IsmsPlanSettings,
	byKey: ReadonlyMap<string, IsmsItem>,
): IsmsOff | null {
	const own = settings.items[item.key]?.off;
	if (own) return { reason: own.reason };
	const seen = new Set([item.key]);
	let parent = item.parent;
	while (parent && !seen.has(parent)) {
		seen.add(parent);
		if (settings.items[parent]?.off) return { via: parent };
		parent = byKey.get(parent)?.parent;
	}
	return null;
}

export function applyIsmsPlan(
	items: readonly IsmsItem[],
	settings: IsmsPlanSettings,
): { rows: Map<string, AdjustedRow>; active: RollupItem[] } {
	const byKey = new Map(items.map((i) => [i.key, i]));
	const rows = new Map<string, AdjustedRow>();
	const active: RollupItem[] = [];
	for (const item of items) {
		const adjust = settings.items[item.key] ?? null;
		const numbers = adjustedNumbers(item, adjust);
		const off = offOf(item, settings, byKey);
		rows.set(item.key, { item, numbers, adjust, off });
		if (!off)
			active.push({
				key: item.key,
				section: item.section,
				parent: item.parent,
				year: numbers.year,
				isb: { a: numbers.isbA, b: numbers.isbB },
			});
	}
	return { rows, active };
}
