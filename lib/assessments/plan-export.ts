import type { DocBlock } from "@/lib/export/doc-model";
import type { MeasureKind } from "./measures";
import type { FrameworkReadiness, Schedule } from "./schedule";

// Umsetzungsplan als Export (Teil C2, rein): Spur-Namen, CSV-Zeilen, Abschnitt
// im Gap-Bericht und Blöcke fürs PDF. Seite und Routen nutzen dieselben
// Namen; die Rechnung bleibt in schedule.ts.

export type LaneLabelDeps = {
	// Funktion (auch role:<id>) → Name
	fn: (key: string) => string;
	member: (userId: string) => string | undefined;
	// Bereich ohne Verantwortliche:n → „Ohne Zuständigkeit (Bereich)“
	area: (area: string) => string;
	person: string;
};

export function laneLabelFor(lane: string, deps: LaneLabelDeps): string {
	if (lane.startsWith("f:")) return deps.fn(lane.slice(2));
	if (lane.startsWith("u:")) return deps.member(lane.slice(2)) ?? deps.person;
	return deps.area(lane.slice(2));
}

export const KIND_LABEL: Record<MeasureKind, string> = {
	implement: "umsetzen",
	clarify: "klären",
	evidence: "belegen",
};

const deDate = (iso: string) => {
	const [y, m, d] = iso.split("-");
	return `${d}.${m}.${y}`;
};

export type PlanExportInput = {
	schedule: Schedule;
	readiness: readonly FrameworkReadiness[];
	title: (code: string) => string;
	laneLabel: (lane: string) => string;
	frameworkName: (slug: string) => string;
};

// Zeilen in Plan-Reihenfolge (Beginn, dann Code)
function ordered(schedule: Schedule) {
	return [...schedule.items].sort(
		(a, b) =>
			a.startDay - b.startDay || a.controlCode.localeCompare(b.controlCode),
	);
}

export const PLAN_CSV_HEADER = [
	"control",
	"massnahme",
	"art",
	"beginn",
	"ende",
	"arbeitstage",
	"dauer",
	"zustaendig",
	"nach",
] as const;

export function planCsvRows(input: PlanExportInput): string[][] {
	return ordered(input.schedule).map((i) => [
		i.controlCode,
		input.title(i.controlCode),
		KIND_LABEL[i.kind],
		i.start,
		i.end,
		String(i.days),
		i.overridden ? "eigene" : "geschätzt",
		input.laneLabel(i.lane),
		i.after.join(" "),
	]);
}

function readinessLine(r: FrameworkReadiness, name: string): string {
	if (r.readyDay === 0) return `${name}: ohne offene Maßnahme`;
	const when = r.readyAt ? `bereit ab ${deDate(r.readyAt)}` : "nicht erreicht";
	const rest = [
		`${r.measures} Maßnahmen`,
		r.chain.length > 0 ? `längste Kette ${r.chain.join(", ")}` : "",
		r.missing > 0 ? `${r.missing} Anforderungen ohne Maßnahme im Plan` : "",
	].filter(Boolean);
	return `${name}: ${when} (${rest.join(", ")})`;
}

// Abschnitt im Gap-Bericht (Markdown)
export function planMarkdownLines(input: PlanExportInput): string[] {
	const s = input.schedule;
	const cell = (v: string) => v.replaceAll("|", "\\|");
	if (s.items.length === 0)
		return ["## Umsetzungsplan", "", "Keine offenen Maßnahmen.", ""];
	const lines = [
		"## Umsetzungsplan",
		"",
		`Beginn ${deDate(s.start)}, Ende ${deDate(s.end ?? s.start)}, ${s.items.length} Maßnahmen in ${s.workdays} Arbeitstagen (Mo–Fr, Feiertage nicht berücksichtigt). Schätzung, kein Versprechen.`,
		"",
		...input.readiness.map(
			(r) => `- ${readinessLine(r, input.frameworkName(r.slug))}`,
		),
		"",
		"| Control | Maßnahme | Art | Beginn | Ende | Tage | Zuständig | Nach |",
		"|---|---|---|---|---|---|---|---|",
	];
	for (const i of ordered(s))
		lines.push(
			`| ${i.controlCode} | ${cell(input.title(i.controlCode))} | ${KIND_LABEL[i.kind]} | ${deDate(i.start)} | ${deDate(i.end)} | ${i.days}${i.overridden ? " (eigene)" : ""} | ${cell(input.laneLabel(i.lane))} | ${i.after.join(", ")} |`,
		);
	lines.push("");
	return lines;
}

// PDF: Kopfzahlen, Bereitschaft je Rahmenwerk, Balkenplan, Tabelle
export function planDocBlocks(input: PlanExportInput): DocBlock[] {
	const s = input.schedule;
	if (s.items.length === 0)
		return [{ type: "paragraph", text: "Keine offenen Maßnahmen." }];
	const end = s.end ?? s.start;
	const items = ordered(s);
	const byLane = new Map<string, typeof items>();
	for (const i of items) {
		const list = byLane.get(i.lane) ?? [];
		list.push(i);
		byLane.set(i.lane, list);
	}
	return [
		{
			type: "keyValue",
			items: [
				["Beginn", deDate(s.start)],
				["Ende", deDate(end)],
				["Maßnahmen", String(s.items.length)],
				["Arbeitstage", `${s.workdays} (Mo–Fr, ohne Feiertage)`],
			],
		},
		{ type: "heading", level: 2, text: "Bereit je Rahmenwerk" },
		{
			type: "list",
			items: input.readiness.map((r) =>
				readinessLine(r, input.frameworkName(r.slug)),
			),
		},
		{ type: "heading", level: 2, text: "Balkenplan" },
		{
			type: "gantt",
			start: s.start,
			end,
			groups: [...byLane].map(([lane, list]) => ({
				label: input.laneLabel(lane),
				rows: list.map((i) => ({
					label: `${i.controlCode} ${input.title(i.controlCode)}`,
					start: i.start,
					end: i.end,
					shade: i.kind,
				})),
			})),
			legend: [
				["implement", "Umsetzen"],
				["clarify", "Klären"],
				["evidence", "Belegen"],
			],
		},
		{ type: "heading", level: 2, text: "Maßnahmen im Einzelnen" },
		{
			type: "table",
			columns: [
				{ label: "Control", width: 9 },
				{ label: "Maßnahme", width: 30 },
				{ label: "Art", width: 8 },
				{ label: "Beginn", width: 9 },
				{ label: "Ende", width: 9 },
				{ label: "Tage", width: 5 },
				{ label: "Zuständig", width: 18 },
				{ label: "Nach", width: 12 },
			],
			rows: items.map((i) => [
				i.controlCode,
				input.title(i.controlCode),
				KIND_LABEL[i.kind],
				deDate(i.start),
				deDate(i.end),
				`${i.days}${i.overridden ? " (eigene)" : ""}`,
				input.laneLabel(i.lane),
				i.after.join(", "),
			]),
		},
		{
			type: "paragraph",
			muted: true,
			text: "Schätzung aus dem Aufwand je Maßnahme (S 5, M 15, L 40 Arbeitstage; teilweise umgesetzt halb so lang; Richtlinie mit Freigabe 5 Tage mehr). Ein Rahmenwerk ist bereit, wenn jede Anforderung eine fertige volle Maßnahme hat oder alle ihre teilweisen fertig sind.",
		},
	];
}
