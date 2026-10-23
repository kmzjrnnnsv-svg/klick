import { desc, eq } from "drizzle-orm";
import { nonconformities } from "@/db/schema";
import { shortFrameworkName } from "@/lib/compliance/framework-names";
import { userNames } from "@/lib/compliance/queries";
import type { DocBlock } from "@/lib/export/doc-model";
import { fmtDay } from "../generate/doc";
import { generator } from "../generate/types";

// NW-ABWEICHUNGEN: Nichtkonformitäten und Korrekturmaßnahmen (ISO 27001
// 10.2) mit Fristen je Rahmenwerk
export type AbweichungenFacts = {
	items: {
		code: string;
		title: string;
		source: string;
		status: string;
		priority: string | null;
		followUpClass: string | null;
		rootCause: string | null;
		correction: string | null;
		correctiveAction: string | null;
		dueAt: string | null;
		planDueAt: string | null;
		followUp: {
			framework: string;
			classLabel: string;
			planDue: string | null;
			closeDue: string | null;
		}[];
		effectivenessResult: string | null;
		owner: string | null;
	}[];
};

const SOURCE: Record<string, string> = {
	audit: "Audit",
	incident: "Vorfall",
	control_test: "Test",
	complaint: "Beschwerde",
	management_review: "Managementbewertung",
	self_identified: "selbst erkannt",
	security_finding: "Sicherheitsbefund",
	custody_reconciliation: "Abstimmung Verwahrung",
};
const STATUS: Record<string, string> = {
	open: "offen",
	in_progress: "in Bearbeitung",
	verified: "geprüft",
	closed: "abgeschlossen",
};
const CLASS: Record<string, string> = {
	major: "Hauptabweichung",
	minor: "Nebenabweichung",
	observation: "Hinweis",
};
const EFF: Record<string, string> = {
	effective: "wirksam",
	partially: "teilweise wirksam",
	ineffective: "nicht wirksam",
};

export function buildAbweichungen(
	f: AbweichungenFacts,
	ctx: { today: string },
) {
	const open = f.items.filter((i) => i.status !== "closed");
	const overdue = open.filter((i) => i.dueAt && i.dueAt < ctx.today);
	const withPlan = f.items.filter((i) => i.followUp.length > 0);
	const blocks: DocBlock[] = [
		{
			type: "keyValue",
			items: [
				["Abweichungen gesamt", String(f.items.length)],
				["offen", String(open.length)],
				["überfällig", String(overdue.length)],
				[
					"abgeschlossen mit Wirksamkeit",
					String(
						f.items.filter(
							(i) =>
								i.status === "closed" && i.effectivenessResult === "effective",
						).length,
					),
				],
			],
		},
		{ type: "heading", level: 1, text: "Register" },
		{
			type: "table",
			columns: [
				{ label: "Nr.", width: 11 },
				{ label: "Abweichung", width: 22 },
				{ label: "Herkunft / Klasse", width: 13 },
				{ label: "Ursache", width: 18 },
				{ label: "Maßnahme", width: 18 },
				{ label: "Frist", width: 10 },
				{ label: "Status / Wirksamkeit", width: 12 },
			],
			rows: f.items.map((i) => [
				i.code,
				`${i.title}${i.owner ? `\nVerantwortlich: ${i.owner}` : ""}`,
				[
					SOURCE[i.source] ?? i.source,
					i.followUpClass ? CLASS[i.followUpClass] : "",
				]
					.filter(Boolean)
					.join("\n"),
				i.rootCause ?? "fehlt",
				[i.correction, i.correctiveAction].filter(Boolean).join("\n") ||
					"fehlt",
				`${fmtDay(i.dueAt)}${i.planDueAt ? `\nPlan: ${fmtDay(i.planDueAt)}` : ""}`,
				[
					STATUS[i.status] ?? i.status,
					i.effectivenessResult ? EFF[i.effectivenessResult] : "",
				]
					.filter(Boolean)
					.join("\n"),
			]),
			empty: "Keine Abweichungen erfasst.",
		},
	];
	if (withPlan.length > 0)
		blocks.push(
			{ type: "heading", level: 1, text: "Fristen je Rahmenwerk" },
			{
				type: "table",
				columns: [
					{ label: "Nr.", width: 12 },
					{ label: "Rahmenwerk", width: 18 },
					{ label: "Klasse", width: 22 },
					{ label: "Maßnahmenplan bis", width: 16 },
					{ label: "Umsetzung bis", width: 16 },
				],
				rows: withPlan.flatMap((i) =>
					i.followUp.map((p) => [
						i.code,
						p.framework === "_default"
							? "Standard"
							: shortFrameworkName(p.framework),
						p.classLabel,
						fmtDay(p.planDue),
						fmtDay(p.closeDue),
					]),
				),
			},
		);
	return { blocks };
}

export const abweichungen = generator<AbweichungenFacts>({
	code: "NW-ABWEICHUNGEN",
	async load(tx, orgId) {
		const rows = await tx
			.select()
			.from(nonconformities)
			.where(eq(nonconformities.organizationId, orgId))
			.orderBy(desc(nonconformities.code));
		const names = await userNames(
			tx,
			rows.map((r) => r.ownerUserId),
		);
		return {
			items: rows.map((r) => ({
				code: r.code,
				title: r.title,
				source: r.source,
				status: r.status,
				priority: r.priority,
				followUpClass: r.followUpClass,
				rootCause: r.rootCause,
				correction: r.correction,
				correctiveAction: r.correctiveAction,
				dueAt: r.dueAt,
				planDueAt: r.planDueAt,
				followUp: r.followUp ?? [],
				effectivenessResult: r.effectivenessResult,
				owner: r.ownerUserId ? (names.get(r.ownerUserId) ?? null) : null,
			})),
		};
	},
	build: buildAbweichungen,
});
