import {
	nextAuditFor,
	type OrgAuditSettings,
	type RegisteredAudit,
} from "./audit-follow-up";

// Audit-Stand je Rahmenwerk für die Kacheln unter /rahmenwerke (pure, Test
// `framework-audit`): läuft gerade eins, steht das nächste an, oder ist
// keins geplant. Das nächste kommt aus dem Register und dem Turnus
// (`nextAuditFor`), nie aus einer gespeicherten Zahl.

export type FrameworkAuditState =
	| { kind: "running" }
	| {
			kind: "upcoming";
			date: string;
			unit: "days" | "weeks" | "months";
			n: number;
	  }
	| { kind: "none" };

const DAY = 86_400_000;

/** Abstand in der gröbsten sinnvollen Einheit: Tage bis 13, Wochen bis 8, sonst Monate */
export function auditDistance(
	today: string,
	date: string,
): { unit: "days" | "weeks" | "months"; n: number } {
	const days = Math.max(
		0,
		Math.round(
			(new Date(`${date}T00:00:00Z`).getTime() -
				new Date(`${today}T00:00:00Z`).getTime()) /
				DAY,
		),
	);
	if (days < 14) return { unit: "days", n: days };
	if (days < 60) return { unit: "weeks", n: Math.round(days / 7) };
	return { unit: "months", n: Math.max(2, Math.round(days / 30.44)) };
}

export function frameworkAuditStates(
	frameworks: readonly string[],
	settings: OrgAuditSettings,
	registered: readonly RegisteredAudit[],
	today: string,
): Map<string, FrameworkAuditState> {
	const next = nextAuditFor(frameworks, settings, today, registered);
	const out = new Map<string, FrameworkAuditState>();
	for (const fw of frameworks) {
		const running = registered.some(
			(a) => a.status === "in_progress" && a.frameworkIds.includes(fw),
		);
		const date = next[fw];
		out.set(
			fw,
			running
				? { kind: "running" }
				: date
					? { kind: "upcoming", date, ...auditDistance(today, date) }
					: { kind: "none" },
		);
	}
	return out;
}
