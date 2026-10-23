import { asc, eq } from "drizzle-orm";
import { roleAssignments } from "@/db/schema";
import type { RoleFunction } from "@/db/schema/enums";
import { requiredFunctions } from "@/lib/compliance/catalog/required-functions";
import {
	buildOrgChart,
	type ChartWarning,
	flattenChart,
} from "@/lib/compliance/org-chart";
import { getOrgProfile, userNames } from "@/lib/compliance/queries";
import type { DocBlock } from "@/lib/export/doc-model";
import { functionLabel } from "../generate/doc";
import { generator } from "../generate/types";

// NW-ORGANIGRAMM: Aufbau der Funktionen über „berichtet an“ mit Besetzung,
// Vertretung und Hinweisen zur Unabhängigkeit (ISO 27001 5.3, DORA Art. 6,
// ZAG-MaRisk AT 4.3.1/4.4).
export type OrganigrammFacts = {
	rows: {
		function: RoleFunction;
		depth: number;
		parent: RoleFunction | null;
		holders: string[];
		deputies: string[];
	}[];
	warnings: ChartWarning[];
};

export function warningText(w: ChartWarning): string {
	switch (w.kind) {
		case "not_direct":
			return `${functionLabel(w.function)} berichtet an ${functionLabel(w.parent)} statt unmittelbar an die Geschäftsleitung (${w.basis}).`;
		case "cycle":
			return `${functionLabel(w.function)}: Berichtsweg im Kreis — unter der Geschäftsleitung eingeordnet.`;
		case "no_management":
			return "Keine Geschäftsleitung eingetragen — das Organigramm hat keine Spitze.";
	}
}

export function buildOrganigramm(f: OrganigrammFacts) {
	const blocks: DocBlock[] = [
		{
			type: "table",
			columns: [
				{ label: "Ebene", width: 8 },
				{ label: "Funktion", width: 30 },
				{ label: "Besetzt durch", width: 22 },
				{ label: "Vertretung", width: 18 },
				{ label: "Berichtet an", width: 22 },
			],
			rows: f.rows.map((r) => [
				String(r.depth + 1),
				functionLabel(r.function),
				r.holders.length > 0 ? r.holders.join(", ") : "nicht besetzt",
				r.deputies.join(", "),
				r.parent ? functionLabel(r.parent) : "—",
			]),
			empty: "Noch keine Funktionen eingetragen.",
		},
	];
	if (f.warnings.length > 0)
		blocks.push(
			{ type: "heading", level: 1, text: "Hinweise" },
			{ type: "list", items: f.warnings.map(warningText) },
		);
	return { blocks };
}

export const organigramm = generator<OrganigrammFacts>({
	code: "NW-ORGANIGRAMM",
	async load(tx, orgId) {
		const [rows, profile] = await Promise.all([
			tx
				.select({
					function: roleAssignments.function,
					reportsToFunction: roleAssignments.reportsToFunction,
					userId: roleAssignments.userId,
					externalName: roleAssignments.externalName,
					pendingEmail: roleAssignments.pendingEmail,
					deputyUserId: roleAssignments.deputyUserId,
				})
				.from(roleAssignments)
				.where(eq(roleAssignments.organizationId, orgId))
				.orderBy(asc(roleAssignments.function), asc(roleAssignments.id)),
			getOrgProfile(tx, orgId),
		]);
		if (rows.length === 0) return null;
		const names = await userNames(tx, [
			...rows.map((r) => r.userId),
			...rows.map((r) => r.deputyUserId),
		]);
		const name = (id: string | null) => (id ? (names.get(id) ?? null) : null);
		const chart = buildOrgChart(
			rows.map((r) => ({
				function: r.function,
				reportsToFunction: r.reportsToFunction,
				holder: name(r.userId) ?? r.externalName ?? r.pendingEmail ?? null,
				deputy: name(r.deputyUserId),
			})),
			profile
				? requiredFunctions(
						profile.frameworks,
						profile.profile.licenceStage,
					).map((x) => x.function)
				: [],
		);
		return {
			rows: flattenChart(chart.roots).map(({ node, depth }) => ({
				function: node.function,
				depth,
				parent: node.parent,
				holders: node.holders,
				deputies: node.deputies,
			})),
			warnings: chart.warnings,
		};
	},
	build: buildOrganigramm,
});
