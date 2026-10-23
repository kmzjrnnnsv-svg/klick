import { eq } from "drizzle-orm";
import { contextIssues } from "@/db/schema";
import { userNames } from "@/lib/compliance/queries";
import { fmtDay } from "../generate/doc";
import { generator } from "../generate/types";

// NW-KONTEXT: interne und externe Themen (ISO 27001 4.1)
export type KontextFacts = {
	issues: {
		scope: "internal" | "external";
		title: string;
		description: string | null;
		impact: string | null;
		owner: string | null;
		reviewAt: string | null;
	}[];
};

export function buildKontext(f: KontextFacts) {
	const table = (scope: "internal" | "external") => ({
		type: "table" as const,
		columns: [
			{ label: "Thema", width: 22 },
			{ label: "Beschreibung", width: 34 },
			{ label: "Auswirkung auf das ISMS", width: 28 },
			{ label: "Verantwortlich", width: 14 },
			{ label: "Überprüfung", width: 11 },
		],
		rows: f.issues
			.filter((i) => i.scope === scope)
			.map((i) => [
				i.title,
				i.description ?? "",
				i.impact ?? "",
				i.owner ?? "",
				fmtDay(i.reviewAt),
			]),
		empty:
			scope === "external"
				? "Noch keine externen Themen erfasst."
				: "Noch keine internen Themen erfasst.",
	});
	const ext = f.issues.filter((i) => i.scope === "external").length;
	const int = f.issues.length - ext;
	return {
		blocks: [
			{
				type: "paragraph" as const,
				text: `Die Organisation hat ${ext} externe und ${int} interne Themen bestimmt, die für ihren Zweck relevant sind und ihre Fähigkeit beeinflussen, die beabsichtigten Ergebnisse des Managementsystems zu erreichen.`,
			},
			{ type: "heading" as const, level: 1 as const, text: "Externe Themen" },
			table("external"),
			{ type: "heading" as const, level: 1 as const, text: "Interne Themen" },
			table("internal"),
		],
	};
}

export const kontext = generator<KontextFacts>({
	code: "NW-KONTEXT",
	async load(tx, orgId) {
		const rows = await tx
			.select()
			.from(contextIssues)
			.where(eq(contextIssues.organizationId, orgId))
			.orderBy(contextIssues.scope, contextIssues.title);
		const names = await userNames(
			tx,
			rows.map((r) => r.ownerUserId),
		);
		return {
			issues: rows.map((r) => ({
				scope: r.scope,
				title: r.title,
				description: r.description,
				impact: r.impact,
				owner: r.ownerUserId ? (names.get(r.ownerUserId) ?? null) : null,
				reviewAt: r.reviewAt,
			})),
		};
	},
	build: buildKontext,
});
