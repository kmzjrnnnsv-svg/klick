import { and, asc, eq } from "drizzle-orm";
import { orgRoles, roleAssignments } from "@/db/schema";
import type { FunctionKey } from "@/db/schema/enums";
import { effectiveAssignment } from "@/lib/compliance/appointments";
import { requiredFunctions } from "@/lib/compliance/catalog/required-functions";
import { functionKeyOf, ownRoleKey } from "@/lib/compliance/function-key";
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
// ZAG-MaRisk AT 4.3.1/4.4). Eigene Rollen (ADR-024) mit Namen in `titles`
// — nur wenn es welche gibt, damit die Prüfsumme bestehender Nachweise bleibt.
export type OrganigrammFacts = {
	rows: {
		function: FunctionKey;
		depth: number;
		parent: FunctionKey | null;
		holders: string[];
		deputies: string[];
	}[];
	warnings: ChartWarning[];
	titles?: Record<string, string>;
};

export function warningText(
	w: ChartWarning,
	label: (k: FunctionKey) => string = functionLabel,
): string {
	switch (w.kind) {
		case "not_direct":
			return `${label(w.function)} berichtet an ${label(w.parent)} statt unmittelbar an die Geschäftsleitung (${w.basis}).`;
		case "cycle":
			return `${label(w.function)}: Berichtsweg im Kreis — unter der Geschäftsleitung eingeordnet.`;
		case "no_management":
			return "Keine Geschäftsleitung eingetragen — das Organigramm hat keine Spitze.";
	}
}

export function buildOrganigramm(f: OrganigrammFacts) {
	const label = (k: FunctionKey) => f.titles?.[k] ?? functionLabel(k);
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
				label(r.function),
				r.holders.length > 0 ? r.holders.join(", ") : "nicht besetzt",
				r.deputies.join(", "),
				r.parent ? label(r.parent) : "—",
			]),
			empty: "Noch keine Funktionen eingetragen.",
		},
	];
	if (f.warnings.length > 0)
		blocks.push(
			{ type: "heading", level: 1, text: "Hinweise" },
			{ type: "list", items: f.warnings.map((w) => warningText(w, label)) },
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
					orgRoleId: roleAssignments.orgRoleId,
					reportsToFunction: roleAssignments.reportsToFunction,
					userId: roleAssignments.userId,
					externalName: roleAssignments.externalName,
					pendingEmail: roleAssignments.pendingEmail,
					deputyUserId: roleAssignments.deputyUserId,
				})
				.from(roleAssignments)
				.where(
					and(eq(roleAssignments.organizationId, orgId), effectiveAssignment()),
				)
				.orderBy(asc(roleAssignments.function), asc(roleAssignments.id)),
			getOrgProfile(tx, orgId),
		]);
		if (rows.length === 0) return null;
		const names = await userNames(tx, [
			...rows.map((r) => r.userId),
			...rows.map((r) => r.deputyUserId),
		]);
		const name = (id: string | null) => (id ? (names.get(id) ?? null) : null);
		// eigene Rollen: Name und Berichtsweg aus org_roles
		const own = rows.some((r) => r.orgRoleId)
			? await tx
					.select({
						id: orgRoles.id,
						name: orgRoles.name,
						reportsTo: orgRoles.reportsTo,
					})
					.from(orgRoles)
					.where(eq(orgRoles.organizationId, orgId))
			: [];
		const ownById = new Map(own.map((o) => [o.id, o]));
		const chart = buildOrgChart(
			rows.map((r) => ({
				function: functionKeyOf(r),
				reportsToFunction: r.orgRoleId
					? ((ownById.get(r.orgRoleId)?.reportsTo as FunctionKey | null) ??
						null)
					: r.reportsToFunction,
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
			...(own.length > 0
				? {
						titles: Object.fromEntries(
							own.map((o) => [ownRoleKey(o.id), o.name]),
						),
					}
				: {}),
		};
	},
	build: buildOrganigramm,
});
