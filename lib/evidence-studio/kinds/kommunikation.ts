import { eq } from "drizzle-orm";
import { communications, interestedParties } from "@/db/schema";
import { userNames } from "@/lib/compliance/queries";
import type { DocBlock } from "@/lib/export/doc-model";
import { functionLabel } from "../generate/doc";
import { generator } from "../generate/types";

// NW-KOMMUNIKATION: Kommunikationsmatrix — was, an wen, wann, wie, durch
// wen (ISO 27001 7.4), getrennt nach Anlass
export type KommunikationFacts = {
	items: {
		topic: string;
		party: string | null;
		audience: string | null;
		purpose: string | null;
		channel: string | null;
		frequency: string | null;
		trigger: "regular" | "incident" | "crisis" | "change";
		owner: string | null;
		legalBasis: string | null;
	}[];
};

const TRIGGER: [KommunikationFacts["items"][number]["trigger"], string][] = [
	["regular", "Regelkommunikation"],
	["change", "Bei Änderungen"],
	["incident", "Bei Vorfällen"],
	["crisis", "In der Krise"],
];

export function buildKommunikation(f: KommunikationFacts) {
	const blocks: DocBlock[] = [];
	for (const [trigger, label] of TRIGGER) {
		const rows = f.items.filter((i) => i.trigger === trigger);
		if (rows.length === 0) continue;
		blocks.push(
			{ type: "heading", level: 1, text: label },
			{
				type: "table",
				columns: [
					{ label: "Was", width: 20 },
					{ label: "An wen", width: 18 },
					{ label: "Wozu", width: 18 },
					{ label: "Wie / wann", width: 18 },
					{ label: "Durch", width: 14 },
					{ label: "Grundlage", width: 12 },
				],
				rows: rows.map((i) => [
					i.topic,
					[i.party, i.audience].filter(Boolean).join(" – "),
					i.purpose ?? "",
					[i.channel, i.frequency].filter(Boolean).join(", "),
					i.owner ?? "offen",
					i.legalBasis ?? "",
				]),
			},
		);
	}
	if (blocks.length === 0)
		blocks.push({
			type: "paragraph",
			text: "Noch keine Kommunikation festgelegt.",
			muted: true,
		});
	return { blocks };
}

export const kommunikation = generator<KommunikationFacts>({
	code: "NW-KOMMUNIKATION",
	async load(tx, orgId) {
		const rows = await tx
			.select({ c: communications, party: interestedParties.name })
			.from(communications)
			.leftJoin(
				interestedParties,
				eq(interestedParties.id, communications.interestedPartyId),
			)
			.where(eq(communications.organizationId, orgId))
			.orderBy(communications.trigger, communications.topic);
		const names = await userNames(
			tx,
			rows.map((r) => r.c.ownerUserId),
		);
		return {
			items: rows.map(({ c, party }) => ({
				topic: c.topic,
				party,
				audience: c.audience,
				purpose: c.purpose,
				channel: c.channel,
				frequency: c.frequency,
				trigger: c.trigger,
				owner: c.ownerUserId
					? (names.get(c.ownerUserId) ?? null)
					: c.ownerFunction
						? functionLabel(c.ownerFunction)
						: null,
				legalBasis: c.legalBasis,
			})),
		};
	},
	build: buildKommunikation,
});
