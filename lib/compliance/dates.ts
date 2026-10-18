// Alle Termine einer Organisation (C2): Pflichten, Rechtsänderungen,
// Wiedervorlagen (Dokumente, Risiken, Controls, Dienstleister), Freigaben,
// Ziele, Assets, Audits, Managementbewertung, Tests, Schulungen,
// Abweichungen, Befunde, Ausnahmen, Versicherungen, Betroffenenanfragen,
// Vorfall-Meldefristen, Produkt-Supportende, Zugangsablauf, Meilensteine und
// Managementanfragen. Pure, getestet (tests/dates.test.ts); Daten lädt
// loadDateSources (queries-dates.ts).

export const DATE_KINDS = [
	"obligation",
	"legal",
	"document_review",
	"risk_review",
	"control_review",
	"role_review",
	"provider_assessment",
	"provider_contract",
	"approval",
	"decision_request",
	"objective_due",
	"objective_measure",
	"asset_lifecycle",
	"audit",
	"management_review",
	"test",
	"training",
	"nonconformity",
	"security_finding",
	"exception",
	"insurance",
	"dsr",
	"incident_report",
	"product_support",
	"access_expiry",
	"milestone",
] as const;
export type DateKind = (typeof DATE_KINDS)[number];

// Grobe Gruppen für Filter-Chips
export const DATE_GROUPS: Record<string, readonly DateKind[]> = {
	pflichten: ["obligation", "legal"],
	wiedervorlagen: [
		"document_review",
		"risk_review",
		"control_review",
		"role_review",
		"provider_assessment",
		"provider_contract",
		"asset_lifecycle",
		"product_support",
		"insurance",
	],
	freigaben: ["approval", "decision_request"],
	ziele: ["objective_due", "objective_measure"],
	pruefungen: ["audit", "management_review", "test"],
	massnahmen: [
		"nonconformity",
		"security_finding",
		"exception",
		"training",
		"milestone",
	],
	fristen: ["dsr", "incident_report", "access_expiry"],
};

// Für die Roadmap-Zeitachse: was die Planung prägt
export const ROADMAP_DATE_KINDS: readonly DateKind[] = [
	"legal",
	"audit",
	"management_review",
	"objective_due",
	"provider_assessment",
	"provider_contract",
	"asset_lifecycle",
	"product_support",
	"decision_request",
	"test",
];

export type DateSource = {
	date: string | null;
	kind: DateKind;
	title: string;
	href: string;
	ownerUserId?: string | null;
	done?: boolean;
	note?: string;
};

export type DateState = "overdue" | "soon" | "due" | "done";
export type DateEntry = {
	date: string;
	kind: DateKind;
	title: string;
	href: string;
	ownerUserId: string | null;
	state: DateState;
	note?: string;
};

function addDays(iso: string, days: number): string {
	const d = new Date(`${iso}T00:00:00Z`);
	d.setUTCDate(d.getUTCDate() + days);
	return d.toISOString().slice(0, 10);
}

export function dateState(
	date: string,
	done: boolean,
	today: string,
	soonDays = 30,
): DateState {
	if (done) return "done";
	if (date < today) return "overdue";
	if (date <= addDays(today, soonDays)) return "soon";
	return "due";
}

// Termine im Zeitraum; Überfälliges vor dem Zeitraum kommt mit, solange es
// offen ist (sonst verschwindet es aus dem Blick).
export function collectDates(
	sources: readonly DateSource[],
	range: { from: string; to: string },
	today: string,
	opts: { kinds?: readonly DateKind[]; includeOverdue?: boolean } = {},
): DateEntry[] {
	const kinds = opts.kinds ? new Set(opts.kinds) : null;
	const out: DateEntry[] = [];
	for (const s of sources) {
		if (!s.date) continue;
		const date = s.date.slice(0, 10);
		if (kinds && !kinds.has(s.kind)) continue;
		const done = Boolean(s.done);
		const inRange = date >= range.from && date <= range.to;
		const carried =
			opts.includeOverdue === true &&
			!done &&
			date < range.from &&
			date < today;
		if (!inRange && !carried) continue;
		out.push({
			date,
			kind: s.kind,
			title: s.title,
			href: s.href,
			ownerUserId: s.ownerUserId ?? null,
			state: dateState(date, done, today),
			...(s.note ? { note: s.note } : {}),
		});
	}
	return out.sort(
		(a, b) =>
			a.date.localeCompare(b.date) ||
			DATE_KINDS.indexOf(a.kind) - DATE_KINDS.indexOf(b.kind) ||
			a.title.localeCompare(b.title),
	);
}

export function datesByMonth(
	entries: readonly DateEntry[],
	year: number,
): Map<number, DateEntry[]> {
	const out = new Map<number, DateEntry[]>();
	for (const e of entries) {
		if (Number(e.date.slice(0, 4)) !== year) continue;
		const m = Number(e.date.slice(5, 7));
		const list = out.get(m) ?? [];
		list.push(e);
		out.set(m, list);
	}
	return out;
}

// Montag der Kalenderwoche (ISO) als Gruppenschlüssel
export function weekStart(iso: string): string {
	const d = new Date(`${iso}T00:00:00Z`);
	const dow = (d.getUTCDay() + 6) % 7;
	d.setUTCDate(d.getUTCDate() - dow);
	return d.toISOString().slice(0, 10);
}

export function datesByWeek(
	entries: readonly DateEntry[],
): { week: string; entries: DateEntry[] }[] {
	const map = new Map<string, DateEntry[]>();
	for (const e of entries) {
		const w = weekStart(e.date);
		const list = map.get(w) ?? [];
		list.push(e);
		map.set(w, list);
	}
	return [...map.entries()]
		.sort((a, b) => a[0].localeCompare(b[0]))
		.map(([week, list]) => ({ week, entries: list }));
}

// Quartal „2026-Q4“ für die Roadmap-Zeitachse
export function quarterOf(iso: string): string {
	return `${iso.slice(0, 4)}-Q${Math.floor((Number(iso.slice(5, 7)) - 1) / 3) + 1}`;
}

// Letzter Tag eines Quartals („2027-Q2“ → „2027-06-30“)
export function quarterEnd(q: string): string {
	const y = Number(q.slice(0, 4));
	const n = Number(q.slice(-1));
	return new Date(Date.UTC(y, n * 3, 0)).toISOString().slice(0, 10);
}

// Die nächsten n Quartale ab dem Quartal von `today`
export function nextQuarters(today: string, n: number): string[] {
	const y = Number(today.slice(0, 4));
	const q = Math.floor((Number(today.slice(5, 7)) - 1) / 3);
	return Array.from({ length: n }, (_, i) => {
		const k = q + i;
		return `${y + Math.floor(k / 4)}-Q${(k % 4) + 1}`;
	});
}

// Kündigungsfrist eines Vertrags: Vertragsende minus Kündigungsfrist (Tage)
export function noticeDate(
	contractEnd: string | null,
	noticePeriodDays: number | null,
): string | null {
	if (!contractEnd || !noticePeriodDays) return null;
	return addDays(contractEnd, -noticePeriodDays);
}
