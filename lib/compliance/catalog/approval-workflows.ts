import type { EntityKind } from "@/db/schema/enums";
import type { ApprovalStep } from "@/db/schema/grc";
import { NEW_TRIGGER_STEPS } from "@/lib/approvals/triggers";

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
		kind: "management_decision",
		name: "Managemententscheidung",
		entityType: "decision_request",
		description:
			"Entscheidung beim Management angefragt (Frage, Optionen, Frist); das Ergebnis wird ein Beschluss.",
		steps: [
			{ order: 1, approverRule: "function:management_body", slaDays: 10 },
		],
		defaultEnabled: true,
	},
	{
		kind: "objective_release",
		name: "Ziel freigeben",
		entityType: "objective",
		description:
			"Vorgeschlagene Ziele und Kennzahlen (KPI/KRI/KCI) gelten erst nach Freigabe durch die Geschäftsleitung.",
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
			"Auslagerungsbeauftragte:r → Geschäftsleitung: Freigabe trotz kritischem Bewertungsergebnis bzw. bei wesentlicher Auslagerung.",
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
	// Freigabe-Designer: neue Auslöser, standardmäßig aus — der Owner baut
	// die Abläufe unter Einstellungen → Freigaben (lib/approvals/triggers.ts)
	{
		kind: "provider_intake",
		name: "Dienstleister aufnehmen",
		entityType: "provider",
		description:
			"Neuer Dienstleister steht auf „Im Aufbau“, bis die Freigabe durch ist.",
		steps: NEW_TRIGGER_STEPS.provider_intake ?? [],
		defaultEnabled: false,
	},
	{
		kind: "asset_intake",
		name: "Asset aufnehmen",
		entityType: "asset",
		description: "Neues Asset gilt erst nach Freigabe als aktiv.",
		steps: NEW_TRIGGER_STEPS.asset_intake ?? [],
		defaultEnabled: false,
	},
	{
		kind: "asset_retirement",
		name: "Asset außer Betrieb nehmen",
		entityType: "asset",
		description: "Außerbetriebnahme wird erst nach Freigabe wirksam.",
		steps: NEW_TRIGGER_STEPS.asset_retirement ?? [],
		defaultEnabled: false,
	},
	{
		kind: "risk_intake",
		name: "Risiko aufnehmen",
		entityType: "risk",
		description:
			"Neu erfasste Risiken stehen auf „Vorgeschlagen“, bis sie freigegeben sind.",
		steps: NEW_TRIGGER_STEPS.risk_intake ?? [],
		defaultEnabled: false,
	},
	{
		kind: "process_activation",
		name: "Prozess aktivieren",
		entityType: "process",
		description: "Ein Prozess-Entwurf wird erst nach Freigabe aktiv.",
		steps: NEW_TRIGGER_STEPS.process_activation ?? [],
		defaultEnabled: false,
	},
	{
		kind: "incident_report",
		name: "Meldung an die Aufsicht freigeben",
		entityType: "incident",
		description:
			"„Als gemeldet markieren“ ist erst nach Freigabe möglich — die Meldefrist läuft weiter.",
		steps: NEW_TRIGGER_STEPS.incident_report ?? [],
		defaultEnabled: false,
	},
	{
		kind: "nc_plan",
		name: "Maßnahmenplan einer Abweichung freigeben",
		entityType: "nonconformity",
		description:
			"Die Abweichung geht erst nach Freigabe des Maßnahmenplans in Bearbeitung.",
		steps: NEW_TRIGGER_STEPS.nc_plan ?? [],
		defaultEnabled: false,
	},
	{
		kind: "nc_close",
		name: "Abweichung abschließen",
		entityType: "nonconformity",
		description: "Abschluss nach Wirksamkeitsprüfung erst mit Freigabe.",
		steps: NEW_TRIGGER_STEPS.nc_close ?? [],
		defaultEnabled: false,
	},
	{
		kind: "training_proposal",
		name: "Schulung vorschlagen",
		entityType: "training",
		description:
			"Vorgeschlagene Schulungen werden erst nach Freigabe zugewiesen.",
		steps: NEW_TRIGGER_STEPS.training_proposal ?? [],
		defaultEnabled: false,
	},
];

export const WORKFLOW_BY_KIND: ReadonlyMap<string, ApprovalWorkflowTemplate> =
	new Map(APPROVAL_WORKFLOW_TEMPLATES.map((w) => [w.kind, w]));
