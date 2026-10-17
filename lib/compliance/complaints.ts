import {
	addDaysIso,
	berlinDate,
	endOfBerlinDay,
	monthsDeadline,
} from "@/lib/time/berlin";
import { nthWorkdayAfter } from "@/lib/time/holidays";

// Beschwerden (MiCAR Art. 71, DelVO 2025/1141; ZAG § 62) und Hinweisgeber-
// meldungen (HinSchG § 17; MiCAR Art. 116; GwG § 6 Abs. 5): Fristen, Codes,
// Uhrenstatus. Pure, getestet. Keine Identitätsdaten — Pseudonyme werden
// feldverschlüsselt gespeichert.

const DAY = 86_400_000;

export const COMPLAINT_ACK_DAYS = 5; // unverzüglich — fünf Arbeitstage
export const COMPLAINT_RESPONSE_MONTHS = 2; // DelVO 2025/1141 Art. 7
export const WB_ACK_DAYS = 7; // HinSchG § 17 Abs. 1 Nr. 1
export const WB_FEEDBACK_MONTHS = 3; // HinSchG § 17 Abs. 2

// Monatsfristen nach BGB (Monatsende geklemmt, Ende des Berliner Tages):
// 30.11. + 3 Monate = 28./29.02., nicht 02.03.
const addMonths = monthsDeadline;

export function complaintDeadlines(receivedAt: Date): {
	ackDueAt: Date;
	responseDueAt: Date;
} {
	return {
		ackDueAt: endOfBerlinDay(
			nthWorkdayAfter(berlinDate(receivedAt), COMPLAINT_ACK_DAYS),
		),
		responseDueAt: addMonths(receivedAt, COMPLAINT_RESPONSE_MONTHS),
	};
}

export function whistleblowingDeadlines(receivedAt: Date): {
	ackDueAt: Date;
	feedbackDueAt: Date;
} {
	return {
		// HinSchG § 17 Abs. 1 Nr. 1: spätestens nach sieben Tagen
		ackDueAt: endOfBerlinDay(addDaysIso(berlinDate(receivedAt), WB_ACK_DAYS)),
		feedbackDueAt: addMonths(receivedAt, WB_FEEDBACK_MONTHS),
	};
}

export type ClockState = "done" | "ok" | "soon" | "overdue";

// Uhr: erledigt, wenn `doneAt` gesetzt; sonst Zustand relativ zur Frist.
export function clockState(
	dueAt: Date | null,
	doneAt: Date | null,
	now: Date,
	soonHours = 48,
): ClockState {
	if (doneAt) return "done";
	if (!dueAt) return "ok";
	const left = dueAt.getTime() - now.getTime();
	if (left < 0) return "overdue";
	if (left <= soonHours * 3_600_000) return "soon";
	return "ok";
}

export function nextCaseCode(
	existing: readonly string[],
	prefix: "BES" | "HIN",
	now = new Date(),
): string {
	const head = `${prefix}-${now.getFullYear()}-`;
	const max = existing
		.filter((c) => c.startsWith(head))
		.map((c) => Number.parseInt(c.slice(head.length), 10))
		.filter((n) => Number.isFinite(n))
		.reduce((m, n) => Math.max(m, n), 0);
	return `${head}${String(max + 1).padStart(3, "0")}`;
}

// Aggregierte Sicht ohne Details (Prüfer:innen ohne Grant, Managementbewertung).
export function aggregateCases<
	T extends {
		status: string;
		receivedAt: Date;
		ackDueAt: Date | null;
		acknowledgedAt: Date | null;
	},
>(
	rows: readonly T[],
	now: Date,
	finalDue: (r: T) => Date | null,
	finalDone: (r: T) => Date | null,
): {
	total: number;
	open: number;
	ackOverdue: number;
	responseOverdue: number;
	last90Days: number;
} {
	const ninety = now.getTime() - 90 * DAY;
	return {
		total: rows.length,
		open: rows.filter((r) => r.status !== "closed").length,
		ackOverdue: rows.filter(
			(r) => clockState(r.ackDueAt, r.acknowledgedAt, now) === "overdue",
		).length,
		responseOverdue: rows.filter(
			(r) =>
				r.status !== "closed" &&
				clockState(finalDue(r), finalDone(r), now) === "overdue",
		).length,
		last90Days: rows.filter((r) => r.receivedAt.getTime() >= ninety).length,
	};
}
