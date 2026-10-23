import { and, desc, eq, isNotNull, or } from "drizzle-orm";
import {
	controlImplementations,
	controls,
	controlTests,
	nonconformities,
} from "@/db/schema";
import { userNames } from "@/lib/compliance/queries";
import type { DocBlock } from "@/lib/export/doc-model";
import { fmtDay } from "../generate/doc";
import { generator } from "../generate/types";
import {
	EFFECTIVENESS,
	label,
	NC_STATUS,
	TEST_METHOD,
	TEST_RESULT,
} from "./doc-audit-labels";

// NW-WIRKSAMKEIT: geprüfte Wirksamkeit von Korrekturmaßnahmen und Controls
// mit Methode, Datum und Ergebnis (ISO 27001 9.1, 10.2 f)
export type WirksamkeitFacts = {
	corrective: {
		code: string;
		title: string;
		status: string;
		checkAt: string | null;
		result: string | null;
		owner: string | null;
	}[];
	controlTests: {
		control: string;
		method: string;
		testedAt: string;
		result: string | null;
		tester: string | null;
	}[];
};

export function buildWirksamkeit(f: WirksamkeitFacts, ctx: { today: string }) {
	const checked = f.corrective.filter((c) => c.result);
	const due = f.corrective.filter(
		(c) => !c.result && c.checkAt && c.checkAt < ctx.today,
	);
	const blocks: DocBlock[] = [
		{ type: "heading", level: 1, text: "Korrekturmaßnahmen" },
		{
			type: "keyValue",
			items: [
				["Wirksamkeitsprüfungen geplant", String(f.corrective.length)],
				["durchgeführt", String(checked.length)],
				...(["effective", "partially", "ineffective"] as const).map(
					(r) =>
						[
							`„${label(EFFECTIVENESS, r)}“`,
							String(checked.filter((c) => c.result === r).length),
						] as [string, string],
				),
				["Prüfung überfällig", String(due.length)],
			],
		},
		{
			type: "table",
			columns: [
				{ label: "Nr.", width: 12 },
				{ label: "Abweichung", width: 36 },
				{ label: "Prüfung am", width: 12 },
				{ label: "Ergebnis", width: 16 },
				{ label: "Status", width: 13 },
				{ label: "Verantwortlich", width: 15 },
			],
			rows: f.corrective.map((c) => [
				c.code,
				c.title,
				fmtDay(c.checkAt),
				c.result ? label(EFFECTIVENESS, c.result) : "offen",
				label(NC_STATUS, c.status),
				c.owner ?? "—",
			]),
			empty: "Keine Wirksamkeitsprüfungen geplant.",
		},
		{ type: "heading", level: 1, text: "Controls" },
		{
			type: "table",
			columns: [
				{ label: "Control", width: 14 },
				{ label: "Methode", width: 20 },
				{ label: "getestet am", width: 13 },
				{ label: "Ergebnis", width: 18 },
				{ label: "Prüfer:in", width: 18 },
			],
			rows: f.controlTests.map((t) => [
				t.control,
				label(TEST_METHOD, t.method),
				fmtDay(t.testedAt),
				t.result ? label(TEST_RESULT, t.result) : "—",
				t.tester ?? "—",
			]),
			empty: "Noch keine Control-Tests durchgeführt.",
		},
	];
	return { blocks };
}

export const wirksamkeit = generator<WirksamkeitFacts>({
	code: "NW-WIRKSAMKEIT",
	async load(tx, orgId) {
		const [ncs, tests] = await Promise.all([
			tx
				.select({
					code: nonconformities.code,
					title: nonconformities.title,
					status: nonconformities.status,
					checkAt: nonconformities.effectivenessCheckAt,
					result: nonconformities.effectivenessResult,
					ownerUserId: nonconformities.ownerUserId,
				})
				.from(nonconformities)
				.where(
					and(
						eq(nonconformities.organizationId, orgId),
						or(
							isNotNull(nonconformities.effectivenessCheckAt),
							isNotNull(nonconformities.effectivenessResult),
						),
					),
				)
				.orderBy(desc(nonconformities.code)),
			tx
				.select({
					control: controls.code,
					method: controlTests.method,
					testedAt: controlTests.testedAt,
					result: controlTests.result,
					testerUserId: controlTests.testerUserId,
				})
				.from(controlTests)
				.innerJoin(
					controlImplementations,
					eq(controlImplementations.id, controlTests.implementationId),
				)
				.innerJoin(controls, eq(controls.id, controlImplementations.controlId))
				.where(
					and(
						eq(controlTests.organizationId, orgId),
						isNotNull(controlTests.testedAt),
					),
				)
				.orderBy(desc(controlTests.testedAt)),
		]);
		const names = await userNames(tx, [
			...ncs.map((n) => n.ownerUserId),
			...tests.map((t) => t.testerUserId),
		]);
		const name = (id: string | null) => (id ? (names.get(id) ?? null) : null);
		return {
			corrective: ncs.map((n) => ({
				code: n.code,
				title: n.title,
				status: n.status,
				checkAt: n.checkAt,
				result: n.result,
				owner: name(n.ownerUserId),
			})),
			controlTests: tests.flatMap((t) =>
				t.testedAt
					? [
							{
								control: t.control,
								method: t.method,
								testedAt: t.testedAt.toISOString().slice(0, 10),
								result: t.result,
								tester: name(t.testerUserId),
							},
						]
					: [],
			),
		};
	},
	build: buildWirksamkeit,
});
