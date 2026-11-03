import { addDays, type TimelineItem } from "@/lib/charts/timeline";
import {
	cycleDates,
	type OrgAuditSettings,
	type RegisteredAudit,
} from "./audit-follow-up";

// Auswertung (/auswertung) und Audit-Zeitleisten (pure, Test `report`):
// Zeitraum aus der URL, offene Punkte je Person geordnet, Termine aus
// Register und Turnus als Einträge der Zeitleiste.

export const PERIODS = [30, 90, 365] as const;
export type Period = (typeof PERIODS)[number];

export function periodOf(v: string | undefined): Period {
	const n = Number(v);
	return (PERIODS as readonly number[]).includes(n) ? (n as Period) : 90;
}

export type PersonLoad = {
	userId: string;
	overdue: number;
	soon: number;
	planned: number;
	undated: number;
};

export const loadTotal = (p: Omit<PersonLoad, "userId">) =>
	p.overdue + p.soon + p.planned + p.undated;

/**
 * Wer am meisten Überfälliges hat, steht oben (dann bald fällig, dann
 * insgesamt); ab `limit` Personen fasst „rest“ den Rest zusammen.
 */
export function rankPeople(
	rows: readonly PersonLoad[],
	limit = 8,
): {
	top: PersonLoad[];
	rest: (Omit<PersonLoad, "userId"> & { people: number }) | null;
} {
	const sorted = [...rows]
		.filter((r) => loadTotal(r) > 0)
		.sort(
			(a, b) =>
				b.overdue - a.overdue ||
				b.soon - a.soon ||
				loadTotal(b) - loadTotal(a) ||
				a.userId.localeCompare(b.userId),
		);
	const top = sorted.slice(0, limit);
	const others = sorted.slice(limit);
	if (others.length === 0) return { top, rest: null };
	const rest = {
		overdue: 0,
		soon: 0,
		planned: 0,
		undated: 0,
		people: others.length,
	};
	for (const r of others) {
		rest.overdue += r.overdue;
		rest.soon += r.soon;
		rest.planned += r.planned;
		rest.undated += r.undated;
	}
	return { top, rest };
}

export type AuditRow = {
	id: string;
	title: string;
	type: string;
	status: string;
	plannedAt: string | null;
	performedAt: string | null;
	frameworkIds: readonly string[];
};

/**
 * Termine bis `end`: Turnus-Termine (ohne die, für die schon ein Audit im
 * Register steht) und eingetragene Audits, die geplant sind oder laufen. Ein
 * laufendes Audit ohne Datum in der Zukunft steht auf heute.
 */
export function auditTimeline(input: {
	frameworks: readonly string[];
	settings: OrgAuditSettings;
	registered: readonly RegisteredAudit[];
	audits: readonly AuditRow[];
	today: string;
	months?: number;
	labels: {
		cycle: (
			label: string,
			framework: string,
		) => { label: string; detail?: string };
		audit: (a: AuditRow) => string;
	};
}): { start: string; end: string; items: TimelineItem[]; missing: boolean } {
	const months = input.months ?? 12;
	const end = addDays(input.today, Math.round(months * 30.44));
	const cycles = cycleDates(
		input.frameworks,
		input.settings,
		input.today,
		input.registered,
		months,
	);
	const items: TimelineItem[] = cycles.planned
		.filter((p) => p.date <= end)
		.map((p) => {
			const l = input.labels.cycle(p.label, p.framework);
			return {
				key: `cycle-${p.framework}-${p.kind}-${p.date}`,
				date: p.date,
				label: l.label,
				detail: l.detail,
				tone: "chart-2" as const,
			};
		});
	const wanted = new Set(input.frameworks);
	for (const a of input.audits) {
		if (a.status !== "planned" && a.status !== "in_progress") continue;
		if (a.frameworkIds.length > 0 && !a.frameworkIds.some((f) => wanted.has(f)))
			continue;
		const running = a.status === "in_progress";
		const raw = a.performedAt ?? a.plannedAt;
		if (!raw && !running) continue;
		const date =
			running && (!raw || raw < input.today) ? input.today : (raw as string);
		if (date < input.today || date > end) continue;
		items.push({
			key: a.id,
			date,
			label: a.title,
			detail: input.labels.audit(a),
			tone: running ? "success" : "primary",
			href: `/audits/${a.id}`,
		});
	}
	return {
		start: input.today,
		end,
		items,
		missing: cycles.missing.length > 0,
	};
}
