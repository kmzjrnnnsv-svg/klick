import type { ApprovalCondition, ApprovalStep } from "@/db/schema/grc";
import type { RolePermissions } from "@/lib/auth/permissions";

// Vorlagen des Freigabe-Designers — pure. Eine Vorlage setzt die Stufen des
// Standard-Ablaufs eines Auslösers oder legt eine Variante mit Bedingung an.
// Stellen „@schlüssel“ verweisen auf eigene Rollen der Vorlage; fehlende
// Rollen legt die Vorlage an (ohne Mitglieder, Recht „Freigaben entscheiden“).

export type PresetRole = {
	key: string;
	name: string;
	description: string;
	permissions: RolePermissions;
};

export type PresetStep = Omit<ApprovalStep, "order" | "approverRule"> & {
	approvers: string[];
};

export type WorkflowPreset = {
	key: string;
	trigger: string;
	name: string;
	description: string;
	// Variante mit Bedingung statt Standard-Ablauf
	variant?: { conditions: ApprovalCondition[]; priority: number };
	roles: PresetRole[];
	steps: PresetStep[];
};

const DECIDE: RolePermissions = { approval: ["read", "decide"] };

const ROLE = {
	purchasing: {
		key: "purchasing",
		name: "Einkauf",
		description: "Nimmt Dienstleister auf und pflegt Verträge.",
		permissions: { provider: ["read", "create", "update"] },
	},
	finance: {
		key: "finance",
		name: "Finanzen",
		description: "Gibt Ausgaben und neue Dienstleister frei.",
		permissions: DECIDE,
	},
	legal: {
		key: "legal",
		name: "Recht",
		description: "Prüft Verträge und rechtliche Anforderungen.",
		permissions: DECIDE,
	},
	infosec: {
		key: "infosec",
		name: "Informationssicherheit",
		description: "Prüft Sicherheit von Dienstleistern, Assets und Änderungen.",
		permissions: DECIDE,
	},
	hr: {
		key: "hr",
		name: "Personal",
		description: "Plant Schulungen und Zuweisungen.",
		permissions: { ...DECIDE, training: ["read", "create", "update"] },
	},
} satisfies Record<string, PresetRole>;

export const WORKFLOW_PRESETS: readonly WorkflowPreset[] = [
	{
		key: "provider_departments",
		trigger: "provider.create",
		name: "Dienstleister aufnehmen: Einkauf, Finanzen, dann Recht und Informationssicherheit",
		description:
			"Einkauf legt an. Finanzen gibt frei (entfällt, wenn die anfragende Person selbst Finanzen ist), danach Recht und Informationssicherheit — beide müssen zustimmen.",
		roles: [ROLE.purchasing, ROLE.finance, ROLE.legal, ROLE.infosec],
		steps: [
			{
				label: "Finanzen",
				approvers: ["@finance"],
				skipIf: ["@finance"],
				slaDays: 5,
			},
			{
				label: "Recht und Informationssicherheit",
				approvers: ["@legal", "@infosec"],
				mode: "all",
				slaDays: 10,
			},
		],
	},
	{
		key: "provider_critical",
		trigger: "provider.create",
		name: "Kritische Dienstleister: zusätzlich Geschäftsleitung",
		description:
			"Variante für kritische oder wichtige Funktionen und wesentliche Auslagerungen: wie die Abteilungsfreigabe, danach entscheidet die Geschäftsleitung.",
		variant: {
			conditions: [{ field: "needsManagement", op: "is_true" }],
			// vor der mitgelieferten Variante „Kritischen Dienstleister aufnehmen“
			priority: 20,
		},
		roles: [ROLE.finance, ROLE.legal, ROLE.infosec],
		steps: [
			{
				label: "Finanzen",
				approvers: ["@finance"],
				skipIf: ["@finance"],
				slaDays: 5,
			},
			{
				label: "Recht und Informationssicherheit",
				approvers: ["@legal", "@infosec"],
				mode: "all",
				slaDays: 10,
			},
			{
				label: "Geschäftsleitung",
				approvers: ["function:management_body"],
				slaDays: 10,
			},
		],
	},
	{
		key: "asset_infosec",
		trigger: "asset.create",
		name: "Asset aufnehmen: Informationssicherheit",
		description:
			"Neue Assets prüft die Informationssicherheit (entfällt, wenn sie das Asset selbst anlegt).",
		roles: [ROLE.infosec],
		steps: [
			{
				label: "Informationssicherheit",
				approvers: ["@infosec", "function:isb_ciso"],
				skipIf: ["@infosec", "function:isb_ciso"],
				slaDays: 5,
			},
		],
	},
	{
		key: "risk_control",
		trigger: "risk.create",
		name: "Risiko aufnehmen: Risikocontrolling",
		description:
			"Neue Risiken prüft das Risikocontrolling, bevor sie ins Register gehen.",
		roles: [],
		steps: [
			{
				label: "Risikocontrolling",
				approvers: ["function:risk_control"],
				skipIf: ["function:risk_control"],
				slaDays: 5,
			},
		],
	},
	{
		key: "training_proposal",
		trigger: "training.propose",
		name: "Schulung vorschlagen: Bereichsleitung, dann Personal",
		description:
			"Vorschläge gibt zuerst die Bereichsleitung frei, danach plant Personal die Schulung ein.",
		roles: [ROLE.hr],
		steps: [
			{
				label: "Bereichsleitung",
				approvers: ["function:department_head"],
				skipIf: ["function:department_head"],
				slaDays: 10,
			},
			{ label: "Personal", approvers: ["@hr"], slaDays: 10 },
		],
	},
	{
		key: "nc_plan",
		trigger: "nonconformity.plan",
		name: "Maßnahmenplan freigeben: Verantwortliche:r, dann Compliance",
		description:
			"Bevor die Umsetzung beginnt, bestätigen die verantwortliche Person und Compliance den Maßnahmenplan.",
		roles: [],
		steps: [
			{
				label: "Verantwortliche:r",
				approvers: ["owner_of_entity"],
				slaDays: 5,
			},
			{ label: "Compliance", approvers: ["function:compliance"], slaDays: 5 },
		],
	},
	{
		key: "incident_report",
		trigger: "incident.report",
		name: "Meldung an die Aufsicht: Geschäftsleitung",
		description:
			"Meldungen an die Aufsicht gibt die Geschäftsleitung frei, bevor sie abgegeben werden. Die Meldefrist läuft weiter.",
		roles: [],
		steps: [
			{
				label: "Geschäftsleitung",
				approvers: ["function:management_body"],
				slaDays: 1,
			},
		],
	},
	{
		key: "process_activation",
		trigger: "process.activate",
		name: "Prozess aktivieren: Verantwortliche:r, dann Compliance",
		description:
			"Ein Prozess wird erst aktiv, wenn die verantwortliche Person und Compliance zugestimmt haben.",
		roles: [],
		steps: [
			{
				label: "Verantwortliche:r",
				approvers: ["owner_of_entity"],
				slaDays: 5,
			},
			{ label: "Compliance", approvers: ["function:compliance"], slaDays: 5 },
		],
	},
];

export const PRESET_BY_KEY: ReadonlyMap<string, WorkflowPreset> = new Map(
	WORKFLOW_PRESETS.map((p) => [p.key, p]),
);

// „@schlüssel“ → role:<id>; unbekannte Schlüssel bleiben stehen (fallen in
// der Prüfung als unbekannte Stelle auf)
export function resolvePresetSteps(
	preset: WorkflowPreset,
	roleIds: Readonly<Record<string, string>>,
): ApprovalStep[] {
	const resolve = (r: string) =>
		r.startsWith("@") && roleIds[r.slice(1)]
			? `role:${roleIds[r.slice(1)]}`
			: r;
	return preset.steps.map((s, i) => {
		const approvers = s.approvers.map(resolve);
		const step: ApprovalStep = {
			...s,
			order: i + 1,
			approverRule: approvers[0] ?? "",
			approvers,
		};
		if (s.skipIf) step.skipIf = s.skipIf.map(resolve);
		return step;
	});
}
