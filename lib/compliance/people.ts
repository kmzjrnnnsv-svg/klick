import type { PersonLoad } from "./report";

// Personen (/team, pure, Test `people`): Ansicht aus der URL, offene Punkte
// je Person eingeordnet, Erinnern höchstens einmal in 24 Stunden.

export const TEAM_VIEWS = ["offen", "alle", "eingeladen", "extern"] as const;
export type TeamView = (typeof TEAM_VIEWS)[number];

export function teamView(v: string | undefined): TeamView {
	return (TEAM_VIEWS as readonly string[]).includes(v ?? "")
		? (v as TeamView)
		: "alle";
}

export type DueStatus = {
	overdue: number;
	soon: number;
	// überfällig vor bald fällig vor nichts
	level: "overdue" | "soon" | "none";
};

export function personDueStatus(
	load: Pick<PersonLoad, "overdue" | "soon"> | undefined,
): DueStatus {
	const overdue = load?.overdue ?? 0;
	const soon = load?.soon ?? 0;
	return {
		overdue,
		soon,
		level: overdue > 0 ? "overdue" : soon > 0 ? "soon" : "none",
	};
}

export const REMIND_INTERVAL_MS = 24 * 60 * 60 * 1000;

/** Erinnern geht wieder, wenn die letzte Erinnerung 24 h zurückliegt */
export function remindAllowed(
	last: Date | null | undefined,
	now: Date,
): boolean {
	return !last || now.getTime() - last.getTime() >= REMIND_INTERVAL_MS;
}

/** Suche über Name und E-Mail, ohne Groß/Klein */
export function matchesPerson(
	p: { name: string | null; email: string },
	q: string | undefined,
): boolean {
	const needle = q?.trim().toLowerCase();
	if (!needle) return true;
	return `${p.name ?? ""} ${p.email}`.toLowerCase().includes(needle);
}
