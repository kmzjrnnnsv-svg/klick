import { and, eq, ne } from "drizzle-orm";
import { processes, processRaci } from "@/db/schema";
import { userNames } from "@/lib/compliance/queries";
import type { DocBlock } from "@/lib/export/doc-model";
import { functionLabel } from "../generate/doc";
import { generator } from "../generate/types";

// NW-RACI: Zuständigkeiten je Prozess (R/A/C/I), genau ein A
// (ISO 27001 5.3, DORA Art. 5)
export type RaciFacts = {
	processes: {
		code: string;
		name: string;
		R: string[];
		A: string[];
		C: string[];
		I: string[];
	}[];
};

export function buildRaci(f: RaciFacts) {
	const wrongA = f.processes.filter((p) => p.A.length !== 1);
	const empty = f.processes.filter(
		(p) => p.R.length + p.A.length + p.C.length + p.I.length === 0,
	);
	const blocks: DocBlock[] = [
		{
			type: "paragraph",
			text: "R = durchführend, A = rechenschaftspflichtig (genau eine Stelle je Prozess), C = zu konsultieren, I = zu informieren.",
			muted: true,
		},
		{
			type: "table",
			columns: [
				{ label: "Prozess", width: 24 },
				{ label: "R", width: 19 },
				{ label: "A", width: 19 },
				{ label: "C", width: 19 },
				{ label: "I", width: 19 },
			],
			rows: f.processes.map((p) => [
				`${p.code} ${p.name}`,
				p.R.join(", "),
				p.A.join(", ") || "fehlt",
				p.C.join(", "),
				p.I.join(", "),
			]),
			empty: "Noch keine Prozesse erfasst.",
		},
	];
	if (wrongA.length > 0 || empty.length > 0)
		blocks.push(
			{ type: "heading", level: 1, text: "Offene Punkte" },
			{
				type: "list",
				items: [
					...wrongA.map(
						(p) =>
							`${p.code} ${p.name}: ${p.A.length === 0 ? "keine" : `${p.A.length}`} rechenschaftspflichtige Stelle${p.A.length === 1 ? "" : "n"} (gefordert: genau eine)`,
					),
					...empty
						.filter((p) => !wrongA.includes(p))
						.map((p) => `${p.code} ${p.name}: keine Zuständigkeiten erfasst`),
				],
			},
		);
	return { blocks };
}

export const raci = generator<RaciFacts>({
	code: "NW-RACI",
	async load(tx, orgId) {
		const [procs, entries] = await Promise.all([
			tx
				.select({
					id: processes.id,
					code: processes.code,
					name: processes.name,
				})
				.from(processes)
				.where(
					and(
						eq(processes.organizationId, orgId),
						ne(processes.status, "retired"),
					),
				)
				.orderBy(processes.code),
			tx
				.select({
					processId: processRaci.processId,
					userId: processRaci.userId,
					function: processRaci.function,
					raci: processRaci.raci,
				})
				.from(processRaci)
				.where(eq(processRaci.organizationId, orgId)),
		]);
		const names = await userNames(
			tx,
			entries.map((e) => e.userId),
		);
		const holder = (e: (typeof entries)[number]) =>
			e.userId
				? (names.get(e.userId) ?? "")
				: e.function
					? functionLabel(e.function)
					: "";
		return {
			processes: procs.map((p) => {
				const mine = entries.filter((e) => e.processId === p.id);
				const of = (k: "R" | "A" | "C" | "I") =>
					mine
						.filter((e) => e.raci === k)
						.map(holder)
						.filter(Boolean)
						.sort();
				return {
					code: p.code,
					name: p.name,
					R: of("R"),
					A: of("A"),
					C: of("C"),
					I: of("I"),
				};
			}),
		};
	},
	build: buildRaci,
});
