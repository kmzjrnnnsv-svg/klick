import { and, desc, eq } from "drizzle-orm";
import { managementReviews } from "@/db/schema";
import { applicableReviewInputs } from "@/lib/compliance/catalog/management-review-inputs";
import type { ReviewDigest } from "@/lib/compliance/management-review-digest";
import { userNames } from "@/lib/compliance/queries";
import type { DocBlock } from "@/lib/export/doc-model";
import { listOrgFrameworks } from "@/lib/org/queries";
import { fmtDay } from "../generate/doc";
import { generator } from "../generate/types";

// NW-MANAGEMENTBEWERTUNG (je Bewertung): Pflicht-Inputs, Zusammenfassung
// aus Klick (Schnappschuss beim Abhalten), Ergebnisse und Entscheidungen
// (ISO 27001 9.3, DORA Art. 6(5))
export type ManagementbewertungFacts = {
	review: {
		heldAt: string;
		status: string;
		owner: string | null;
		attendees: string[];
		summary: string | null;
		decisions: string | null;
	};
	inputs: {
		title: string;
		legalBasis: string;
		done: boolean;
		note: string | null;
	}[];
	digest: Pick<ReviewDigest, "from" | "to" | "sections"> | null;
};

const STATUS: Record<string, string> = {
	planned: "geplant",
	held: "abgehalten",
	done: "abgeschlossen",
};

export function buildManagementbewertung(f: ManagementbewertungFacts) {
	const r = f.review;
	const open = f.inputs.filter((i) => !i.done);
	const blocks: DocBlock[] = [
		{
			type: "keyValue",
			items: [
				["Datum", fmtDay(r.heldAt)],
				["Status", STATUS[r.status] ?? r.status],
				["Verantwortlich", r.owner ?? "—"],
				["Teilnehmende", r.attendees.join(", ") || "—"],
				[
					"Pflicht-Inputs behandelt",
					`${f.inputs.length - open.length} von ${f.inputs.length}`,
				],
			],
		},
		{ type: "heading", level: 1, text: "Pflicht-Inputs" },
		{
			type: "table",
			columns: [
				{ label: "Input", width: 34 },
				{ label: "Grundlage", width: 22 },
				{ label: "behandelt", width: 10 },
				{ label: "Notiz", width: 30 },
			],
			rows: f.inputs.map((i) => [
				i.title,
				i.legalBasis,
				i.done ? "ja" : "offen",
				i.note ?? "",
			]),
			empty: "Keine Pflicht-Inputs für die aktiven Rahmenwerke.",
		},
	];
	if (f.digest) {
		blocks.push(
			{ type: "heading", level: 1, text: "Zusammenfassung aus Klick" },
			{
				type: "paragraph",
				muted: true,
				text: `Berichtszeitraum ${fmtDay(f.digest.from)} bis ${fmtDay(f.digest.to)}, festgehalten beim Abhalten der Bewertung.`,
			},
		);
		for (const s of f.digest.sections) {
			blocks.push({ type: "heading", level: 2, text: s.title });
			if (s.facts.length > 0)
				blocks.push({
					type: "keyValue",
					items: s.facts.map((x) => [x.label, x.value]),
				});
			if (s.items.length > 0)
				blocks.push({
					type: "list",
					items: s.items.map((x) =>
						x.note ? `${x.title} – ${x.note}` : x.title,
					),
				});
		}
	}
	blocks.push(
		{ type: "heading", level: 1, text: "Ergebnisse" },
		{
			type: "paragraph",
			text: r.summary?.trim() || "Keine Zusammenfassung erfasst.",
			muted: !r.summary?.trim(),
		},
		{ type: "heading", level: 1, text: "Entscheidungen und Maßnahmen" },
		{
			type: "paragraph",
			text: r.decisions?.trim() || "Keine Entscheidungen erfasst.",
			muted: !r.decisions?.trim(),
		},
	);
	return {
		title: `Managementbewertung vom ${fmtDay(r.heldAt)}`,
		blocks,
	};
}

const isDigest = (
	d: unknown,
): d is Pick<ReviewDigest, "from" | "to" | "sections"> =>
	typeof d === "object" &&
	d !== null &&
	Array.isArray((d as { sections?: unknown }).sections);

export const managementbewertung = generator<ManagementbewertungFacts>({
	code: "NW-MANAGEMENTBEWERTUNG",
	async entities(tx, orgId) {
		const rows = await tx
			.select({
				id: managementReviews.id,
				heldAt: managementReviews.heldAt,
				status: managementReviews.status,
			})
			.from(managementReviews)
			.where(eq(managementReviews.organizationId, orgId))
			.orderBy(desc(managementReviews.heldAt));
		return rows.map((r) => ({
			id: r.id,
			label: `Managementbewertung · ${fmtDay(r.heldAt)} (${STATUS[r.status] ?? r.status})`,
		}));
	},
	async load(tx, orgId, entityId) {
		if (!entityId) return null;
		const [r] = await tx
			.select()
			.from(managementReviews)
			.where(
				and(
					eq(managementReviews.organizationId, orgId),
					eq(managementReviews.id, entityId),
				),
			)
			.limit(1);
		if (!r) return null;
		const fws = await listOrgFrameworks(tx, orgId);
		const names = await userNames(tx, [r.ownerUserId, ...r.attendeeUserIds]);
		const digest = isDigest(r.digest) ? r.digest : null;
		return {
			review: {
				heldAt: r.heldAt,
				status: r.status,
				owner: r.ownerUserId ? (names.get(r.ownerUserId) ?? null) : null,
				attendees: r.attendeeUserIds
					.map((id) => names.get(id) ?? "")
					.filter(Boolean),
				summary: r.summary,
				decisions: r.decisions,
			},
			inputs: applicableReviewInputs(fws.map((f) => f.slug)).map((i) => ({
				title: i.title,
				legalBasis: i.legalBasis,
				done: Boolean(r.inputs[i.key]?.done),
				note: r.inputs[i.key]?.note ?? null,
			})),
			digest: digest
				? {
						from: digest.from,
						to: digest.to,
						sections: digest.sections.map((s) => ({
							key: s.key,
							title: s.title,
							facts: s.facts.map((x) => ({
								label: x.label,
								value: x.value,
								tone: x.tone,
							})),
							items: s.items.map((x) => ({
								title: x.title,
								...(x.note ? { note: x.note } : {}),
							})),
						})),
					}
				: null,
		};
	},
	build: buildManagementbewertung,
});
