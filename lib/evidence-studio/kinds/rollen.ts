import { eq } from "drizzle-orm";
import { roleAssignments } from "@/db/schema";
import {
	requiredFunctions,
	roleCoverage,
} from "@/lib/compliance/catalog/required-functions";
import { getOrgProfile, userNames } from "@/lib/compliance/queries";
import type { DocBlock } from "@/lib/export/doc-model";
import { fmtDay, functionLabel } from "../generate/doc";
import { generator } from "../generate/types";

// NW-ROLLEN: Rollenregister mit Besetzung, Vertretung und Bestellung
// (ISO 27001 5.3). Fit & Proper nur als Status — die Prüfliste ist
// feldverschlüsselt und gehört nicht in den Schnappschuss.
export type RollenFacts = {
	assignments: {
		function: string;
		holder: string | null;
		invited: boolean;
		deputy: string | null;
		appointedAt: string | null;
		reviewAt: string | null;
		fitProperStatus: "not_required" | "pending" | "confirmed" | "rejected";
	}[];
	// Pflichtfunktionen (Rahmenwerke × Lizenzstufe) ohne Besetzung bzw. ohne
	// geforderte Vertretung
	missing: string[];
	deputyMissing: string[];
};

const FIT: Record<string, string> = {
	not_required: "nicht erforderlich",
	pending: "offen",
	confirmed: "bestätigt",
	rejected: "abgelehnt",
};

export function buildRollen(f: RollenFacts) {
	const blocks: DocBlock[] = [
		{
			type: "table",
			columns: [
				{ label: "Funktion", width: 24 },
				{ label: "Besetzt durch", width: 20 },
				{ label: "Vertretung", width: 18 },
				{ label: "Bestellt am", width: 12 },
				{ label: "Wiedervorlage", width: 12 },
				{ label: "Fit & Proper", width: 14 },
			],
			rows: f.assignments.map((a) => [
				functionLabel(a.function),
				a.holder
					? `${a.holder}${a.invited ? " (eingeladen)" : ""}`
					: "nicht besetzt",
				a.deputy ?? "",
				fmtDay(a.appointedAt),
				fmtDay(a.reviewAt),
				FIT[a.fitProperStatus] ?? a.fitProperStatus,
			]),
			empty: "Noch keine Funktionen besetzt.",
		},
	];
	if (f.missing.length > 0 || f.deputyMissing.length > 0)
		blocks.push(
			{ type: "heading", level: 1, text: "Offene Pflichtfunktionen" },
			{
				type: "list",
				items: [
					...f.missing.map((m) => `${m}: nicht besetzt`),
					...f.deputyMissing.map((m) => `${m}: Vertretung gefordert, fehlt`),
				],
			},
		);
	else
		blocks.push({
			type: "paragraph",
			text: "Alle Pflichtfunktionen der aktiven Rahmenwerke sind besetzt.",
		});
	return { blocks };
}

export const rollen = generator<RollenFacts>({
	code: "NW-ROLLEN",
	async load(tx, orgId) {
		const [rows, profile] = await Promise.all([
			tx
				.select({
					function: roleAssignments.function,
					userId: roleAssignments.userId,
					externalName: roleAssignments.externalName,
					pendingEmail: roleAssignments.pendingEmail,
					deputyUserId: roleAssignments.deputyUserId,
					evidenceId: roleAssignments.evidenceId,
					appointedAt: roleAssignments.appointedAt,
					reviewAt: roleAssignments.reviewAt,
					documentsValidUntil: roleAssignments.documentsValidUntil,
					fitProperStatus: roleAssignments.fitProperStatus,
				})
				.from(roleAssignments)
				.where(eq(roleAssignments.organizationId, orgId))
				.orderBy(roleAssignments.function),
			getOrgProfile(tx, orgId),
		]);
		const names = await userNames(tx, [
			...rows.map((r) => r.userId),
			...rows.map((r) => r.deputyUserId),
		]);
		const name = (id: string | null) => (id ? (names.get(id) ?? null) : null);
		const coverage = profile
			? roleCoverage(
					requiredFunctions(profile.frameworks, profile.profile.licenceStage),
					rows,
				).items
			: [];
		return {
			assignments: rows.map((r) => ({
				function: r.function,
				holder: name(r.userId) ?? r.externalName ?? r.pendingEmail ?? null,
				invited: !r.userId && !r.externalName && Boolean(r.pendingEmail),
				deputy: name(r.deputyUserId),
				appointedAt: r.appointedAt,
				reviewAt: r.reviewAt,
				fitProperStatus: r.fitProperStatus,
			})),
			missing: coverage.filter((c) => !c.filled).map((c) => c.required.title),
			deputyMissing: coverage
				.filter((c) => c.deputyMissing)
				.map((c) => c.required.title),
		};
	},
	build: buildRollen,
});
