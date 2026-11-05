import type {
	IsmsItem,
	IsmsSource,
} from "@/lib/compliance/catalog/isms-programme";

// Stand je Punkt des ISMS-Jahresplans (P2a, pure): aus dem, was in Klick
// schon steht (Dokumente, Bestellung, Register, Audits …). „ok“ = erledigt
// im laufenden Turnus, „due“ = fällig oder überfällig, „open“ = fehlt noch,
// „none“ = Klick kennt keinen Stand, du trägst ihn selbst nach.

export type IsmsState = "ok" | "due" | "open" | "none";

export type IsmsStatus = {
	state: IsmsState;
	// Textschlüssel `IsmsPlan.status_<code>`
	code: string;
	n?: number;
	m?: number;
	date?: string | null;
};

export type DocFact = {
	// gültige Fassung vorhanden
	valid: boolean;
	nextReviewAt: string | null;
};

export type IsmsFacts = {
	// YYYY-MM-DD
	today: string;
	// Dokumente je Vorlagen-Code (ohne zurückgezogene)
	documents: Record<string, DocFact[]>;
	isbAppointed: boolean;
	risks: { total: number; current: number };
	bia: { critical: number; current: number };
	bcmPlans: { critical: number; released: number; overdue: number };
	exercises: { lastDone: string | null; planned: number };
	audits: {
		internal: { lastDone: string | null; next: string | null };
		external: { lastDone: string | null; next: string | null };
	};
	managementReview: { lastHeld: string | null; next: string | null };
	kpis: { approved: number; measured: number };
	nonconformities: { open: number; overdue: number };
	suppliers: { running: number; overdue: number };
	trainings: { open: number; overdue: number };
	incidents: { open: number };
	changes: { pending: number };
};

// Datum ein Jahr vor `today` (YYYY-MM-DD)
export function yearBefore(today: string): string {
	const d = new Date(`${today}T00:00:00Z`);
	d.setUTCFullYear(d.getUTCFullYear() - 1);
	return d.toISOString().slice(0, 10);
}

function documentsStatus(
	templates: readonly string[] | undefined,
	facts: IsmsFacts,
): IsmsStatus {
	if (!templates?.length) return { state: "none", code: "manual" };
	let valid = 0;
	let due: string | null = null;
	let next: string | null = null;
	for (const code of templates) {
		const docs = facts.documents[code] ?? [];
		const current = docs.filter((d) => d.valid);
		if (current.length === 0) continue;
		valid += 1;
		for (const d of current) {
			if (!d.nextReviewAt) continue;
			if (d.nextReviewAt < facts.today) {
				if (!due || d.nextReviewAt < due) due = d.nextReviewAt;
			} else if (!next || d.nextReviewAt < next) next = d.nextReviewAt;
		}
	}
	const m = templates.length;
	if (valid === 0) {
		const drafts = templates.some((c) => (facts.documents[c] ?? []).length);
		return { state: "open", code: drafts ? "doc_draft" : "doc_missing" };
	}
	if (due) return { state: "due", code: "doc_review_due", date: due };
	if (valid < m) return { state: "open", code: "docs_partial", n: valid, m };
	return next
		? { state: "ok", code: "doc_valid", date: next }
		: { state: "ok", code: "doc_valid_open" };
}

// Turnus: ein Jahr; erledigt, wenn das Letzte im laufenden Jahr liegt
function yearly(
	last: string | null,
	next: string | null,
	facts: IsmsFacts,
	code: string,
): IsmsStatus {
	if (last && last >= yearBefore(facts.today))
		return { state: "ok", code: `${code}_done`, date: last };
	if (next && next >= facts.today)
		return { state: "open", code: `${code}_planned`, date: next };
	if (last) return { state: "due", code: `${code}_due`, date: last };
	return { state: "open", code: `${code}_none` };
}

const BY_SOURCE: Record<
	Exclude<IsmsSource, "documents">,
	(f: IsmsFacts) => IsmsStatus
> = {
	appointment: (f) =>
		f.isbAppointed
			? { state: "ok", code: "isb_appointed" }
			: { state: "open", code: "isb_missing" },
	risks: (f) => {
		if (f.risks.total === 0) return { state: "open", code: "risks_none" };
		if (f.risks.current < f.risks.total)
			return {
				state: "due",
				code: "risks_stale",
				n: f.risks.total - f.risks.current,
				m: f.risks.total,
			};
		return { state: "ok", code: "risks_current", n: f.risks.total };
	},
	bia: (f) => {
		if (f.bia.critical === 0) return { state: "open", code: "bia_no_critical" };
		if (f.bia.current < f.bia.critical)
			return {
				state: f.bia.current === 0 ? "open" : "due",
				code: "bia_partial",
				n: f.bia.current,
				m: f.bia.critical,
			};
		return { state: "ok", code: "bia_current", n: f.bia.critical };
	},
	bcm_plans: (f) => {
		if (f.bcmPlans.critical === 0)
			return { state: "open", code: "bia_no_critical" };
		if (f.bcmPlans.overdue > 0)
			return { state: "due", code: "plans_overdue", n: f.bcmPlans.overdue };
		if (f.bcmPlans.released < f.bcmPlans.critical)
			return {
				state: "open",
				code: "plans_partial",
				n: f.bcmPlans.released,
				m: f.bcmPlans.critical,
			};
		return { state: "ok", code: "plans_released", n: f.bcmPlans.released };
	},
	exercises: (f) => {
		if (f.exercises.lastDone && f.exercises.lastDone >= yearBefore(f.today))
			return { state: "ok", code: "exercise_done", date: f.exercises.lastDone };
		if (f.exercises.planned > 0)
			return {
				state: "open",
				code: "exercise_planned",
				n: f.exercises.planned,
			};
		if (f.exercises.lastDone)
			return { state: "due", code: "exercise_due", date: f.exercises.lastDone };
		return { state: "open", code: "exercise_none" };
	},
	internal_audit: (f) =>
		yearly(f.audits.internal.lastDone, f.audits.internal.next, f, "audit"),
	external_audit: (f) =>
		yearly(f.audits.external.lastDone, f.audits.external.next, f, "audit"),
	management_review: (f) =>
		yearly(f.managementReview.lastHeld, f.managementReview.next, f, "review"),
	kpis: (f) => {
		if (f.kpis.approved === 0) return { state: "open", code: "kpis_none" };
		if (f.kpis.measured < f.kpis.approved)
			return {
				state: "due",
				code: "kpis_partial",
				n: f.kpis.measured,
				m: f.kpis.approved,
			};
		return { state: "ok", code: "kpis_measured", n: f.kpis.approved };
	},
	nonconformities: (f) => {
		if (f.nonconformities.overdue > 0)
			return {
				state: "due",
				code: "nc_overdue",
				n: f.nonconformities.overdue,
				m: f.nonconformities.open,
			};
		return { state: "ok", code: "nc_open", n: f.nonconformities.open };
	},
	suppliers: (f) => {
		if (f.suppliers.running === 0)
			return { state: "open", code: "suppliers_none" };
		if (f.suppliers.overdue > 0)
			return {
				state: "due",
				code: "suppliers_overdue",
				n: f.suppliers.overdue,
			};
		return { state: "ok", code: "suppliers_current", n: f.suppliers.running };
	},
	trainings: (f) => {
		if (f.trainings.overdue > 0)
			return {
				state: "due",
				code: "trainings_overdue",
				n: f.trainings.overdue,
			};
		return { state: "ok", code: "trainings_open", n: f.trainings.open };
	},
	incidents: (f) => ({
		state: "ok",
		code: "incidents_open",
		n: f.incidents.open,
	}),
	changes: (f) => ({
		state: "ok",
		code: "changes_pending",
		n: f.changes.pending,
	}),
};

export function ismsStatus(
	item: Pick<IsmsItem, "source" | "templates">,
	facts: IsmsFacts,
): IsmsStatus {
	if (!item.source) return { state: "none", code: "manual" };
	if (item.source === "documents")
		return documentsStatus(item.templates, facts);
	return BY_SOURCE[item.source](facts);
}

export type StateCounts = Record<IsmsState, number>;

export function countStates(statuses: readonly IsmsStatus[]): StateCounts {
	const out: StateCounts = { ok: 0, due: 0, open: 0, none: 0 };
	for (const s of statuses) out[s.state] += 1;
	return out;
}
