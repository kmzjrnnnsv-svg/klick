import type {
	CaspService,
	Domain,
	LegalStatus,
	LicenceStage,
	OrgRoleLegal,
} from "@/db/schema/enums";

// Katalog-Typen (Authoring-Quelle: docs/regulatory/anforderungskatalog-2026-10.md).
// Anforderungen = das Warum (je Rahmenwerk), Controls = das Was (harmonisiert),
// Mappings = die Synergie-Kanten.

export type ISODate = `${number}-${number}-${number}`;

export type Recommendation = {
	level: "must" | "should" | "could";
	text: string;
	source?:
		| "BSI IT-Grundschutz"
		| "ISO 27002"
		| "ENISA"
		| "EBA GL"
		| "ESMA"
		| "BaFin"
		| "FATF"
		| "EDPB"
		| "intern";
	ref?: string;
};

export type Tools = { startup: string[]; scale: string[] };

export type CatalogFrameworkMeta = {
	slug: string;
	name: string;
	version?: string;
	authority?: string;
	jurisdiction: "global" | "eu" | "de" | "uk" | "ae" | "bh" | "ch" | "br";
	legalBasis?: string;
	legalBasisRefs?: string[];
	description: string;
	recommendedApproach?: string;
	sourceUrl?: string;
	successorSlug?: string;
	sortOrder: number;
	// Für Nicht-Finanz-Kunden relevant (NIS2) oder nur ab Lizenzstufe (KWG).
	appliesFromStage?: LicenceStage;
	phase: "P1" | "P4" | "P5";
};

export type CatalogSection = { code: string; title: string; sortOrder: number };

export type CatalogRequirement = {
	code: string;
	sectionCode: string;
	title: string;
	requirementText: string;
	guidance?: string;
	legalBasisRefs?: string[];
	domain: Domain;
	services?: CaspService[];
	appliesFromStage?: LicenceStage;
	appliesToRoles?: OrgRoleLegal[];
	effectiveFrom?: ISODate;
	effectiveUntil?: ISODate;
	legalStatus?: LegalStatus;
	evidenceHints?: string[];
	sourceUrl?: string;
	relatedRequirements?: `${string}:${string}`[];
	recommendations?: Recommendation[];
	auditQuestions?: string[];
	pitfalls?: string[];
	tools?: Tools;
	sortOrder: number;
};

export type CatalogFramework = CatalogFrameworkMeta & {
	sections: CatalogSection[];
	requirements: CatalogRequirement[];
};

export type CatalogControl = {
	code: `CC-${string}-${string}`;
	title: string;
	description: string;
	implementationGuidance?: string;
	domain: Domain;
	effort: "S" | "M" | "L";
	kind: "technical" | "organizational" | "documentation" | "process";
	evidenceHints?: string[];
	recommendations?: Recommendation[];
	auditQuestions?: string[];
	templates?: string[];
	processes?: string[];
	obligations?: string[];
	tools?: Tools;
	sortOrder: number;
};

export type CatalogControlMapping = {
	control: string;
	requirement: `${string}:${string}`; // framework:code
	coverage: "full" | "partial";
	note?: string;
};
