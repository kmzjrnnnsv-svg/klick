import type { Tone } from "@/lib/charts/ring";
import { addDays, type TimelineItem } from "@/lib/charts/timeline";

// Audit-Arbeitsplatz (Teil 6, Nov 2026): rein, ohne Datenbank. Zeitleiste
// aus den Daten des Audits (Prüfzeitraum, Termin, Beginn, Fristen der
// Anfragen), Stand der Anfragen und der Filter der Anfragen-Liste.

export type RequestStatus = "open" | "answered" | "accepted" | "rejected";

// URL-Wert der Ansicht → Stände; „alle“ = keine Einschränkung
export const REQUEST_VIEWS = {
	offen: ["open", "rejected"],
	beantwortet: ["answered"],
	akzeptiert: ["accepted"],
	alle: ["open", "answered", "accepted", "rejected"],
} as const satisfies Record<string, readonly RequestStatus[]>;
export type RequestView = keyof typeof REQUEST_VIEWS;

/** Ansicht aus der Adresse; ohne Angabe „offen“, solange es Offenes gibt */
export function requestViewOf(
	v: string | undefined,
	counts: Readonly<Record<RequestStatus, number>>,
): RequestView {
	if (v && v in REQUEST_VIEWS) return v as RequestView;
	return counts.open + counts.rejected > 0 ? "offen" : "alle";
}

export function requestCounts(
	rows: readonly { status: RequestStatus }[],
): Record<RequestStatus, number> {
	const out: Record<RequestStatus, number> = {
		open: 0,
		answered: 0,
		accepted: 0,
		rejected: 0,
	};
	for (const r of rows) out[r.status] += 1;
	return out;
}

export function viewCount(
	view: RequestView,
	counts: Readonly<Record<RequestStatus, number>>,
): number {
	return REQUEST_VIEWS[view].reduce((n, s) => n + counts[s], 0);
}

/** Suche über Titel, Beschreibung und Control, ohne Groß/Klein */
export function matchesRequest(
	r: {
		title: string;
		description: string | null;
		controlCode: string | null;
	},
	q: string | undefined,
): boolean {
	const needle = q?.trim().toLowerCase();
	if (!needle) return true;
	return [r.title, r.description ?? "", r.controlCode ?? ""].some((s) =>
		s.toLowerCase().includes(needle),
	);
}

/** Überfällig: offen bzw. abgelehnt (Nacharbeit) und Frist vor heute */
export function requestOverdue(
	r: { status: RequestStatus; dueAt: string | null },
	today: string,
): boolean {
	return (
		(r.status === "open" || r.status === "rejected") &&
		r.dueAt !== null &&
		r.dueAt < today
	);
}

export type AuditDates = {
	periodStart: string | null;
	periodEnd: string | null;
	plannedAt: string | null;
	performedAt: string | null;
	status: "planned" | "in_progress" | "reported" | "closed";
};

export type PhaseLabels = {
	periodStart: string;
	periodEnd: string;
	planned: string;
	performed: string;
	// n Anfragen mit dieser Frist
	requestsDue: (n: number) => string;
};

/**
 * Zeitleiste eines Audits: Prüfzeitraum, Termin, Beginn und je Fristtag
 * die offenen Anfragen (überfällig rot, bald orange). Der Rahmen reicht von
 * der frühesten bis zur spätesten Marke, mindestens 30 Tage um heute.
 */
export function auditPhases(
	a: AuditDates,
	requests: readonly { status: RequestStatus; dueAt: string | null }[],
	today: string,
	labels: PhaseLabels,
	href?: (kind: "requests") => string,
): { start: string; end: string; items: TimelineItem[] } {
	const items: TimelineItem[] = [];
	const mark = (
		key: string,
		date: string | null,
		label: string,
		tone: Tone,
	) => {
		if (date) items.push({ key, date, label, tone });
	};
	mark("period-start", a.periodStart, labels.periodStart, "muted");
	mark("period-end", a.periodEnd, labels.periodEnd, "muted");
	mark(
		"planned",
		a.plannedAt,
		labels.planned,
		a.status === "planned" ? "primary" : "muted",
	);
	mark("performed", a.performedAt, labels.performed, "success");
	const due = new Map<string, number>();
	for (const r of requests)
		if ((r.status === "open" || r.status === "rejected") && r.dueAt)
			due.set(r.dueAt, (due.get(r.dueAt) ?? 0) + 1);
	const soon = addDays(today, 7);
	for (const [date, n] of [...due].sort(([x], [y]) => x.localeCompare(y)))
		items.push({
			key: `due-${date}`,
			date,
			label: labels.requestsDue(n),
			tone: date < today ? "destructive" : date <= soon ? "warning" : "primary",
			href: href?.("requests"),
		});
	const dates = [...items.map((i) => i.date), today].sort();
	const first = dates[0] ?? today;
	const last = dates.at(-1) ?? today;
	const start = addDays(
		first < addDays(today, -30) ? first : addDays(today, -30),
		-7,
	);
	const end = addDays(last > addDays(today, 30) ? last : addDays(today, 30), 7);
	items.sort((x, y) => x.date.localeCompare(y.date));
	return { start, end, items };
}

/** Wer im Audit wen benachrichtigt: Gegenseite einer Anfrage */
export function requestCounterparts(
	r: { requestedByUserId: string | null; assigneeUserId: string | null },
	authorUserId: string,
): string[] {
	return [
		...new Set(
			[r.requestedByUserId, r.assigneeUserId].filter(
				(u): u is string => u !== null && u !== authorUserId,
			),
		),
	];
}

// Prüfer:innen kommentieren nur am Audit, an Anfragen und Findings
export const AUDITOR_COMMENT_KINDS = [
	"audit",
	"audit_request",
	"audit_finding",
] as const;

export function auditorMayComment(role: string, entityType: string): boolean {
	if (role !== "auditor") return true;
	return (AUDITOR_COMMENT_KINDS as readonly string[]).includes(entityType);
}

/**
 * Einstieg für Prüfer:innen: genau ein laufendes Audit, in dem die Person
 * prüft → direkt dorthin, sonst die Audit-Liste.
 */
export function auditorLanding(
	audits: readonly {
		id: string;
		status: AuditDates["status"];
		auditorMemberIds: readonly string[];
		auditorUserId: string | null;
	}[],
	userId: string,
): string {
	const mine = audits.filter(
		(a) => a.auditorUserId === userId || a.auditorMemberIds.includes(userId),
	);
	const running = mine.filter((a) => a.status === "in_progress");
	if (running.length === 1) return `/audits/${running[0]?.id}`;
	if (running.length === 0 && mine.length === 1)
		return `/audits/${mine[0]?.id}`;
	return "/audits";
}
