import type { DueRule } from "@/db/schema/aml";
import type { ObligationFrequency } from "./catalog/obligations";

// Zeitplan für Pflichten-Läufe (pure, getestet): aus Frequenz + DueRule die
// Fälligkeiten in einem Zeitfenster ableiten. periodLabel ist je Pflicht
// eindeutig (unique(obligationId, periodLabel)) und idempotent — der Tick
// kann den Planer beliebig oft laufen lassen.

export type PlannedRun = {
	periodLabel: string;
	dueAt: string; // ISO-Datum
};

export type ScheduleInput = {
	frequency: ObligationFrequency;
	dueRule?: DueRule | null;
	secondMonth?: number | null;
	// für triennial: Referenzjahr des ersten Laufs
	anchorYear?: number;
};

function pad(n: number): string {
	return String(n).padStart(2, "0");
}

// Letzter gültiger Tag, falls day > Monatslänge (z. B. 31.02.).
function isoDate(year: number, month: number, day: number): string {
	const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
	return `${year}-${pad(month)}-${pad(Math.min(day, last))}`;
}

export function scheduleRuns(
	input: ScheduleInput,
	from: Date,
	to: Date,
): PlannedRun[] {
	if (to < from) return [];
	const fromIso = from.toISOString().slice(0, 10);
	const toIso = to.toISOString().slice(0, 10);
	const years: number[] = [];
	for (let y = from.getUTCFullYear(); y <= to.getUTCFullYear(); y++)
		years.push(y);
	const inRange = (d: string) => d >= fromIso && d <= toIso;
	const rule = input.dueRule ?? null;
	const out: PlannedRun[] = [];

	switch (input.frequency) {
		case "annual": {
			if (rule?.kind !== "fixed") return [];
			for (const y of years) {
				const d = isoDate(y, rule.month, rule.day);
				if (inRange(d)) out.push({ periodLabel: String(y), dueAt: d });
			}
			break;
		}
		case "triennial": {
			if (rule?.kind !== "fixed") return [];
			const anchor = input.anchorYear ?? from.getUTCFullYear();
			for (const y of years) {
				if ((y - anchor) % 3 !== 0) continue;
				const d = isoDate(y, rule.month, rule.day);
				if (inRange(d)) out.push({ periodLabel: String(y), dueAt: d });
			}
			break;
		}
		case "semiannual": {
			if (rule?.kind !== "fixed") return [];
			const second = input.secondMonth ?? ((rule.month + 5) % 12) + 1;
			for (const y of years) {
				const h1 = isoDate(y, rule.month, rule.day);
				const h2 = isoDate(y, second, rule.day);
				if (inRange(h1)) out.push({ periodLabel: `${y}-H1`, dueAt: h1 });
				if (inRange(h2)) out.push({ periodLabel: `${y}-H2`, dueAt: h2 });
			}
			break;
		}
		case "quarterly": {
			if (rule?.kind !== "quarterly") return [];
			// Fällig im Monat nach Quartalsende: Q1 → April, Q2 → Juli, Q3 → Oktober, Q4 → Januar (Folgejahr)
			for (const y of [years[0] - 1, ...years]) {
				for (let q = 1; q <= 4; q++) {
					const dueMonth = q * 3 + 1;
					const dueYear = dueMonth > 12 ? y + 1 : y;
					const d = isoDate(
						dueYear,
						dueMonth > 12 ? 1 : dueMonth,
						rule.dayOfMonthAfterQuarter,
					);
					if (inRange(d)) out.push({ periodLabel: `${y}-Q${q}`, dueAt: d });
				}
			}
			break;
		}
		case "monthly": {
			if (rule?.kind !== "monthly") return [];
			for (const y of years) {
				for (let m = 1; m <= 12; m++) {
					const d = isoDate(y, m, rule.day);
					if (inRange(d)) out.push({ periodLabel: `${y}-${pad(m)}`, dueAt: d });
				}
			}
			break;
		}
		default:
			// per_event, daily, weekly: keine geplanten Einzelläufe
			return [];
	}
	return out.sort((a, b) => a.dueAt.localeCompare(b.dueAt));
}

export type RunState = "upcoming" | "due" | "overdue" | "done" | "waived";

// Status eines Laufs aus Fälligkeit und Vorlauf ableiten.
export function runState(
	run: { dueAt: string | Date; completedAt: Date | null; status: string },
	leadDays: number,
	now = new Date(),
): RunState {
	if (run.status === "waived") return "waived";
	if (run.completedAt || run.status === "done") return "done";
	const due = new Date(
		typeof run.dueAt === "string" ? `${run.dueAt}T23:59:59Z` : run.dueAt,
	);
	if (due.getTime() < now.getTime()) return "overdue";
	const leadStart = new Date(due.getTime() - leadDays * 86_400_000);
	return now >= leadStart ? "due" : "upcoming";
}

// Jahresansicht: Läufe nach Monat gruppieren (1–12).
export function groupByMonth<T extends { dueAt: string }>(
	runs: readonly T[],
	year: number,
): Map<number, T[]> {
	const out = new Map<number, T[]>();
	for (let m = 1; m <= 12; m++) out.set(m, []);
	for (const r of runs) {
		if (!r.dueAt.startsWith(String(year))) continue;
		const m = Number(r.dueAt.slice(5, 7));
		out.get(m)?.push(r);
	}
	return out;
}
