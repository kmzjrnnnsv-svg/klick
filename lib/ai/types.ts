export type ExtractedSkill = {
	name: string;
	level?: 1 | 2 | 3 | 4 | 5;
};

export type ExtractedExperience = {
	company: string;
	role: string;
	start: string; // YYYY-MM
	end?: string; // YYYY-MM or "present"
	description?: string;
};

export type ExtractedEducation = {
	institution: string;
	degree: string;
	start?: string;
	end?: string;
};

export type ExtractedProfile = {
	displayName?: string;
	headline?: string;
	location?: string;
	yearsExperience?: number;
	languages?: string[];
	skills?: ExtractedSkill[];
	experience?: ExtractedExperience[];
	education?: ExtractedEducation[];
	summary?: string;
};

export type SuggestedJobRequirement = {
	name: string;
	weight: "must" | "nice";
	minLevel?: 1 | 2 | 3 | 4 | 5;
};

// Light-weight metadata extracted from non-CV documents. Each extractor
// returns at most this set of fields; missing fields stay undefined.

export type ExtractedCertificate = {
	title?: string;
	issuer?: string;
	subject?: string;
	grade?: string;
	issuedAt?: string; // YYYY-MM(-DD)
	expiresAt?: string;
	credentialId?: string;
};

// Identity documents — minimal, never extract MRZ or photo. Used purely so
// the candidate can label a vault item without typing.
export type ExtractedIdDoc = {
	docType?: "passport" | "id_card" | "drivers_license" | "other";
	fullName?: string;
	expiresAt?: string;
};

export type ExtractedBadgeFile = {
	name?: string;
	issuerName?: string;
	issuedAt?: string;
	criteriaUrl?: string;
	imageUrl?: string;
};

// Discriminated union covering every kind extractDocument can return.
export type ExtractedDocument =
	| { kind: "cv"; data: ExtractedProfile }
	| { kind: "certificate"; data: ExtractedCertificate }
	| { kind: "id_doc"; data: ExtractedIdDoc }
	| { kind: "badge"; data: ExtractedBadgeFile }
	| { kind: "other"; data: Record<string, unknown> };

export type MatchRationaleInput = {
	jobTitle: string;
	jobDescription: string;
	candidateHeadline: string | null | undefined;
	candidateSummary: string | null | undefined;
	matchedSkills: string[];
	missingSkills: string[];
	yearsExperience: number | null | undefined;
	yearsRequired: number | null | undefined;
};

export interface AIProvider {
	readonly slug: string;
	parseCv(bytes: Uint8Array, mime: string): Promise<ExtractedProfile>;
	// Generic document extractor used by uploadVaultItem after a fresh upload.
	// Implementations may dispatch on `hint` (the heuristic kind from the
	// filename) or re-detect from content. Should always return a discriminated
	// union — never throw on unrecognized content; return { kind: "other" }.
	extractDocument(
		bytes: Uint8Array,
		mime: string,
		hint: "cv" | "certificate" | "badge" | "id_doc" | "other",
	): Promise<ExtractedDocument>;
	suggestJobRequirements(input: {
		title: string;
		description: string;
	}): Promise<SuggestedJobRequirement[]>;
	matchRationale(input: MatchRationaleInput): Promise<string>;
}
