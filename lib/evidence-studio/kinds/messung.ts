import { and, asc, eq, inArray } from "drizzle-orm";
import { kpiMeasurements, objectives } from "@/db/schema";
import {
	type IndicatorDirection,
	indicatorState,
	valueState,
} from "@/lib/compliance/indicators";
import type { DocBlock } from "@/lib/export/doc-model";
import { fmtDay } from "../generate/doc";
import { generator } from "../generate/types";
import { withUnit } from "./ziele";

// NW-MESSUNG: Messergebnisse je freigegebenem Ziel mit Bewertung gegen
// Zielwert und Schwellen (ISO 27001 9.1)
export type MessungFacts = {
	objectives: {
		title: string;
		kpiName: string | null;
		unit: string | null;
		direction: IndicatorDirection;
		targetValue: number | null;
		warnAt: number | null;
		alertAt: number | null;
		nextMeasureAt: string | null;
		measurements: {
			measuredAt: string;
			value: string;
			numericValue: number | null;
			note: string | null;
		}[];
	}[];
};

const STATE_DE: Record<string, string> = {
	ok: "im Ziel",
	warn: "Frühwarnung",
	alert: "Alarm",
	overdue_measurement: "Messung überfällig",
	no_data: "noch keine Messung",
};
const TREND_DE: Record<string, string> = {
	better: "besser",
	worse: "schlechter",
	flat: "gleich",
};

// je Ziel höchstens so viele Messungen im Verlauf
const HISTORY = 12;

export function buildMessung(f: MessungFacts, ctx: { today: string }) {
	const evaluated = f.objectives.map((o) => ({
		o,
		s: indicatorState(o, o.measurements, ctx.today),
	}));
	const count = (st: string) =>
		evaluated.filter((x) => x.s.state === st).length;
	const blocks: DocBlock[] = [
		{
			type: "keyValue",
			items: [
				["Ziele mit Kennzahl", String(f.objectives.length)],
				["im Ziel", String(count("ok"))],
				["Frühwarnung", String(count("warn"))],
				["Alarm", String(count("alert"))],
				[
					"ohne aktuelle Messung",
					String(count("overdue_measurement") + count("no_data")),
				],
			],
		},
		{ type: "heading", level: 1, text: "Übersicht" },
		{
			type: "table",
			columns: [
				{ label: "Ziel / Kennzahl", width: 34 },
				{ label: "Letzter Wert", width: 14 },
				{ label: "Bewertung", width: 16 },
				{ label: "Trend", width: 10 },
				{ label: "Nächste Messung", width: 14 },
			],
			rows: evaluated.map(({ o, s }) => [
				[o.title, o.kpiName].filter(Boolean).join("\n"),
				withUnit(s.latest, o.unit),
				STATE_DE[s.state] ?? s.state,
				s.trend ? TREND_DE[s.trend] : "",
				fmtDay(o.nextMeasureAt),
			]),
			empty: "Keine freigegebenen Ziele mit Kennzahl.",
		},
	];
	for (const { o } of evaluated) {
		if (o.measurements.length === 0) continue;
		const recent = [...o.measurements]
			.sort((a, b) => b.measuredAt.localeCompare(a.measuredAt))
			.slice(0, HISTORY);
		blocks.push(
			{ type: "heading", level: 2, text: o.title },
			{
				type: "table",
				columns: [
					{ label: "Datum", width: 12 },
					{ label: "Wert", width: 14 },
					{ label: "Bewertung", width: 14 },
					{ label: "Notiz", width: 40 },
				],
				rows: recent.map((m) => [
					fmtDay(m.measuredAt),
					m.value,
					m.numericValue === null
						? ""
						: STATE_DE[valueState(m.numericValue, o)],
					m.note ?? "",
				]),
			},
		);
	}
	return { blocks };
}

export const messung = generator<MessungFacts>({
	code: "NW-MESSUNG",
	async load(tx, orgId) {
		const objs = await tx
			.select()
			.from(objectives)
			.where(
				and(
					eq(objectives.organizationId, orgId),
					eq(objectives.approvalStatus, "approved"),
				),
			)
			.orderBy(asc(objectives.title));
		const ms =
			objs.length === 0
				? []
				: await tx
						.select()
						.from(kpiMeasurements)
						.where(
							and(
								eq(kpiMeasurements.organizationId, orgId),
								inArray(
									kpiMeasurements.objectiveId,
									objs.map((o) => o.id),
								),
							),
						)
						.orderBy(asc(kpiMeasurements.measuredAt));
		return {
			objectives: objs.map((o) => ({
				title: o.title,
				kpiName: o.kpiName,
				unit: o.unit,
				direction: o.direction,
				targetValue: o.targetValue,
				warnAt: o.warnAt,
				alertAt: o.alertAt,
				nextMeasureAt: o.nextMeasureAt,
				measurements: ms
					.filter((m) => m.objectiveId === o.id)
					.map((m) => ({
						measuredAt: m.measuredAt,
						value: m.value,
						numericValue: m.numericValue,
						note: m.note,
					})),
			})),
		};
	},
	build: buildMessung,
});
