import { desc, eq } from "drizzle-orm";
import { resolutions } from "@/db/schema";
import { shortFrameworkName } from "@/lib/compliance/framework-names";
import type { DocBlock } from "@/lib/export/doc-model";
import { fmtDay } from "../generate/doc";
import { generator } from "../generate/types";

// NW-BESCHLUESSE: Beschlussregister der Leitungsorgane (ISO 27001 5.1,
// DORA Art. 5, MaRisk AT 3)
export type BeschluesseFacts = {
	resolutions: {
		number: string;
		date: string;
		body: "management" | "supervisory" | "shareholders";
		subject: string;
		decision: string;
		legalBasis: string | null;
		frameworks: string[];
	}[];
};

const BODY: Record<string, string> = {
	management: "Geschäftsleitung",
	supervisory: "Aufsichtsorgan",
	shareholders: "Gesellschafter",
};

export function buildBeschluesse(f: BeschluesseFacts) {
	const byBody = (b: string) =>
		f.resolutions.filter((r) => r.body === b).length;
	const blocks: DocBlock[] = [
		{
			type: "keyValue",
			items: [
				["Beschlüsse gesamt", String(f.resolutions.length)],
				["Geschäftsleitung", String(byBody("management"))],
				["Aufsichtsorgan", String(byBody("supervisory"))],
				["Gesellschafter", String(byBody("shareholders"))],
			],
		},
		{ type: "heading", level: 1, text: "Register" },
		{
			type: "table",
			columns: [
				{ label: "Nr.", width: 10 },
				{ label: "Datum", width: 11 },
				{ label: "Organ", width: 13 },
				{ label: "Gegenstand", width: 22 },
				{ label: "Beschluss", width: 32 },
				{ label: "Bezug", width: 12 },
			],
			rows: f.resolutions.map((r) => [
				r.number,
				fmtDay(r.date),
				BODY[r.body] ?? r.body,
				r.subject,
				r.decision,
				[
					...r.frameworks.map((s) => shortFrameworkName(s)),
					...(r.legalBasis ? [r.legalBasis] : []),
				].join(", "),
			]),
			empty: "Noch keine Beschlüsse erfasst.",
		},
	];
	return { blocks };
}

export const beschluesse = generator<BeschluesseFacts>({
	code: "NW-BESCHLUESSE",
	async load(tx, orgId) {
		const rows = await tx
			.select({
				number: resolutions.resolutionNumber,
				date: resolutions.date,
				body: resolutions.body,
				subject: resolutions.subject,
				decision: resolutions.decisionText,
				legalBasis: resolutions.legalBasis,
				frameworks: resolutions.frameworks,
			})
			.from(resolutions)
			.where(eq(resolutions.organizationId, orgId))
			.orderBy(desc(resolutions.date), desc(resolutions.resolutionNumber));
		return {
			resolutions: rows.map((r) => ({ ...r, frameworks: r.frameworks ?? [] })),
		};
	},
	build: buildBeschluesse,
});
