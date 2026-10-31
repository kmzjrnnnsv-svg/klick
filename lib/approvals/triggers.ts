import { KEY_HOLDER_ROLES } from "@/db/schema/custody";
import type { EntityKind } from "@/db/schema/enums";
import {
	CHANGE_KINDS,
	CLASSIFICATIONS,
	CRITICALITY,
	NC_PRIORITIES,
	ROLE_FUNCTIONS,
} from "@/db/schema/enums";
import type { ApprovalStep } from "@/db/schema/grc";
import { RISK_CATEGORIES } from "@/db/schema/grc";
import { PROVIDER_CATEGORIES } from "@/db/schema/registers";

// Auslöser-Katalog des Freigabe-Designers — pure. Jeder Auslöser ist eine
// Stelle im Code, an der gateApproval/requestApproval aufgerufen wird; der
// Owner gestaltet je Auslöser die Abläufe (Stufen, Bedingungen, Varianten).
//
// Art:
//   pending — die Entität wartet in einem Status, bis entschieden ist
//   before  — die Aktion ist erst nach Freigabe möglich (requireApproved)

export type FactDef =
	| { key: string; type: "enum"; options: readonly string[] }
	| { key: string; type: "boolean" }
	| { key: string; type: "number" };

export type TriggerDef = {
	key: string;
	// Standard-Workflow (approval_workflows.kind)
	kind: string;
	entityType: EntityKind;
	area: "register" | "documents" | "operations" | "governance" | "special";
	mode: "pending" | "before";
	facts: readonly FactDef[];
	// hängt an einer Aktion? Nicht angeschlossene bleiben im Designer verborgen
	wired: boolean;
};

const ASSET_TYPES = [
	"system",
	"application",
	"data",
	"service",
	"device",
	"facility",
	"key_material",
	"hsm",
] as const;

const providerFacts: readonly FactDef[] = [
	{ key: "criticality", type: "enum", options: CRITICALITY },
	{ key: "category", type: "enum", options: PROVIDER_CATEGORIES },
	{ key: "isIct", type: "boolean" },
	{ key: "isOutsourcing", type: "boolean" },
	{ key: "isMaterial", type: "boolean" },
	{ key: "needsManagement", type: "boolean" },
];

// Fakten eines Dienstleisters. needsManagement fasst zusammen, wann die
// Geschäftsleitung zustimmt (kritische oder wichtige Funktion, DORA Art. 28;
// wesentliche Auslagerung, MaRisk AT 9) — Bedingungen sind UND-verknüpft,
// darum ein abgeleiteter Fakt.
export function providerFactsOf(p: {
	criticality: (typeof CRITICALITY)[number];
	category?: string | null;
	isIct: boolean;
	isOutsourcing: boolean;
	isMaterial: boolean;
}) {
	return {
		criticality: p.criticality,
		category: p.category ?? null,
		isIct: p.isIct,
		isOutsourcing: p.isOutsourcing,
		isMaterial: p.isMaterial,
		needsManagement:
			p.criticality === "critical" ||
			p.criticality === "important" ||
			(p.isOutsourcing && p.isMaterial),
	};
}
const assetFacts: readonly FactDef[] = [
	{ key: "assetType", type: "enum", options: ASSET_TYPES },
	{ key: "classification", type: "enum", options: CLASSIFICATIONS },
];
const riskFacts: readonly FactDef[] = [
	{ key: "riskCategory", type: "enum", options: RISK_CATEGORIES },
	{ key: "score", type: "number" },
];
const incidentFacts: readonly FactDef[] = [
	{
		key: "incidentClass",
		type: "enum",
		options: ["major", "significant", "minor", "unclassified"],
	},
];
const ncFacts: readonly FactDef[] = [
	{ key: "ncPriority", type: "enum", options: NC_PRIORITIES },
	{
		key: "ncSource",
		type: "enum",
		options: [
			"audit",
			"incident",
			"control_test",
			"complaint",
			"management_review",
			"self_identified",
			"security_finding",
			"custody_reconciliation",
		],
	},
];
const processFacts: readonly FactDef[] = [
	{ key: "criticality", type: "enum", options: CRITICALITY },
];
// Bestellung: welche Funktion, gehört sie zur Leitung selbst
const appointmentFacts: readonly FactDef[] = [
	{ key: "function", type: "enum", options: ROLE_FUNCTIONS },
	{ key: "isManagement", type: "boolean" },
];

export const TRIGGERS: readonly TriggerDef[] = [
	// Register
	{
		key: "provider.create",
		kind: "provider_intake",
		entityType: "provider",
		area: "register",
		mode: "pending",
		facts: providerFacts,
		wired: true,
	},
	{
		key: "provider.rating_red",
		kind: "provider_onboarding",
		entityType: "provider_rating",
		area: "register",
		mode: "pending",
		facts: providerFacts,
		wired: true,
	},
	{
		key: "asset.create",
		kind: "asset_intake",
		entityType: "asset",
		area: "register",
		mode: "pending",
		facts: assetFacts,
		wired: true,
	},
	{
		key: "asset.retire",
		kind: "asset_retirement",
		entityType: "asset",
		area: "register",
		mode: "pending",
		facts: assetFacts,
		wired: true,
	},
	{
		key: "risk.create",
		kind: "risk_intake",
		entityType: "risk",
		area: "register",
		mode: "pending",
		facts: riskFacts,
		wired: true,
	},
	{
		key: "risk.accept",
		kind: "risk_acceptance",
		entityType: "risk",
		area: "register",
		mode: "pending",
		facts: riskFacts,
		wired: true,
	},
	{
		key: "process.activate",
		kind: "process_activation",
		entityType: "process",
		area: "register",
		mode: "pending",
		facts: processFacts,
		wired: true,
	},
	{
		key: "process.change",
		kind: "process_change",
		entityType: "process",
		area: "register",
		mode: "pending",
		facts: processFacts,
		wired: true,
	},
	// Dokumente
	{
		key: "document.publish",
		kind: "document_publish",
		entityType: "document",
		area: "documents",
		mode: "pending",
		facts: [{ key: "classification", type: "enum", options: CLASSIFICATIONS }],
		wired: true,
	},
	{
		// Vernichtung einer Fassung nach Ablauf der Aufbewahrung (AP9.3);
		// entityVersionRef = Nummer der Fassung
		key: "document.destroy",
		kind: "document_destruction",
		entityType: "document",
		area: "documents",
		mode: "pending",
		facts: [{ key: "classification", type: "enum", options: CLASSIFICATIONS }],
		wired: true,
	},
	{
		// Dokumente der Art „marketing“ (MiCAR Art. 66)
		key: "marketing.publish",
		kind: "marketing",
		entityType: "document",
		area: "documents",
		mode: "pending",
		facts: [{ key: "classification", type: "enum", options: CLASSIFICATIONS }],
		wired: true,
	},
	{
		key: "control.signoff",
		kind: "control_signoff",
		entityType: "control",
		area: "documents",
		mode: "pending",
		facts: [],
		wired: false,
	},
	// Betrieb
	{
		key: "incident.report",
		kind: "incident_report",
		entityType: "incident",
		area: "operations",
		mode: "before",
		facts: incidentFacts,
		wired: true,
	},
	{
		key: "incident.close",
		kind: "incident_closure",
		entityType: "incident",
		area: "operations",
		mode: "pending",
		facts: incidentFacts,
		wired: true,
	},
	{
		key: "nonconformity.plan",
		kind: "nc_plan",
		entityType: "nonconformity",
		area: "operations",
		mode: "pending",
		facts: ncFacts,
		wired: true,
	},
	{
		key: "nonconformity.close",
		kind: "nc_close",
		entityType: "nonconformity",
		area: "operations",
		mode: "pending",
		facts: ncFacts,
		wired: true,
	},
	{
		key: "training.propose",
		kind: "training_proposal",
		entityType: "training",
		area: "operations",
		mode: "pending",
		facts: [],
		wired: true,
	},
	{
		key: "exception.request",
		kind: "exception",
		entityType: "exception",
		area: "operations",
		mode: "pending",
		facts: [],
		wired: true,
	},
	{
		// Neues Produkt, neuer Markt/Vertriebsweg, wesentliche IT-Änderung
		// (MaRisk AT 8, /aenderungen)
		key: "change.request",
		kind: "change",
		entityType: "change_request",
		area: "operations",
		mode: "pending",
		facts: [{ key: "changeKind", type: "enum", options: CHANGE_KINDS }],
		wired: true,
	},
	// Steuerung
	{
		// Funktion besetzen, neu besetzen, Vertretung ändern (ISO 27001 5.3,
		// DORA Art. 5(2), ZAG-MaRisk AT 4.4, § 7 GwG …)
		key: "role.appoint",
		kind: "role_appointment",
		entityType: "role_assignment",
		area: "governance",
		mode: "pending",
		facts: appointmentFacts,
		wired: true,
	},
	{
		key: "role.revoke",
		kind: "role_revocation",
		entityType: "role_assignment",
		area: "governance",
		mode: "pending",
		facts: appointmentFacts,
		wired: true,
	},
	{
		// Schlüsselinhaber:in einer Wallet bestellen (CCSS 1.06); Entzug
		// bleibt sofort ohne Freigabe
		key: "key_holder.appoint",
		kind: "key_holder_appointment",
		entityType: "wallet_key_holder",
		area: "governance",
		mode: "pending",
		facts: [{ key: "role", type: "enum", options: KEY_HOLDER_ROLES }],
		wired: true,
	},
	{
		// EU-Konformitätserklärung (CRA Art. 28): Datum erst mit Freigabe
		key: "product.declaration",
		kind: "product_declaration",
		entityType: "product",
		area: "special",
		mode: "pending",
		facts: [],
		wired: true,
	},
	{
		key: "objective.release",
		kind: "objective_release",
		entityType: "objective",
		area: "governance",
		mode: "pending",
		facts: [
			{ key: "indicatorType", type: "enum", options: ["kpi", "kri", "kci"] },
		],
		wired: true,
	},
	{
		key: "scope.approve",
		kind: "scope",
		entityType: "scope",
		area: "governance",
		mode: "pending",
		facts: [],
		wired: true,
	},
	{
		key: "resolution.approve",
		kind: "management_approval",
		entityType: "resolution",
		area: "governance",
		mode: "pending",
		facts: [],
		wired: true,
	},
	{
		key: "decision.request",
		kind: "management_decision",
		entityType: "decision_request",
		area: "governance",
		mode: "pending",
		facts: [],
		wired: true,
	},
	// Fachbereiche
	{
		key: "aml.risk_analysis",
		kind: "aml_risk_analysis",
		entityType: "aml_risk_analysis",
		area: "special",
		mode: "pending",
		facts: [],
		wired: true,
	},
	{
		key: "own_funds.approve",
		kind: "own_funds",
		entityType: "own_funds_calculation",
		area: "special",
		mode: "pending",
		facts: [],
		wired: true,
	},
];

export const TRIGGER_BY_KEY: ReadonlyMap<string, TriggerDef> = new Map(
	TRIGGERS.map((t) => [t.key, t]),
);

const TRIGGER_BY_KIND: ReadonlyMap<string, TriggerDef> = new Map(
	TRIGGERS.map((t) => [t.kind, t]),
);

// Auslöser eines Workflows: gespeicherter Wert, sonst aus dem kind
export function triggerOf(w: {
	trigger?: string | null;
	kind: string;
}): string | null {
	return w.trigger ?? TRIGGER_BY_KIND.get(w.kind)?.key ?? null;
}

export function triggerForKind(kind: string): TriggerDef | undefined {
	return TRIGGER_BY_KIND.get(kind);
}

// Standard-Stufen neuer Auslöser (Seed; der Owner passt sie im Designer an)
// Bestellung und Abberufung: die ganze Geschäftsleitung stimmt zu
const MANAGEMENT_ALL: ApprovalStep[] = [
	{
		order: 1,
		approverRule: "function:management_body",
		everyone: true,
		slaDays: 10,
	},
];

export const NEW_TRIGGER_STEPS: Readonly<Record<string, ApprovalStep[]>> = {
	role_appointment: MANAGEMENT_ALL,
	role_revocation: MANAGEMENT_ALL,
	key_holder_appointment: MANAGEMENT_ALL,
	provider_intake: [
		{ order: 1, approverRule: "function:outsourcing_officer", slaDays: 10 },
	],
	asset_intake: [{ order: 1, approverRule: "function:isb_ciso", slaDays: 5 }],
	asset_retirement: [
		{ order: 1, approverRule: "function:isb_ciso", slaDays: 5 },
	],
	risk_intake: [
		{ order: 1, approverRule: "function:risk_control", slaDays: 5 },
	],
	process_activation: [
		{ order: 1, approverRule: "function:compliance", slaDays: 5 },
	],
	incident_report: [
		{ order: 1, approverRule: "function:management_body", slaDays: 1 },
	],
	nc_plan: [{ order: 1, approverRule: "function:compliance", slaDays: 5 }],
	nc_close: [{ order: 1, approverRule: "function:compliance", slaDays: 5 }],
	training_proposal: [
		{ order: 1, approverRule: "function:department_head", slaDays: 10 },
	],
};
