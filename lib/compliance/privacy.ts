import type { ClockState } from "./complaints";

// Datenschutz — reine Helfer: Betroffenenanfragen (Art. 12 Abs. 3 DSGVO:
// ein Monat, verlängerbar um zwei), Versicherungsablauf, Lücken im
// Verarbeitungsverzeichnis. Kein Rechtsrat.

export const DSR_MONTHS = 1;
export const DSR_EXTENSION_MONTHS = 2;
export const INSURANCE_WARN_DAYS = 60;
export const DSR_SOON_DAYS = 7;

// Kalendermonate (UTC), Tag auf Monatsende begrenzt (31.01. + 1 → 28./29.02.).
export function addMonths(d: Date, months: number): Date {
	const y = d.getUTCFullYear();
	const m = d.getUTCMonth() + months;
	const day = d.getUTCDate();
	const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
	return new Date(
		Date.UTC(
			y,
			m,
			Math.min(day, lastDay),
			d.getUTCHours(),
			d.getUTCMinutes(),
			d.getUTCSeconds(),
		),
	);
}

export function dsrDueAt(receivedAt: Date): Date {
	return addMonths(receivedAt, DSR_MONTHS);
}

export function dsrExtendedUntil(dueAt: Date): Date {
	return addMonths(dueAt, DSR_EXTENSION_MONTHS);
}

export type DsrLike = {
	dueAt: Date;
	extendedUntil: Date | null;
	completedAt: Date | null;
	status: "open" | "in_progress" | "done" | "rejected";
};

export function dsrEffectiveDue(
	r: Pick<DsrLike, "dueAt" | "extendedUntil">,
): Date {
	return r.extendedUntil ?? r.dueAt;
}

export function dsrClock(r: DsrLike, now: Date): ClockState {
	if (r.status === "done" || r.status === "rejected" || r.completedAt)
		return "done";
	const due = dsrEffectiveDue(r);
	const left = due.getTime() - now.getTime();
	if (left < 0) return "overdue";
	if (left <= DSR_SOON_DAYS * 86_400_000) return "soon";
	return "ok";
}

export function dsrStats(rows: readonly DsrLike[], now: Date) {
	let open = 0;
	let overdue = 0;
	let doneThisYear = 0;
	const durations: number[] = [];
	for (const r of rows) {
		const c = dsrClock(r, now);
		if (c === "overdue") overdue += 1;
		if (c !== "done") open += 1;
		if (r.completedAt) {
			if (r.completedAt.getFullYear() === now.getFullYear()) doneThisYear += 1;
			durations.push(
				(r.completedAt.getTime() -
					(r.dueAt.getTime() - DSR_MONTHS * 30 * 86_400_000)) /
					86_400_000,
			);
		}
	}
	return {
		total: rows.length,
		open,
		overdue,
		doneThisYear,
		avgDays:
			durations.length === 0
				? null
				: Math.round(
						(durations.reduce((a, b) => a + b, 0) / durations.length) * 10,
					) / 10,
	};
}

export type InsuranceState = "none" | "active" | "expiring" | "expired";

export function insuranceState(
	validUntil: string | null,
	now: Date,
	warnDays = INSURANCE_WARN_DAYS,
): InsuranceState {
	if (!validUntil) return "none";
	const until = new Date(`${validUntil}T23:59:59Z`);
	const days = (until.getTime() - now.getTime()) / 86_400_000;
	if (days < 0) return "expired";
	if (days <= warnDays) return "expiring";
	return "active";
}

export type ProcessingActivityLike = {
	id: string;
	name: string;
	legalBasis: string | null;
	retention: string | null;
	thirdCountryTransfer: string | null;
	dsfaRequired: boolean;
	dsfaEvidenceId: string | null;
	recipients: string[] | null;
};

export type VvtGap = {
	id: string;
	name: string;
	kind: "no_legal_basis" | "no_retention" | "dsfa_without_evidence";
};

// Lücken im Verzeichnis: ohne Rechtsgrundlage, ohne Löschfrist, DSFA-pflichtig
// ohne hinterlegte DSFA.
export function vvtGaps(rows: readonly ProcessingActivityLike[]): VvtGap[] {
	const gaps: VvtGap[] = [];
	for (const r of rows) {
		if (!r.legalBasis?.trim())
			gaps.push({ id: r.id, name: r.name, kind: "no_legal_basis" });
		if (!r.retention?.trim())
			gaps.push({ id: r.id, name: r.name, kind: "no_retention" });
		if (r.dsfaRequired && !r.dsfaEvidenceId)
			gaps.push({ id: r.id, name: r.name, kind: "dsfa_without_evidence" });
	}
	return gaps;
}
