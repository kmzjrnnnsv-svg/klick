export type ExtractedSkill = {
	name: string;
	level?: 1 | 2 | 3 | 4 | 5;
};

export type ExtractedEmploymentType =
	| "employee"
	| "self_employed"
	| "freelance"
	| "founder"
	| "internship"
	| "other";

export type ExtractedExperience = {
	company: string;
	role: string;
	start: string; // YYYY-MM
	end?: string; // YYYY-MM or "present"
	description?: string;
	employmentType?: ExtractedEmploymentType;
};

export type ExtractedEducation = {
	institution: string;
	degree: string;
	start?: string;
	end?: string;
};

export type ExtractedCertificationMention = {
	name: string;
	issuer?: string;
	year?: string;
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
	// Richer signals the model picks out of the CV body.
	industries?: string[]; // e.g. ["Fintech", "E-commerce"]
	awards?: string[]; // recognitions, prizes, publications
	certificationsMentioned?: ExtractedCertificationMention[]; // certs cited but not uploaded
	mobility?: string; // "Remote", "Hybrid Berlin", "open to relocation"
	preferredRoleLevel?:
		| "junior"
		| "mid"
		| "senior"
		| "lead"
		| "principal"
		| "exec";
};

export type SuggestedJobRequirement = {
	name: string;
	weight: "must" | "nice";
	minLevel?: 1 | 2 | 3 | 4 | 5;
};

// Structured extraction of a complete job posting (PDF / image / text).
// All fields are optional — the model fills what it sees, the form keeps
// existing values for the rest.
export type ExtractedJobPosting = {
	title?: string;
	description?: string;
	location?: string;
	remotePolicy?: "onsite" | "hybrid" | "remote";
	employmentType?: "fulltime" | "parttime" | "contract" | "internship";
	salaryMin?: number;
	salaryMax?: number;
	yearsExperienceMin?: number;
	languages?: string[];
	requirements?: SuggestedJobRequirement[];
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

// Holistic narrative shown to employers + the candidate. Built from the
// already-computed deterministic insights (tenure, certs, gaps) plus the
// raw profile text. Never echoes raw PII back — focuses on style/strengths.
export type CandidateNarrativeInput = {
	headline: string | null;
	summary: string | null;
	yearsActive: number;
	yearsContinuous: number;
	totalRoles: number;
	currentRole?: { company: string; role: string; monthsOngoing: number };
	firstJobYear?: number;
	gaps: number; // count
	skills: string[];
	certificateCount: number;
	certificatePattern: "none" | "single" | "burst" | "steady" | "sparse";
};

export type CandidateNarrative = {
	summary: string; // 2 short sentences
	workStyle: string[]; // 3-5 short tags, e.g. "detail-oriented", "ownership"
	strengths: string[]; // 2-4 short phrases
};

// Salary benchmark for a published job. Returned in EUR by the AI provider —
// rough market-fit estimate, not a contract. Always discloses uncertainty.
export type SalaryBenchmark = {
	low: number;
	high: number;
	currency: "EUR";
	rationale: string; // single sentence, "warum dieser Bereich"
};

export type SalaryBenchmarkInput = {
	title: string;
	description: string;
	location: string | null;
	yearsRequired: number;
	level?: string; // "junior" | "mid" | "senior" | "lead" | "principal"
	requirements: string[]; // skill names
	remote: "onsite" | "hybrid" | "remote";
};

// Per-match assessment shown next to the rationale: pro/con bullets +
// short experience comparison line.
export type MatchAssessment = {
	pros: string[];
	cons: string[];
	experienceVerdict: string;
};

export type MatchAssessmentInput = {
	jobTitle: string;
	jobDescription: string;
	yearsRequired: number;
	candidateHeadline: string | null;
	candidateSummary: string | null;
	candidateYears: number | null;
	matchedSkills: string[];
	missingSkills: string[];
	adjacentSkills: string[];
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
	// Extracts a full job posting from an uploaded document. The form
	// pre-fills every returned field; the user reviews + tweaks before save.
	extractJobPosting(
		bytes: Uint8Array,
		mime: string,
	): Promise<ExtractedJobPosting>;
	matchRationale(input: MatchRationaleInput): Promise<string>;
	// Build a workStyle/strengths summary the employer reads at a glance.
	summarizeCandidate(
		input: CandidateNarrativeInput,
	): Promise<CandidateNarrative>;
	// Estimate market salary range for a published job. Used to flag jobs
	// where the employer pays under/over market, and shown to candidates as
	// a transparency signal.
	benchmarkSalary(input: SalaryBenchmarkInput): Promise<SalaryBenchmark>;
	// Pro/con + tenure summary attached to each match. Helps employers
	// decide quickly without reading the whole profile.
	assessMatch(input: MatchAssessmentInput): Promise<MatchAssessment>;
	// Grade an open-ended assessment answer against a rubric. Returns a
	// score in [0..maxPoints] plus short feedback the candidate sees.
	gradeOpenAnswer(input: {
		question: string;
		rubric: string | null;
		answer: string;
		maxPoints: number;
	}): Promise<{ pointsEarned: number; feedback: string }>;
}
