import { and, asc, eq, ne } from "drizzle-orm";
import { orgRoles, roleAssignments } from "@/db/schema";
import type { FunctionKey, RoleFunction } from "@/db/schema/enums";
import { effectiveAssignment } from "@/lib/compliance/appointments";
import { APPOINTMENT_TEMPLATE_BY_FUNCTION } from "@/lib/compliance/catalog/appointment-templates";
import { REQUIRED_FUNCTIONS } from "@/lib/compliance/catalog/required-functions";
import { ownRoleIdOf, ownRoleKey } from "@/lib/compliance/function-key";
import { userNames } from "@/lib/compliance/queries";
import type { DocBlock } from "@/lib/export/doc-model";
import { orgRoleNames } from "@/lib/org/roles";
import { fmtDay, functionLabel } from "../generate/doc";
import { generator } from "../generate/types";

// NW-BESTELLUNG (je Funktion): Bestellungsschreiben aus Funktion, Vorlage
// (appointment-templates.ts) und Ergänzungen der Org. Unterschreiben die
// Geschäftsleitung (Bestellung) und die bestellte Person (Annahme). Eigene
// Rollen (ADR-024) tragen Name und Aufgaben aus org_roles; die Felder
// functionTitle/reportsToTitle stehen nur dann im Schnappschuss, damit die
// Prüfsumme bestehender Schreiben gleich bleibt.
export type BestellungFacts = {
	function: RoleFunction;
	// nur bei eigener Rolle: Schlüssel `role:<id>` und Name
	roleKey?: FunctionKey;
	functionTitle?: string;
	holder: string | null;
	external: boolean;
	deputy: string | null;
	appointedAt: string | null;
	reportsTo: FunctionKey;
	reportsToTitle?: string;
	reportsDirectly: boolean;
	independenceBasis: string | null;
	legalBasis: string | null;
	tasks: string[];
	powers: string[];
	resources: string;
	notes: string | null;
};

export function buildBestellung(f: BestellungFacts) {
	const fn = f.functionTitle ?? functionLabel(f.function);
	const reportsTo = f.reportsToTitle ?? functionLabel(f.reportsTo);
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
				["Berichtet an", reportsTo],
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
				: `Berichtet an: ${reportsTo}.`,
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
					effectiveAssignment(),
					eq(roleAssignments.id, entityId),
				),
			)
			.limit(1);
		const t = r ? APPOINTMENT_TEMPLATE_BY_FUNCTION.get(r.function) : undefined;
		if (!r || !t) return null;
		const names = await userNames(tx, [r.userId, r.deputyUserId]);
		const name = (id: string | null) => (id ? (names.get(id) ?? null) : null);
		// eigene Rolle: Name, Aufgaben und Berichtsweg aus org_roles
		const [own] = r.orgRoleId
			? await tx
					.select({
						name: orgRoles.name,
						tasks: orgRoles.tasks,
						reportsTo: orgRoles.reportsTo,
					})
					.from(orgRoles)
					.where(
						and(
							eq(orgRoles.organizationId, orgId),
							eq(orgRoles.id, r.orgRoleId),
						),
					)
					.limit(1)
			: [];
		const ownTasks = (own?.tasks ?? "")
			.split("\n")
			.map((l) => l.replace(/^[-•*]\s*/, "").trim())
			.filter(Boolean);
		const reportsTo = ((own ? own.reportsTo : r.reportsToFunction) ??
			"management_body") as FunctionKey;
		const reportsToRole = ownRoleIdOf(reportsTo);
		const roleNames = reportsToRole ? await orgRoleNames(tx, orgId) : {};
		return {
			function: r.function,
			...(own && r.orgRoleId
				? { roleKey: ownRoleKey(r.orgRoleId), functionTitle: own.name }
				: {}),
			holder: name(r.userId) ?? r.externalName ?? r.pendingEmail ?? null,
			external: !r.userId && Boolean(r.externalName),
			deputy: name(r.deputyUserId),
			appointedAt: r.appointedAt,
			reportsTo,
			...(reportsToRole
				? { reportsToTitle: roleNames[reportsToRole] ?? "Rolle entfernt" }
				: {}),
			reportsDirectly: t.reportsDirectly,
			independenceBasis: t.independenceBasis ?? null,
			legalBasis:
				REQUIRED_FUNCTIONS.find((x) => x.function === r.function)?.legalBasis ??
				null,
			tasks: ownTasks.length > 0 ? ownTasks : [...t.tasks],
			powers: [...t.powers],
			resources: t.resources,
			notes: r.appointmentNotes?.trim() || null,
		};
	},
	build: buildBestellung,
	// die bestellte Person unterschreibt in ihrer Funktion
	extraSigners: (f) => [
		{
			function: f.roleKey ?? f.function,
			...(f.roleKey && f.functionTitle ? { label: f.functionTitle } : {}),
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
				orgRoleId: roleAssignments.orgRoleId,
				userId: roleAssignments.userId,
				externalName: roleAssignments.externalName,
			})
			.from(roleAssignments)
			.where(
				and(
					eq(roleAssignments.organizationId, orgId),
					effectiveAssignment(),
					ne(roleAssignments.function, "management_body"),
				),
			)
			.orderBy(asc(roleAssignments.function));
		const names = await userNames(
			tx,
			rows.map((r) => r.userId),
		);
		const roleNames = await orgRoleNames(tx, orgId);
		return rows.map((r) => ({
			id: r.id,
			label: `${(r.orgRoleId ? roleNames[r.orgRoleId] : null) ?? functionLabel(r.function)} — ${(r.userId ? names.get(r.userId) : r.externalName) ?? "nicht besetzt"}`,
		}));
	},
});
