import { and, asc, eq, ne } from "drizzle-orm";
import { risks } from "@/db/schema";
import { userNames } from "@/lib/compliance/queries";
import { listRiskMeasures } from "@/lib/compliance/queries-p2";
import type { DocBlock } from "@/lib/export/doc-model";
import { fmtDay } from "../generate/doc";
import { generator } from "../generate/types";

// NW-BEHANDLUNGSPLAN: Maßnahmen je Risiko mit Stand aus der Aufgabe,
// Risiken ohne Maßnahme und akzeptierte Risiken (ISO 27001 6.1.3, 8.3)
export type BehandlungsplanFacts = {
	measures: {
		riskCode: string;
		riskTitle: string;
		title: string;
		owner: string | null;
		dueAt: string | null;
		costEur: number | null;
		// Stand aus der Aufgabe (planned | in_progress | done | dropped)
		status: string;
	}[];
	withoutMeasure: { code: string; title: string; owner: string | null }[];
	accepted: {
		code: string;
		title: string;
		reason: string | null;
		acceptedBy: string | null;
		acceptedAt: string | null;
		reviewAt: string | null;
	}[];
};

const MEASURE_STATUS_DE: Record<string, string> = {
	planned: "geplant",
	in_progress: "in Umsetzung",
	done: "umgesetzt",
	dropped: "verworfen",
};

const euro = new Intl.NumberFormat("de-DE", {
	style: "currency",
	currency: "EUR",
	maximumFractionDigits: 0,
});

export function buildBehandlungsplan(
	f: BehandlungsplanFacts,
	ctx: { today: string },
) {
	const open = f.measures.filter(
		(m) => m.status !== "done" && m.status !== "dropped",
	);
	const overdue = open.filter((m) => m.dueAt && m.dueAt < ctx.today);
	const blocks: DocBlock[] = [
		{
			type: "keyValue",
			items: [
				["Maßnahmen gesamt", String(f.measures.length)],
				[
					"umgesetzt",
					String(f.measures.filter((m) => m.status === "done").length),
				],
				["offen", String(open.length)],
				["überfällig", String(overdue.length)],
				["Risiken ohne Maßnahme", String(f.withoutMeasure.length)],
				["akzeptierte Risiken", String(f.accepted.length)],
			],
		},
		{ type: "heading", level: 1, text: "Maßnahmen" },
		{
			type: "table",
			columns: [
				{ label: "Risiko", width: 22 },
				{ label: "Maßnahme", width: 34 },
				{ label: "Verantwortlich", width: 16 },
				{ label: "Frist", width: 11 },
				{ label: "Kosten", width: 9 },
				{ label: "Stand", width: 12 },
			],
			rows: f.measures.map((m) => [
				`${m.riskCode} ${m.riskTitle}`,
				m.title,
				m.owner ?? "",
				fmtDay(m.dueAt),
				m.costEur === null ? "" : euro.format(m.costEur),
				MEASURE_STATUS_DE[m.status] ?? m.status,
			]),
			empty: "Noch keine Maßnahmen geplant.",
		},
	];
	if (f.withoutMeasure.length > 0)
		blocks.push(
			{ type: "heading", level: 1, text: "Zu mindernde Risiken ohne Maßnahme" },
			{
				type: "table",
				columns: [
					{ label: "Nr.", width: 12 },
					{ label: "Risiko", width: 55 },
					{ label: "Verantwortlich", width: 22 },
				],
				rows: f.withoutMeasure.map((r) => [r.code, r.title, r.owner ?? ""]),
			},
		);
	blocks.push(
		{ type: "heading", level: 1, text: "Akzeptierte Risiken" },
		{
			type: "table",
			columns: [
				{ label: "Nr.", width: 10 },
				{ label: "Risiko", width: 26 },
				{ label: "Begründung", width: 30 },
				{ label: "Akzeptiert von / am", width: 18 },
				{ label: "Wiedervorlage", width: 12 },
			],
			rows: f.accepted.map((r) => [
				r.code,
				r.title,
				r.reason ?? "",
				`${r.acceptedBy ?? "—"}\n${fmtDay(r.acceptedAt)}`,
				fmtDay(r.reviewAt),
			]),
			empty: "Keine Risiken akzeptiert.",
		},
	);
	return { blocks };
}

export const behandlungsplan = generator<BehandlungsplanFacts>({
	code: "NW-BEHANDLUNGSPLAN",
	async load(tx, orgId) {
		const measures = await listRiskMeasures(tx, orgId);
		const rows = await tx
			.select({
				id: risks.id,
				code: risks.code,
				title: risks.title,
				treatment: risks.treatment,
				status: risks.status,
				treatmentNote: risks.treatmentNote,
				ownerUserId: risks.ownerUserId,
				acceptedByUserId: risks.acceptedByUserId,
				acceptedAt: risks.acceptedAt,
				reviewAt: risks.reviewAt,
			})
			.from(risks)
			.where(
				and(
					eq(risks.organizationId, orgId),
					ne(risks.status, "closed"),
					ne(risks.status, "proposed"),
				),
			)
			.orderBy(asc(risks.code));
		const names = await userNames(
			tx,
			rows.flatMap((r) => [r.ownerUserId, r.acceptedByUserId]),
		);
		const name = (id: string | null) => (id ? (names.get(id) ?? null) : null);
		const withMeasure = new Set(measures.map((m) => m.riskId));
		return {
			measures: measures.map((m) => ({
				riskCode: m.riskCode,
				riskTitle: m.riskTitle,
				title: m.title,
				owner: m.ownerName,
				dueAt: m.dueAt,
				costEur: m.costEur,
				status: m.status,
			})),
			withoutMeasure: rows
				.filter((r) => r.treatment === "mitigate" && !withMeasure.has(r.id))
				.map((r) => ({
					code: r.code,
					title: r.title,
					owner: name(r.ownerUserId),
				})),
			accepted: rows
				.filter((r) => r.status === "accepted" || r.acceptedAt)
				.map((r) => ({
					code: r.code,
					title: r.title,
					reason: r.treatmentNote,
					acceptedBy: name(r.acceptedByUserId),
					acceptedAt: r.acceptedAt
						? r.acceptedAt.toISOString().slice(0, 10)
						: null,
					reviewAt: r.reviewAt,
				})),
		};
	},
	build: buildBehandlungsplan,
});
