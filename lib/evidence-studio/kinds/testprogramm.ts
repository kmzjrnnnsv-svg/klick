import { desc, eq } from "drizzle-orm";
import {
	controlImplementations,
	controls,
	controlTests,
	processes,
	sites,
} from "@/db/schema";
import { CONTROL_TEST_METHODS } from "@/db/schema/enums";
import { userNames } from "@/lib/compliance/queries";
import type { DocBlock } from "@/lib/export/doc-model";
import { fmtDay } from "../generate/doc";
import { generator } from "../generate/types";
import { label, TEST_METHOD, TEST_RESULT } from "./doc-audit-labels";

// NW-TESTPROGRAMM: Wirksamkeits- und Resilienztests je Testart mit Plan,
// Ergebnis und nächstem Termin (DORA Art. 24, NIS2 Art. 21(2)(f))
export type TestprogrammFacts = {
	tests: {
		method: string;
		subject: string;
		scope: string | null;
		plannedAt: string | null;
		testedAt: string | null;
		result: string | null;
		tester: string | null;
		nextTestAt: string | null;
	}[];
};

export function buildTestprogramm(
	f: TestprogrammFacts,
	ctx: { today: string },
) {
	const done = f.tests.filter((t) => t.testedAt);
	const planned = f.tests.filter((t) => !t.testedAt);
	const overdue = [
		...planned.filter((t) => t.plannedAt && t.plannedAt < ctx.today),
		...done.filter((t) => t.nextTestAt && t.nextTestAt < ctx.today),
	];
	const blocks: DocBlock[] = [
		{
			type: "keyValue",
			items: [
				["Tests gesamt", String(f.tests.length)],
				["durchgeführt", String(done.length)],
				["geplant", String(planned.length)],
				...(["pass", "partial", "fail"] as const).map(
					(r) =>
						[
							`Ergebnis „${label(TEST_RESULT, r)}“`,
							String(done.filter((t) => t.result === r).length),
						] as [string, string],
				),
				["Termin überschritten", String(overdue.length)],
			],
		},
	];
	const methods = CONTROL_TEST_METHODS.filter((m) =>
		f.tests.some((t) => t.method === m),
	);
	for (const m of methods) {
		const rows = f.tests
			.filter((t) => t.method === m)
			.sort((a, b) =>
				(a.testedAt ?? a.plannedAt ?? "").localeCompare(
					b.testedAt ?? b.plannedAt ?? "",
				),
			);
		blocks.push(
			{ type: "heading", level: 1, text: label(TEST_METHOD, m) },
			{
				type: "table",
				columns: [
					{ label: "Gegenstand", width: 30 },
					{ label: "geplant", width: 11 },
					{ label: "durchgeführt", width: 12 },
					{ label: "Ergebnis", width: 14 },
					{ label: "Prüfer:in", width: 16 },
					{ label: "nächster Test", width: 12 },
				],
				rows: rows.map((t) => [
					`${t.subject}${t.scope ? `\n${t.scope}` : ""}`,
					fmtDay(t.plannedAt),
					fmtDay(t.testedAt),
					t.result ? label(TEST_RESULT, t.result) : t.testedAt ? "—" : "offen",
					t.tester ?? "—",
					fmtDay(t.nextTestAt),
				]),
			},
		);
	}
	if (f.tests.length === 0)
		blocks.push({
			type: "paragraph",
			muted: true,
			text: "Noch keine Tests geplant oder durchgeführt.",
		});
	return { blocks };
}

export const testprogramm = generator<TestprogrammFacts>({
	code: "NW-TESTPROGRAMM",
	async load(tx, orgId) {
		const rows = await tx
			.select({
				method: controlTests.method,
				scope: controlTests.scope,
				plannedAt: controlTests.plannedAt,
				testedAt: controlTests.testedAt,
				result: controlTests.result,
				testerUserId: controlTests.testerUserId,
				nextTestAt: controlTests.nextTestAt,
				control: controls.code,
				controlTitle: controls.title,
				process: processes.name,
				site: sites.name,
			})
			.from(controlTests)
			.leftJoin(
				controlImplementations,
				eq(controlImplementations.id, controlTests.implementationId),
			)
			.leftJoin(controls, eq(controls.id, controlImplementations.controlId))
			.leftJoin(processes, eq(processes.id, controlTests.processId))
			.leftJoin(sites, eq(sites.id, controlTests.siteId))
			.where(eq(controlTests.organizationId, orgId))
			.orderBy(desc(controlTests.createdAt));
		const names = await userNames(
			tx,
			rows.map((r) => r.testerUserId),
		);
		return {
			tests: rows.map((r) => ({
				method: r.method,
				subject:
					r.control && r.controlTitle
						? `${r.control} ${r.controlTitle}`
						: r.process
							? `Prozess: ${r.process}`
							: r.site
								? `Standort: ${r.site}`
								: "Organisation",
				scope: r.scope,
				plannedAt: r.plannedAt,
				testedAt: r.testedAt ? r.testedAt.toISOString().slice(0, 10) : null,
				result: r.result,
				tester: r.testerUserId ? (names.get(r.testerUserId) ?? null) : null,
				nextTestAt: r.nextTestAt,
			})),
		};
	},
	build: buildTestprogramm,
});
