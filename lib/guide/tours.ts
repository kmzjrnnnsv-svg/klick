// Geführte Touren als Daten (selbst gebaut, keine Fremdbibliothek — CSP und
// Lieferkette bleiben unverändert). Ziele sind `[data-tour="…"]`-Elemente;
// fehlt eines, wird der Schritt übersprungen. Texte: Guide.<tour>_<step>_title
// und Guide.<tour>_<step>_body.

export type TourStep = { target: string; key: string };
export type Tour = {
	key: string;
	path: string;
	// nur auf diesem Reiter (?tab=…)
	tab?: string;
	steps: readonly TourStep[];
};

export const TOURS: readonly Tour[] = [
	{
		key: "heute",
		path: "/heute",
		steps: [
			{ target: "next-step", key: "next" },
			{ target: "journey-chip", key: "chip" },
			{ target: "page-actions", key: "task" },
		],
	},
	{
		key: "team",
		path: "/team",
		steps: [
			{ target: "page-actions", key: "invite" },
			{ target: "rights", key: "rights" },
			{ target: "members", key: "members" },
		],
	},
	{
		key: "rollen",
		path: "/organisation",
		tab: "rollen",
		steps: [
			{ target: "new-assignment", key: "assign" },
			{ target: "required-functions", key: "required" },
		],
	},
	{
		key: "dokumente",
		path: "/dokumente",
		steps: [
			{ target: "page-actions", key: "new" },
			{ target: "register-filters", key: "filters" },
			{ target: "register-table", key: "table" },
		],
	},
	{
		key: "controls",
		path: "/controls",
		steps: [
			{ target: "register-filters", key: "filters" },
			{ target: "register-table", key: "table" },
		],
	},
	{
		key: "risiken",
		path: "/risiken",
		steps: [
			{ target: "page-actions", key: "new" },
			{ target: "url-tabs", key: "tabs" },
		],
	},
];

export function tourFor(pathname: string, tab: string | null): Tour | null {
	return (
		TOURS.find(
			(t) => t.path === pathname && (!t.tab || (tab ?? "") === t.tab),
		) ?? null
	);
}

export function tourByKey(key: string): Tour | null {
	return TOURS.find((t) => t.key === key) ?? null;
}

// Nächster Schritt der Etappen → passende Tour („Zeig mir wie“).
export const TOUR_FOR_STEP: Partial<Record<string, string>> = {
	team: "team",
	roles: "rollen",
	policy: "dokumente",
	owners: "controls",
	controls: "controls",
	risks: "risiken",
};
