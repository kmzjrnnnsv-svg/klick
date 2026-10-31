import { eq } from "drizzle-orm";
import { interestedParties } from "@/db/schema";
import { shortFrameworkName } from "@/lib/compliance/framework-names";
import { userNames } from "@/lib/compliance/queries";
import type { DocBlock } from "@/lib/export/doc-model";
import { fmtDay } from "../generate/doc";
import { generator } from "../generate/types";

// NW-PARTEIEN: interessierte Parteien und ihre Anforderungen (ISO 27001 4.2)
export type ParteienFacts = {
	parties: {
		name: string;
		type: string;
		expectations: string | null;
		requirements: string | null;
		frameworks: string[];
		howAddressed: string | null;
		owner: string | null;
		reviewAt: string | null;
	}[];
};

const TYPE: Record<string, string> = {
	regulator: "Aufsicht",
	customer: "Kund:innen",
	employee: "Beschäftigte",
	supplier: "Dienstleister",
	shareholder: "Gesellschafter",
	partner: "Partner",
	public: "Öffentlichkeit",
	community: "Gemeinschaft",
};

export function buildParteien(f: ParteienFacts) {
	const addressed = f.parties.filter((p) => p.howAddressed?.trim()).length;
	const blocks: DocBlock[] = [
		{
			type: "paragraph",
			text: `Die Organisation hat ${f.parties.length} interessierte Parteien bestimmt, die für das Managementsystem relevant sind. Für ${addressed} davon ist festgelegt, wie ihre Anforderungen berücksichtigt werden.`,
		},
		{ type: "heading", level: 1, text: "Parteien und Anforderungen" },
		{
			type: "table",
			columns: [
				{ label: "Partei", width: 16 },
				{ label: "Art", width: 10 },
				{ label: "Erwartungen", width: 20 },
				{ label: "Anforderungen", width: 20 },
				{ label: "Rahmenwerke", width: 11 },
				{ label: "Berücksichtigt durch", width: 20 },
			],
			rows: f.parties.map((p) => [
				`${p.name}${p.owner ? `\nVerantwortlich: ${p.owner}` : ""}`,
				TYPE[p.type] ?? p.type,
				p.expectations ?? "",
				p.requirements ?? "",
				p.frameworks.map((s) => shortFrameworkName(s)).join(", "),
				p.howAddressed ?? "offen",
			]),
			empty: "Noch keine interessierten Parteien erfasst.",
		},
	];
	const reviews = f.parties.filter((p) => p.reviewAt);
	if (reviews.length > 0)
		blocks.push(
			{ type: "heading", level: 1, text: "Überprüfung" },
			{
				type: "keyValue",
				items: reviews.map((p) => [p.name, fmtDay(p.reviewAt)]),
			},
		);
	return { blocks };
}

export const parteien = generator<ParteienFacts>({
	code: "NW-PARTEIEN",
	async load(tx, orgId) {
		const rows = await tx
			.select()
			.from(interestedParties)
			.where(eq(interestedParties.organizationId, orgId))
			.orderBy(interestedParties.type, interestedParties.name);
		const names = await userNames(
			tx,
			rows.map((r) => r.ownerUserId),
		);
		return {
			parties: rows.map((r) => ({
				name: r.name,
				type: r.type,
				expectations: r.expectations,
				requirements: r.requirements,
				frameworks: r.relevantFrameworks ?? [],
				howAddressed: r.howAddressed,
				owner: r.ownerUserId ? (names.get(r.ownerUserId) ?? null) : null,
				reviewAt: r.reviewAt,
			})),
		};
	},
	build: buildParteien,
});
