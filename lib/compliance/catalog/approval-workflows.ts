import type { EntityKind } from "@/db/schema/enums";
import type { ApprovalCondition, ApprovalStep } from "@/db/schema/grc";
import { NEW_TRIGGER_STEPS } from "@/lib/approvals/triggers";

// Standard-Freigabe-Abläufe (Seed je Org, unter Einstellungen > Freigaben
// anpassbar). Standardmäßig an: Bestellung/Abberufung, Beschluss,
// Managementanfrage, Ziel, Dokument, Risiko akzeptieren. Was ein Rahmenwerk
// zusätzlich verlangt (Geltungsbereich, Dienstleister, Geldwäsche-
// Risikoanalyse, Eigenmittel …), steht in approval-duties.ts und wird von
// ensureOrgWorkflows eingeschaltet, sobald das Rahmenwerk gewählt ist.

export type ApprovalWorkflowTemplate = {
	kind: string;
	name: string;
	entityType: EntityKind;
	steps: ApprovalStep[];
	defaultEnabled: boolean;
	enabledFromStage?: number;
	description: string;
	// Variante eines Auslösers (sonst Auslöser aus dem kind)
	trigger?: string;
	conditions?: ApprovalCondition[];
	priority?: number;
};

// Stufen von document_publish bis Oktober 2026: bestehende Orgs mit genau
// diesen Stufen bekommen die neuen (Freigebende je Vorlage)
export const LEGACY_DOCUMENT_PUBLISH_STEPS: ApprovalStep[] = [
	{ order: 1, approverRule: "owner_of_entity", slaDays: 5 },
	{ order: 2, approverRule: "function:compliance", slaDays: 5 },
	{ order: 3, approverRule: "function:management_body", slaDays: 10 },
];

// Altfassungen je Ablauf: unverändert übernommene Stufen werden angeglichen
// (je Ablauf alle früheren Standard-Fassungen)
export const LEGACY_STEPS: Readonly<Record<string, ApprovalStep[][]>> = {
	document_publish: [
		LEGACY_DOCUMENT_PUBLISH_STEPS,
		// bis 28.10.2026: Freigabe ohne Unterschrift
		[
			{ order: 1, approverRule: "owner_of_entity", slaDays: 5 },
			{ order: 2, approverRule: "approver_of_entity", slaDays: 10 },
		],
	],
	change: [
		[
			{ order: 1, approverRule: "function:ict_risk_function", slaDays: 5 },
			{ order: 2, approverRule: "function:management_body", slaDays: 10 },
		],
	],
};

export const APPROVAL_WORKFLOW_TEMPLATES: ApprovalWorkflowTemplate[] = [
	{
		kind: "role_appointment",
		name: "Funktion bestellen",
		entityType: "role_assignment",
		description:
			"Die Geschäftsleitung bestellt Funktionen; bei mehreren Mitgliedern stimmen alle zu. Wer einträgt und zur Geschäftsleitung gehört, zählt als erste Zustimmung.",
		steps: NEW_TRIGGER_STEPS.role_appointment ?? [],
		defaultEnabled: true,
	},
	{
		kind: "role_revocation",
		name: "Funktion abberufen",
		entityType: "role_assignment",
		description:
			"Die Abberufung wirkt erst, wenn alle Mitglieder der Geschäftsleitung zugestimmt haben; bis dahin bleibt die Besetzung bestehen.",
		steps: NEW_TRIGGER_STEPS.role_revocation ?? [],
		defaultEnabled: true,
	},
	{
		kind: "key_holder_appointment",
		name: "Schlüsselinhaber:in bestellen",
		entityType: "wallet_key_holder",
		description:
			"Neue Schlüsselinhaber:innen zählen erst nach Zustimmung aller Mitglieder der Geschäftsleitung zum Quorum (CCSS 1.06). Der Entzug wirkt sofort.",
		steps: NEW_TRIGGER_STEPS.key_holder_appointment ?? [],
		defaultEnabled: false,
	},
	{
		kind: "product_declaration",
		name: "Konformitätserklärung freigeben",
		entityType: "product",
		description:
			"Die Geschäftsleitung gibt die EU-Konformitätserklärung frei; erst dann gilt sie als ausgestellt (CRA Art. 28). Stellt sie die Geschäftsleitung selbst aus, entfällt die Stufe.",
		steps: [
			{
				order: 1,
				approverRule: "function:management_body",
				skipIf: ["function:management_body"],
				slaDays: 10,
			},
		],
		defaultEnabled: false,
	},
	{
		kind: "document_publish",
		name: "Dokument veröffentlichen",
		entityType: "document",
		description:
			"Eigner:in, dann unterschreiben alle Personen der Freigabe-Funktion des Dokuments mit ihrem Passkey (Richtlinien: die ganze Geschäftsleitung). Ist keine hinterlegt oder die Funktion nicht besetzt, entfällt die Stufe.",
		steps: [
			{ order: 1, approverRule: "owner_of_entity", slaDays: 5 },
			{
				order: 2,
				approverRule: "approver_of_entity",
				slaDays: 10,
				everyone: true,
				signature: true,
			},
		],
		defaultEnabled: true,
	},
	{
		// AP9.3: Vernichtung einer Fassung nach Ablauf der Aufbewahrung
		kind: "document_destruction",
		name: "Dokument-Fassung vernichten",
		entityType: "document",
		description:
			"Eine Fassung, deren Aufbewahrung abgelaufen ist, vernichtet Klick erst nach Freigabe der Geschäftsleitung (ISO 27001 7.5.3 f). Text und Datei sind danach weg, Prüfsumme und Verlauf bleiben. Beantragt die Geschäftsleitung selbst, entfällt die Stufe.",
		steps: [
			{
				order: 1,
				approverRule: "function:management_body",
				skipIf: ["function:management_body"],
				slaDays: 10,
			},
		],
		defaultEnabled: true,
	},
	{
		kind: "risk_acceptance",
		name: "Risiko akzeptieren",
		entityType: "risk",
		description:
			"Eigner:in, dann die Geschäftsleitung; die Stufen der Risikoklasse (Einstellungen > Risikomethodik) gehen vor.",
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
		name: "Vorfall schließen",
		entityType: "incident",
		description: "Informationssicherheit (ISB) gibt den Abschluss frei.",
		steps: [{ order: 1, approverRule: "function:isb_ciso", slaDays: 5 }],
		defaultEnabled: false,
	},
	{
		kind: "exception",
		name: "Ausnahme genehmigen",
		entityType: "exception",
		description: "Informationssicherheit (ISB), dann die Geschäftsleitung.",
		steps: [
			{ order: 1, approverRule: "function:isb_ciso", slaDays: 5 },
			{ order: 2, approverRule: "function:management_body", slaDays: 10 },
		],
		defaultEnabled: false,
	},
	{
		kind: "change",
		name: "Neues Produkt oder wesentliche Änderung",
		entityType: "change_request",
		description:
			"IKT-Risikokontrolle (nur bei IT-Änderungen), Risikocontrolling, Compliance, dann die Geschäftsleitung (MaRisk AT 8, DORA Art. 8 Abs. 3). Nicht besetzte Funktionen entfallen; beantragt die Geschäftsleitung selbst, entfällt ihre Stufe.",
		steps: [
			{
				order: 1,
				approverRule: "function:ict_risk_function",
				onlyIf: [{ field: "changeKind", op: "eq", value: "it_change" }],
				slaDays: 5,
			},
			{ order: 2, approverRule: "function:risk_control", slaDays: 5 },
			{ order: 3, approverRule: "function:compliance", slaDays: 5 },
			{
				order: 4,
				approverRule: "function:management_body",
				skipIf: ["function:management_body"],
				slaDays: 10,
			},
		],
		defaultEnabled: false,
	},
	{
		kind: "provider_onboarding",
		name: "Rote Lieferantenbewertung freigeben",
		entityType: "provider",
		description:
			"Auslagerungsbeauftragte:r, dann die Geschäftsleitung: Freigabe trotz rotem Bewertungsergebnis.",
		steps: [
			{ order: 1, approverRule: "function:outsourcing_officer", slaDays: 10 },
			{ order: 2, approverRule: "function:management_body", slaDays: 10 },
		],
		defaultEnabled: false,
	},
	{
		kind: "process_change",
		name: "Prozess ändern",
		entityType: "process",
		description: "Informationssicherheit (ISB) gibt die Änderung frei.",
		steps: [{ order: 1, approverRule: "function:isb_ciso", slaDays: 5 }],
		defaultEnabled: false,
	},
	{
		kind: "scope",
		name: "Geltungsbereich freigeben",
		entityType: "scope",
		description:
			"Die Geschäftsleitung legt den Geltungsbereich des ISMS fest (ISO 27001 Abschnitt 4.3).",
		steps: [
			{ order: 1, approverRule: "function:management_body", slaDays: 10 },
		],
		defaultEnabled: false,
	},
	{
		kind: "marketing",
		name: "Marketingmitteilung freigeben",
		entityType: "document",
		description:
			"Compliance prüft Marketingmitteilungen vor der Veröffentlichung (MiCAR Art. 66).",
		steps: [{ order: 1, approverRule: "function:compliance", slaDays: 3 }],
		defaultEnabled: false,
	},
	{
		kind: "aml_risk_analysis",
		name: "AML-Risikoanalyse freigeben",
		entityType: "aml_risk_analysis",
		description:
			"Geldwäschebeauftragte:r, dann die Geschäftsleitung (GwG § 4 Abs. 3 und § 5).",
		steps: [
			{ order: 1, approverRule: "function:aml_officer", slaDays: 5 },
			{ order: 2, approverRule: "function:management_body", slaDays: 10 },
		],
		defaultEnabled: false,
	},
	{
		kind: "own_funds",
		name: "Eigenmittelberechnung freigeben",
		entityType: "own_funds_calculation",
		description:
			"Die Geschäftsleitung gibt die Berechnung frei (MiCAR Art. 67, § 15 ZAG).",
		steps: [
			{ order: 1, approverRule: "function:management_body", slaDays: 10 },
		],
		defaultEnabled: false,
	},
	// Freigabe-Designer: weitere Auslöser, standardmäßig aus — der Owner
	// baut die Abläufe unter Einstellungen > Freigaben (lib/approvals/triggers.ts)
	{
		kind: "provider_intake",
		name: "Dienstleister aufnehmen",
		entityType: "provider",
		description:
			"Auslagerungsbeauftragte:r gibt neue Dienstleister frei; bis dahin stehen sie auf „Im Aufbau“.",
		steps: NEW_TRIGGER_STEPS.provider_intake ?? [],
		defaultEnabled: false,
	},
	{
		kind: "provider_intake_management",
		name: "Kritischen Dienstleister aufnehmen",
		entityType: "provider",
		trigger: "provider.create",
		conditions: [{ field: "needsManagement", op: "is_true" }],
		priority: 10,
		description:
			"Kritische oder wichtige Funktion bzw. wesentliche Auslagerung: Auslagerungsbeauftragte:r, dann die Geschäftsleitung.",
		steps: [
			{ order: 1, approverRule: "function:outsourcing_officer", slaDays: 10 },
			{ order: 2, approverRule: "function:management_body", slaDays: 10 },
		],
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

// Frühere Namen (Schreibfehler), die ensureOrgWorkflows angleicht
export const LEGACY_NAMES: Readonly<Record<string, string>> = {
	incident_closure: "Vorfall schliessen",
};

// Beschreibungen bis Oktober 2026: unveränderte Zeilen bestehender Orgs
// bekommen die neue Fassung (sie passt zu den Stufen)
export const LEGACY_DESCRIPTIONS: Readonly<Record<string, string>> = {
	document_publish:
		"Eigner:in, dann Compliance, bei Richtlinien zuletzt die Geschäftsleitung; Verfahren enden bei Compliance.",
	risk_acceptance:
		"Risiken über dem tolerierbaren Appetit akzeptiert nur die Geschäftsleitung.",
	incident_closure: "Incident-Manager:in, dann ISB.",
	exception:
		"Owner, dann ISB; bei kritischen Controls zusätzlich Geschäftsleitung.",
	change:
		"IT, dann IKT-Risikokontrolle, bei kritisch zuletzt die Geschäftsleitung (MaRisk AT 8, DORA 8(3)).",
	// Zwischenfassung vom 25.10.2026 (vor dem Anschluss an /aenderungen)
	change_v2:
		"IKT-Risikokontrolle, dann die Geschäftsleitung (MaRisk AT 8, DORA Art. 8 Abs. 3).",
	provider_onboarding:
		"Auslagerungsbeauftragte:r, dann Geschäftsleitung: Freigabe trotz kritischem Bewertungsergebnis bzw. bei wesentlicher Auslagerung.",
	process_change: "Prozess-Owner, dann ISB.",
	scope: "Geschäftsleitung.",
	marketing: "Vertrieb, dann Compliance (MiCAR Art. 66).",
	aml_risk_analysis:
		"Geldwäschebeauftragte:r, dann Geschäftsleitung (GwG § 5).",
	own_funds: "Finanzen, dann Geschäftsleitung (MiCAR Art. 67, § 15 ZAG).",
	provider_intake:
		"Neuer Dienstleister steht auf „Im Aufbau“, bis die Freigabe durch ist.",
};

export const WORKFLOW_BY_KIND: ReadonlyMap<string, ApprovalWorkflowTemplate> =
	new Map(APPROVAL_WORKFLOW_TEMPLATES.map((w) => [w.kind, w]));
