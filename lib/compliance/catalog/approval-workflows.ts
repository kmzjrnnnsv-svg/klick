import type { EntityKind } from "@/db/schema/enums";
import type { ApprovalStep } from "@/db/schema/grc";

// Standard-Freigabe-Workflows (Seed je Org, in /einstellungen anpassbar).
// Standardmässig aktiv: document_publish, risk_acceptance, management_approval.
// Stufe ≥ 2 aktiviert zusätzlich change, provider_onboarding,
// aml_risk_analysis, own_funds (P4).

export type ApprovalWorkflowTemplate = {
	kind: string;
	name: string;
	entityType: EntityKind;
	steps: ApprovalStep[];
	defaultEnabled: boolean;
	enabledFromStage?: number;
	description: string;
};

export const APPROVAL_WORKFLOW_TEMPLATES: ApprovalWorkflowTemplate[] = [
	{
		kind: "document_publish",
		name: "Dokument veröffentlichen",
		entityType: "document",
		description:
			"Eigner:in → Compliance → Geschäftsleitung (Richtlinien); Verfahren enden bei Compliance.",
		steps: [
			{ order: 1, approverRule: "owner_of_entity", slaDays: 5 },
			{ order: 2, approverRule: "function:compliance", slaDays: 5 },
			{ order: 3, approverRule: "function:management_body", slaDays: 10 },
		],
		defaultEnabled: true,
	},
	{
		kind: "risk_acceptance",
		name: "Risiko akzeptieren",
		entityType: "risk",
		description:
			"Risiken über dem tolerierbaren Appetit akzeptiert nur die Geschäftsleitung.",
		steps: [
			{ order: 1, approverRule: "owner_of_entity", slaDays: 5 },
			{ order: 2, approverRule: "function:management_body", slaDays: 10 },
		],
		defaultEnabled: true,
	},
	{
		kind: "management_approval",
		name: "Genehmigung der Leitung",
		entityType: "resolution",
		description:
			"Erzeugt einen Beschluss der Geschäftsleitung (Rahmenwerk, Strategie, Budget, Appetit).",
		steps: [
			{ order: 1, approverRule: "function:management_body", slaDays: 10 },
		],
		defaultEnabled: true,
	},
	{
		kind: "control_signoff",
		name: "Control abnehmen",
		entityType: "control",
		description:
			"Umsetzung bleibt bis zur Abnahme durch den/die ISB vorläufig.",
		steps: [{ order: 1, approverRule: "function:isb_ciso", slaDays: 5 }],
		defaultEnabled: false,
	},
	{
		kind: "incident_closure",
		name: "Vorfall schliessen",
		entityType: "incident",
		description: "Incident-Manager:in → ISB.",
		steps: [{ order: 1, approverRule: "function:isb_ciso", slaDays: 5 }],
		defaultEnabled: false,
	},
	{
		kind: "exception",
		name: "Ausnahme genehmigen",
		entityType: "exception",
		description:
			"Owner → ISB; bei kritischen Controls zusätzlich Geschäftsleitung.",
		steps: [
			{ order: 1, approverRule: "function:isb_ciso", slaDays: 5 },
			{ order: 2, approverRule: "function:management_body", slaDays: 10 },
		],
		defaultEnabled: false,
	},
	{
		kind: "change",
		name: "Änderung / neues Produkt",
		entityType: "task",
		description:
			"IT → IKT-Risikokontrolle → Geschäftsleitung bei kritisch (MaRisk AT 8, DORA 8(3)).",
		steps: [
			{ order: 1, approverRule: "function:ict_risk_function", slaDays: 5 },
			{ order: 2, approverRule: "function:management_body", slaDays: 10 },
		],
		defaultEnabled: false,
		enabledFromStage: 2,
	},
	{
		kind: "provider_onboarding",
		name: "Dienstleister aufnehmen",
		entityType: "provider",
		description:
			"Auslagerungsbeauftragte:r → Geschäftsleitung bei wesentlicher Auslagerung.",
		steps: [
			{ order: 1, approverRule: "function:outsourcing_officer", slaDays: 10 },
			{ order: 2, approverRule: "function:management_body", slaDays: 10 },
		],
		defaultEnabled: false,
		enabledFromStage: 2,
	},
	{
		kind: "process_change",
		name: "Prozess ändern",
		entityType: "process",
		description: "Prozess-Owner → ISB.",
		steps: [{ order: 1, approverRule: "function:isb_ciso", slaDays: 5 }],
		defaultEnabled: false,
	},
	{
		kind: "scope",
		name: "Geltungsbereich freigeben",
		entityType: "scope",
		description: "Geschäftsleitung.",
		steps: [
			{ order: 1, approverRule: "function:management_body", slaDays: 10 },
		],
		defaultEnabled: false,
	},
	{
		kind: "marketing",
		name: "Marketingmitteilung freigeben",
		entityType: "document",
		description: "Vertrieb → Compliance (MiCAR Art. 66).",
		steps: [{ order: 1, approverRule: "function:compliance", slaDays: 3 }],
		defaultEnabled: false,
		enabledFromStage: 1,
	},
	{
		kind: "aml_risk_analysis",
		name: "AML-Risikoanalyse freigeben",
		entityType: "aml_risk_analysis",
		description: "Geldwäschebeauftragte:r → Geschäftsleitung (GwG § 5).",
		steps: [
			{ order: 1, approverRule: "function:aml_officer", slaDays: 5 },
			{ order: 2, approverRule: "function:management_body", slaDays: 10 },
		],
		defaultEnabled: false,
		enabledFromStage: 2,
	},
	{
		kind: "own_funds",
		name: "Eigenmittelberechnung freigeben",
		entityType: "own_funds_calculation",
		description: "Finanzen → Geschäftsleitung (MiCAR Art. 67, § 15 ZAG).",
		steps: [
			{ order: 1, approverRule: "function:management_body", slaDays: 10 },
		],
		defaultEnabled: false,
		enabledFromStage: 2,
	},
];

export const WORKFLOW_BY_KIND: ReadonlyMap<string, ApprovalWorkflowTemplate> =
	new Map(APPROVAL_WORKFLOW_TEMPLATES.map((w) => [w.kind, w]));
