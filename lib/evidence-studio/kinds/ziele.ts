import { and, asc, eq } from "drizzle-orm";
import { objectives } from "@/db/schema";
import { shortFrameworkName } from "@/lib/compliance/framework-names";
import { userNames } from "@/lib/compliance/queries";
import type { DocBlock } from "@/lib/export/doc-model";
import { fmtDay } from "../generate/doc";
import { generator } from "../generate/types";

// NW-ZIELE: freigegebene Ziele mit Kennzahl, Zielwert, Schwellen,
// Messintervall und Verantwortlichen (ISO 27001 6.2)
export type ZieleFacts = {
	objectives: {
		title: string;
		frameworks: string[];
		indicatorType: string;
		kpiName: string | null;
		target: string | null;
		targetValue: number | null;
		unit: string | null;
		direction: string;
		warnAt: number | null;
		alertAt: number | null;
		measureEveryMonths: number | null;
		owner: string | null;
		dueAt: string | null;
		status: string;
		approvedBy: string | null;
		approvedAt: string | null;
	}[];
};

export const INDICATOR_DE: Record<string, string> = {
	kpi: "KPI (Leistung)",
	kri: "KRI (Risiko)",
	kci: "KCI (Kontrolle)",
};
const STATUS_DE: Record<string, string> = {
	open: "offen",
	on_track: "im Plan",
	at_risk: "gefährdet",
	achieved: "erreicht",
	dropped: "aufgegeben",
};

const num = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 2 });
export const withUnit = (v: number | null, unit: string | null) =>
	v === null ? "—" : `${num.format(v)}${unit ? ` ${unit}` : ""}`;

export function buildZiele(f: ZieleFacts, ctx: { today: string }) {
	const active = f.objectives.filter(
		(o) => o.status !== "achieved" && o.status !== "dropped",
	);
	const blocks: DocBlock[] = [
		{
			type: "paragraph",
			text: "Aufgeführt sind die von der Leitung freigegebenen Ziele. Jedes Ziel ist messbar, hat Verantwortliche, einen Termin und ein Messintervall; Frühwarn- und Alarmschwelle lösen eine Eskalation aus.",
		},
		{
			type: "keyValue",
			items: [
				["Ziele gesamt", String(f.objectives.length)],
				["aktiv", String(active.length)],
				[
					"erreicht",
					String(f.objectives.filter((o) => o.status === "achieved").length),
				],
				[
					"gefährdet",
					String(f.objectives.filter((o) => o.status === "at_risk").length),
				],
				[
					"Termin überschritten",
					String(active.filter((o) => o.dueAt && o.dueAt < ctx.today).length),
				],
			],
		},
		{ type: "heading", level: 1, text: "Ziele" },
		{
			type: "table",
			columns: [
				{ label: "Ziel", width: 24 },
				{ label: "Kennzahl", width: 18 },
				{ label: "Zielwert / Schwellen", width: 18 },
				{ label: "Messung", width: 10 },
				{ label: "Verantwortlich / Termin", width: 16 },
				{ label: "Stand", width: 10 },
			],
			rows: f.objectives.map((o) => [
				`${o.title}${o.frameworks.length ? `\n${o.frameworks.map(shortFrameworkName).join(", ")}` : ""}`,
				[INDICATOR_DE[o.indicatorType] ?? o.indicatorType, o.kpiName]
					.filter(Boolean)
					.join("\n"),
				[
					o.targetValue !== null
						? `Ziel ${o.direction === "lower_better" ? "≤" : "≥"} ${withUnit(o.targetValue, o.unit)}`
						: (o.target ?? ""),
					o.warnAt !== null ? `Frühwarnung ${withUnit(o.warnAt, o.unit)}` : "",
					o.alertAt !== null ? `Alarm ${withUnit(o.alertAt, o.unit)}` : "",
				]
					.filter(Boolean)
					.join("\n"),
				o.measureEveryMonths
					? o.measureEveryMonths === 1
						? "monatlich"
						: `alle ${o.measureEveryMonths} Monate`
					: "",
				`${o.owner ?? "—"}\n${fmtDay(o.dueAt)}`,
				STATUS_DE[o.status] ?? o.status,
			]),
			empty: "Keine freigegebenen Ziele.",
		},
	];
	return { blocks };
}

export const ziele = generator<ZieleFacts>({
	code: "NW-ZIELE",
	async load(tx, orgId) {
		const rows = await tx
			.select()
			.from(objectives)
			.where(
				and(
					eq(objectives.organizationId, orgId),
					eq(objectives.approvalStatus, "approved"),
				),
			)
			.orderBy(asc(objectives.title));
		const names = await userNames(
			tx,
			rows.flatMap((r) => [r.ownerUserId, r.approvedByUserId]),
		);
		const name = (id: string | null) => (id ? (names.get(id) ?? null) : null);
		return {
			objectives: rows.map((r) => ({
				title: r.title,
				frameworks: r.frameworkIds ?? [],
				indicatorType: r.indicatorType,
				kpiName: r.kpiName,
				target: r.target,
				targetValue: r.targetValue,
				unit: r.unit,
				direction: r.direction,
				warnAt: r.warnAt,
				alertAt: r.alertAt,
				measureEveryMonths: r.measureEveryMonths,
				owner: name(r.ownerUserId),
				dueAt: r.dueAt,
				status: r.status,
				approvedBy: name(r.approvedByUserId),
				approvedAt: r.approvedAt
					? r.approvedAt.toISOString().slice(0, 10)
					: null,
			})),
		};
	},
	build: buildZiele,
});
