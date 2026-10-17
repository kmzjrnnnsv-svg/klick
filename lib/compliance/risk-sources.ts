// Risiken aus allem erfassen (B1): Herkunft am Risiko (risks.sourceEntity*),
// Vorbelegung des Risiko-Assistenten je Quelle. Pure, getestet
// (tests/risk-sources.test.ts); Daten lädt loadRiskSource
// (queries-risk-wizard.ts).

import type { EntityKind } from "@/db/schema/enums";
import type { RISK_CATEGORIES } from "@/db/schema/grc";

type RiskCategory = (typeof RISK_CATEGORIES)[number];

export const RISK_SOURCE_KINDS = [
	"provider",
	"provider_rating",
	"asset",
	"process",
	"incident",
	"requirement",
	"control",
	"security_finding",
	"nonconformity",
	"audit_finding",
	"product",
	"objective",
] as const satisfies readonly EntityKind[];
export type RiskSourceKind = (typeof RISK_SOURCE_KINDS)[number];

// URL-Parameter des Assistenten (/risiken/neu?<param>=<id>)
export const RISK_SOURCE_PARAM: Record<RiskSourceKind, string> = {
	provider: "dienstleister",
	provider_rating: "bewertung",
	asset: "asset",
	process: "prozess",
	incident: "vorfall",
	requirement: "anforderung",
	control: "control",
	security_finding: "befund",
	nonconformity: "abweichung",
	audit_finding: "finding",
	product: "produkt",
	objective: "ziel",
};

export const isRiskSourceKind = (
	k: string | null | undefined,
): k is RiskSourceKind =>
	(RISK_SOURCE_KINDS as readonly string[]).includes(k ?? "");

export function riskSourceFromParams(
	sp: Record<string, string | string[] | undefined>,
): { kind: RiskSourceKind; id: string } | null {
	const UUID = /^[0-9a-f-]{36}$/i;
	for (const kind of RISK_SOURCE_KINDS) {
		const raw = sp[RISK_SOURCE_PARAM[kind]];
		const id = Array.isArray(raw) ? raw[0] : raw;
		if (id && UUID.test(id)) return { kind, id };
	}
	return null;
}

export function newRiskHref(kind: RiskSourceKind, id: string): string {
	return `/risiken/neu?${RISK_SOURCE_PARAM[kind]}=${id}`;
}

// Was der Assistent über die Quelle weiß (geladen im Org-Kontext)
export type RiskSourceData = {
	kind: RiskSourceKind;
	id: string;
	// Anzeige: „Dienstleister „Hetzner““ — und Link zur Quelle
	label: string;
	name: string;
	href: string;
	// fachliche Merkmale für die Szenario-Wahl
	providerCritical?: boolean;
	ratingTraffic?: "red" | "amber" | "green" | null;
	assetType?: string;
	lifecycle?:
		| "expired"
		| "soon"
		| "no_maintenance"
		| "stale_patch"
		| "ok"
		| null;
	incidentPersonalData?: boolean;
	incidentPayments?: boolean;
	findingCategory?: string;
	findingProduct?: boolean;
	frameworkSlug?: string;
	indicatorType?: "kpi" | "kri" | "kci";
	detail?: string;
	// Bezüge, die der Assistent übernimmt
	providerId?: string;
	assetId?: string;
	processId?: string;
	controlCodes?: string[];
};

const AML_FRAMEWORKS = new Set(["gwg", "amlr", "tfr", "sanctions"]);

// Passendes Szenario aus lib/compliance/catalog/risk-scenarios.ts — null,
// wenn keins sinnvoll passt (dann Titel aus der Quelle).
export function scenarioForSource(src: RiskSourceData): string | null {
	switch (src.kind) {
		case "provider":
		case "provider_rating":
			if (src.ratingTraffic === "red") return "RS-TPR-03";
			return src.providerCritical ? "RS-TPR-01" : "RS-TPR-03";
		case "asset":
			if (src.assetType === "key_material" || src.assetType === "hsm")
				return "RS-CRY-01";
			if (
				src.lifecycle === "expired" ||
				src.lifecycle === "no_maintenance" ||
				src.lifecycle === "stale_patch"
			)
				return "RS-ISM-05";
			return src.assetType === "facility" ? "RS-BCM-05" : "RS-BCM-01";
		case "process":
			return "RS-BCM-03";
		case "incident":
			if (src.incidentPersonalData) return "RS-PRV-01";
			if (src.incidentPayments) return "RS-PAY-03";
			return "RS-BCM-07";
		case "security_finding":
			if (src.findingProduct) return "RS-PRD-01";
			if (src.findingCategory === "secret") return "RS-ISM-04";
			if (
				src.findingCategory === "config" ||
				src.findingCategory === "exposure"
			)
				return "RS-ISM-06";
			return "RS-ISM-05";
		case "product":
			return "RS-PRD-01";
		case "requirement":
			if (src.frameworkSlug && AML_FRAMEWORKS.has(src.frameworkSlug))
				return "RS-AML-01";
			if (src.frameworkSlug === "dsgvo") return "RS-PRV-04";
			if (src.frameworkSlug === "cra") return "RS-PRD-02";
			return null;
		case "nonconformity":
		case "audit_finding":
			return "RS-FIN-01";
		case "control":
		case "objective":
			return null;
	}
}

// Titel/Kategorie, wenn kein Szenario passt
export function fallbackForSource(src: RiskSourceData): {
	title: string;
	category: RiskCategory;
} {
	switch (src.kind) {
		case "requirement":
			return {
				title: `Anforderung nicht erfüllt: ${src.name}`,
				category: "compliance_legal",
			};
		case "control":
			return {
				title: `Control nicht wirksam: ${src.name}`,
				category: "operational",
			};
		case "objective":
			return {
				title:
					src.indicatorType === "kri"
						? `Risikokennzahl über Schwelle: ${src.name}`
						: `Ziel verfehlt: ${src.name}`,
				category: "strategic",
			};
		default:
			return { title: src.name, category: "operational" };
	}
}

// Beschreibung im Assistenten („Was würde passieren?“-Vorschlag ergänzt)
export function sourceNote(src: RiskSourceData): string {
	return src.detail
		? `Erfasst aus ${src.label}: ${src.detail}`
		: `Erfasst aus ${src.label}.`;
}
