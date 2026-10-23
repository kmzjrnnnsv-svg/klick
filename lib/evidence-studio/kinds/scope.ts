import { and, eq, ne } from "drizzle-orm";
import { frameworks, scopes } from "@/db/schema";
import { shortFrameworkName } from "@/lib/compliance/framework-names";
import { userNames } from "@/lib/compliance/queries";
import type { DocBlock } from "@/lib/export/doc-model";
import { fmtDay } from "../generate/doc";
import { generator } from "../generate/types";

// NW-SCOPE: Geltungsbereich mit Grenzen, Standorten, Leistungen und
// begründeten Ausschlüssen (ISO 27001 4.3)
export type ScopeFacts = {
	scopes: {
		framework: string | null;
		statement: string;
		boundaries: string | null;
		locations: string[];
		services: string[];
		exclusions: { what: string; justification: string }[];
		version: string;
		status: "draft" | "approved" | "superseded";
		approvedBy: string | null;
		approvedAt: string | null;
	}[];
};

const STATUS: Record<string, string> = {
	draft: "Entwurf",
	approved: "freigegeben",
	superseded: "abgelöst",
};

export function buildScope(f: ScopeFacts) {
	if (f.scopes.length === 0)
		return {
			blocks: [
				{
					type: "paragraph" as const,
					text: "Noch kein Geltungsbereich festgelegt.",
					muted: true,
				},
			],
		};
	// freigegebene zuerst, dann Entwürfe
	const ordered = [...f.scopes].sort(
		(a, b) => Number(b.status === "approved") - Number(a.status === "approved"),
	);
	const blocks: DocBlock[] = [];
	for (const s of ordered) {
		blocks.push(
			{
				type: "heading",
				level: 1,
				text: s.framework
					? `Geltungsbereich ${shortFrameworkName(s.framework)}`
					: "Geltungsbereich",
			},
			{
				type: "keyValue",
				items: [
					["Version", s.version],
					["Status", STATUS[s.status] ?? s.status],
					[
						"Freigegeben",
						s.approvedAt
							? `${fmtDay(s.approvedAt)}${s.approvedBy ? ` durch ${s.approvedBy}` : ""}`
							: "noch nicht",
					],
				],
			},
			{ type: "heading", level: 2, text: "Festlegung" },
			{ type: "paragraph", text: s.statement },
		);
		if (s.boundaries)
			blocks.push(
				{ type: "heading", level: 2, text: "Grenzen und Schnittstellen" },
				{ type: "paragraph", text: s.boundaries },
			);
		blocks.push(
			{ type: "heading", level: 2, text: "Standorte" },
			s.locations.length > 0
				? { type: "list", items: s.locations }
				: { type: "paragraph", text: "Keine Standorte genannt.", muted: true },
			{ type: "heading", level: 2, text: "Leistungen und Prozesse" },
			s.services.length > 0
				? { type: "list", items: s.services }
				: { type: "paragraph", text: "Keine Leistungen genannt.", muted: true },
			{ type: "heading", level: 2, text: "Ausschlüsse" },
			{
				type: "table",
				columns: [
					{ label: "Ausgeschlossen", width: 35 },
					{ label: "Begründung", width: 65 },
				],
				rows: s.exclusions.map((e) => [e.what, e.justification]),
				empty: "Keine Ausschlüsse.",
			},
		);
	}
	return { blocks };
}

export const scope = generator<ScopeFacts>({
	code: "NW-SCOPE",
	async load(tx, orgId) {
		const rows = await tx
			.select({ s: scopes, framework: frameworks.slug })
			.from(scopes)
			.leftJoin(frameworks, eq(frameworks.id, scopes.frameworkId))
			.where(
				and(eq(scopes.organizationId, orgId), ne(scopes.status, "superseded")),
			)
			.orderBy(scopes.createdAt);
		const names = await userNames(
			tx,
			rows.map((r) => r.s.approvedByUserId),
		);
		return {
			scopes: rows.map(({ s, framework }) => ({
				framework,
				statement: s.statement,
				boundaries: s.boundaries,
				locations: s.locations ?? [],
				services: s.services ?? [],
				exclusions: s.exclusions ?? [],
				version: s.version,
				status: s.status,
				approvedBy: s.approvedByUserId
					? (names.get(s.approvedByUserId) ?? null)
					: null,
				approvedAt: s.approvedAt ? s.approvedAt.toISOString() : null,
			})),
		};
	},
	build: buildScope,
});
