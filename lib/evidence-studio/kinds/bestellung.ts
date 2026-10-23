import { and, asc, eq, ne } from "drizzle-orm";
import { roleAssignments } from "@/db/schema";
import type { RoleFunction } from "@/db/schema/enums";
import { APPOINTMENT_TEMPLATE_BY_FUNCTION } from "@/lib/compliance/catalog/appointment-templates";
import { REQUIRED_FUNCTIONS } from "@/lib/compliance/catalog/required-functions";
import { userNames } from "@/lib/compliance/queries";
import type { DocBlock } from "@/lib/export/doc-model";
import { fmtDay, functionLabel } from "../generate/doc";
import { generator } from "../generate/types";

// NW-BESTELLUNG (je Funktion): Bestellungsschreiben aus Funktion, Vorlage
// (appointment-templates.ts) und Ergänzungen der Org. Unterschreiben die
// Geschäftsleitung (Bestellung) und die bestellte Person (Annahme).
export type BestellungFacts = {
	function: RoleFunction;
	holder: string | null;
	external: boolean;
	deputy: string | null;
	appointedAt: string | null;
	reportsTo: RoleFunction;
	reportsDirectly: boolean;
	independenceBasis: string | null;
	legalBasis: string | null;
	tasks: string[];
	powers: string[];
	resources: string;
	notes: string | null;
};

export function buildBestellung(f: BestellungFacts) {
	const fn = functionLabel(f.function);
	const holder = f.holder ?? "(nicht besetzt)";
	const blocks: DocBlock[] = [
		{
			type: "paragraph",
			text: `Die Geschäftsleitung bestellt ${holder} ${f.appointedAt ? `mit Wirkung zum ${fmtDay(f.appointedAt)} ` : ""}zur Funktion „${fn}“.`,
		},
		{
			type: "keyValue",
			items: [
				["Funktion", fn],
				["Bestellte Person", `${holder}${f.external ? " (extern)" : ""}`],
				["Vertretung", f.deputy ?? "—"],
				["Berichtet an", functionLabel(f.reportsTo)],
				["Rechtsgrundlage", f.legalBasis ?? "—"],
			],
		},
		{ type: "heading", level: 1, text: "Aufgaben" },
		{ type: "list", items: f.tasks },
		{ type: "heading", level: 1, text: "Befugnisse" },
		{ type: "list", items: f.powers },
		{ type: "heading", level: 1, text: "Berichtsweg" },
		{
			type: "paragraph",
			text: f.reportsDirectly
				? `Berichtet unmittelbar an die Geschäftsleitung${f.independenceBasis ? ` (${f.independenceBasis})` : ""}.`
				: `Berichtet an: ${functionLabel(f.reportsTo)}.`,
		},
		{ type: "heading", level: 1, text: "Ressourcen" },
		{ type: "paragraph", text: f.resources },
	];
	if (f.notes)
		blocks.push(
			{ type: "heading", level: 1, text: "Ergänzungen" },
			{ type: "paragraph", text: f.notes },
		);
	blocks.push({
		type: "paragraph",
		muted: true,
		text: "Mit ihrer Unterschrift bestätigt die Geschäftsleitung die Bestellung; die bestellte Person nimmt sie mit ihrer Unterschrift an.",
	});
	return { title: `Bestellung: ${fn}`, subtitle: holder, blocks };
}

const CONTROLS_BY_FUNCTION: Partial<Record<RoleFunction, string>> = {
	aml_officer: "CC-AML-03",
	compliance_manager: "CC-AML-03",
	dpo: "CC-PRV-06",
};

export const bestellung = generator<BestellungFacts>({
	code: "NW-BESTELLUNG",
	async load(tx, orgId, entityId) {
		if (!entityId) return null;
		const [r] = await tx
			.select()
			.from(roleAssignments)
			.where(
				and(
					eq(roleAssignments.organizationId, orgId),
					eq(roleAssignments.id, entityId),
				),
			)
			.limit(1);
		const t = r ? APPOINTMENT_TEMPLATE_BY_FUNCTION.get(r.function) : undefined;
		if (!r || !t) return null;
		const names = await userNames(tx, [r.userId, r.deputyUserId]);
		const name = (id: string | null) => (id ? (names.get(id) ?? null) : null);
		return {
			function: r.function,
			holder: name(r.userId) ?? r.externalName ?? r.pendingEmail ?? null,
			external: !r.userId && Boolean(r.externalName),
			deputy: name(r.deputyUserId),
			appointedAt: r.appointedAt,
			reportsTo: r.reportsToFunction ?? "management_body",
			reportsDirectly: t.reportsDirectly,
			independenceBasis: t.independenceBasis ?? null,
			legalBasis:
				REQUIRED_FUNCTIONS.find((x) => x.function === r.function)?.legalBasis ??
				null,
			tasks: [...t.tasks],
			powers: [...t.powers],
			resources: t.resources,
			notes: r.appointmentNotes?.trim() || null,
		};
	},
	build: buildBestellung,
	// die bestellte Person unterschreibt in ihrer Funktion
	extraSigners: (f) => [
		{
			function: f.function,
			mode: "any",
			holders: f.holder ? [f.holder] : [],
		},
	],
	controls: (f) => ["CC-GOV-02", CONTROLS_BY_FUNCTION[f.function] ?? ""],
	async entities(tx, orgId) {
		const rows = await tx
			.select({
				id: roleAssignments.id,
				function: roleAssignments.function,
				userId: roleAssignments.userId,
				externalName: roleAssignments.externalName,
			})
			.from(roleAssignments)
			.where(
				and(
					eq(roleAssignments.organizationId, orgId),
					ne(roleAssignments.function, "management_body"),
				),
			)
			.orderBy(asc(roleAssignments.function));
		const names = await userNames(
			tx,
			rows.map((r) => r.userId),
		);
		return rows.map((r) => ({
			id: r.id,
			label: `${functionLabel(r.function)} — ${(r.userId ? names.get(r.userId) : r.externalName) ?? "nicht besetzt"}`,
		}));
	},
});
