// TLPT-Uhr (DORA Art. 26, RTS 2025/1190): nur für von der BaFin benannte
// Unternehmen; mindestens alle drei Jahre. Ohne Benennung: Anforderung
// nicht anwendbar („Negativnachweis"), keine Uhr.

export const TLPT_CYCLE_YEARS = 3;
export const TLPT_SOON_DAYS = 180;

export type TlptState = "not_applicable" | "never" | "ok" | "soon" | "overdue";

export type TlptStatus = {
	state: TlptState;
	dueAt: Date | null;
	daysLeft: number | null;
};

export function tlptStatus(input: {
	designated: boolean;
	lastTlptAt: Date | string | null;
	now?: Date;
}): TlptStatus {
	const now = input.now ?? new Date();
	if (!input.designated)
		return { state: "not_applicable", dueAt: null, daysLeft: null };
	if (!input.lastTlptAt) return { state: "never", dueAt: null, daysLeft: null };
	const last = new Date(input.lastTlptAt);
	const due = new Date(last);
	due.setFullYear(due.getFullYear() + TLPT_CYCLE_YEARS);
	const daysLeft = Math.ceil((due.getTime() - now.getTime()) / 86_400_000);
	const state: TlptState =
		daysLeft < 0 ? "overdue" : daysLeft <= TLPT_SOON_DAYS ? "soon" : "ok";
	return { state, dueAt: due, daysLeft };
}
