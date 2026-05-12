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
	// false wenn der CV "abgebrochen", "ohne Abschluss" o.Ä. signalisiert.
	// Default: true (regulär abgeschlossen).
	completed?: boolean;
	degreeType?:
		| "school"
		| "apprenticeship"
		| "bachelor"
		| "master"
		| "phd"
		| "mba"
		| "other";
	grade?: string;
	thesisTitle?: string;
	focus?: string;
};

export type ExtractedPublication = {
	title: string;
	year?: string;
	kind?: "article" | "talk" | "patent" | "book" | "other";
	venue?: string;
	url?: string;
};

export type ExtractedProject = {
	name: string;
	role?: string;
	url?: string;
	description?: string;
};

export type ExtractedVolunteering = {
	organization: string;
	role: string;
	start?: string;
	end?: string;
	description?: string;
};

export type ExtractedAvailability = {
	status: "immediate" | "notice" | "date" | "unknown";
	noticeWeeks?: number;
	availableFrom?: string;
};

export type ExtractedSocialLinks = {
	github?: string;
	linkedin?: string;
	xing?: string;
	website?: string;
};

export type ExtractedCertificationMention = {
	// Offizielle Anbieter-Bezeichnung wenn erkannt; sonst CV-Original.
	name: string;
	// Offizieller Aussteller (ISACA, PECB, Microsoft, AXELOS, ISC2, BSI, …).
	issuer?: string;
	year?: string;
	status?: "obtained" | "in_preparation" | "course_completed" | "unknown";
	// CV-Original-Wortlaut, nur gesetzt wenn `name` zur offiziellen
	// Bezeichnung normalisiert wurde.
	verbatim?: string;
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
	publications?: ExtractedPublication[];
	projects?: ExtractedProject[];
	volunteering?: ExtractedVolunteering[];
	drivingLicenses?: string[];
	availability?: ExtractedAvailability;
	socialLinks?: ExtractedSocialLinks;
	workPermitStatus?: "eu" | "permit" | "requires_sponsorship" | "unknown";
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
//
// IMPORTANT — Jahres-Semantik:
//   yearsActive          = GESAMT-Berufserfahrung inkl. der aktuellen Rolle.
//   currentRoleYears     = wie lange der/die Bewerber:in in der aktuellen
//                          Rolle ist (Teil von yearsActive).
//   previousYearsBeforeCurrent = yearsActive - currentRoleYears.
//                          Genau dieser Wert darf "zuvor X Jahre" formuliert
//                          werden. yearsActive niemals als "zuvor".
//   asOf                 = Datum auf das die Berechnung sich bezieht
//                          (typischerweise heute), wird im Profil-Lesart
//                          NICHT erwähnt — nur intern für Drift-Erkennung.
export type CandidateNarrativeInput = {
	headline: string | null;
	summary: string | null;
	yearsActive: number;
	yearsContinuous: number;
	previousYearsBeforeCurrent: number;
	totalRoles: number;
	currentRole?: { company: string; role: string; monthsOngoing: number };
	firstJobYear?: number;
	gaps: number; // count
	skills: Array<{ name: string; level?: number }>;
	certificateCount: number;
	certificatePattern: "none" | "single" | "burst" | "steady" | "sparse";
	asOf: string; // ISO yyyy-mm-dd
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

// Pro Land empfohlene Gehaltsband für ein Profil. Wird genutzt wenn der/die
// Kandidat:in sich auf Stellen in einem anderen Land bewerben will und den
// lokalen Markt nicht kennt.
export type CandidateSalaryRecommendationInput = {
	profile: ExtractedProfile;
	country: string; // ISO Country Code
	currency: string; // 3-Letter (EUR, GBP, USD, CHF)
};

export type CandidateSalaryRecommendation = {
	low: number;
	mid: number;
	high: number;
	currency: string;
	rationale: string; // 1-2 Sätze, warum dieses Band für genau dieses Land
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
		// UI-Locale des Arbeitgebers — gibt's vor, in welcher Sprache die
		// Skills zurückkommen sollen. Default: Sprache der Beschreibung.
		locale?: "de" | "en";
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
	// Suggest 5 mini-assessment questions from a job posting. Mix of MC
	// and open. The employer reviews + tweaks before saving.
	suggestAssessmentQuestions(input: {
		title: string;
		description: string;
		requirements: { name: string; weight: "must" | "nice" }[];
	}): Promise<
		Array<
			| {
					kind: "mc";
					body: string;
					choices: { text: string; weight: number }[];
					correctChoice: number;
					maxPoints: number;
			  }
			| {
					kind: "open";
					body: string;
					rubric: string;
					maxPoints: number;
			  }
		>
	>;
	// Comprehensive career analysis on top of the parsed CV. Used to give
	// the candidate a substantial "what do I bring + where can I go" view
	// and the employer / headhunter additional context. All fields can be
	// empty arrays — never throw.
	analyzeCareerProspects(input: {
		profile: ExtractedProfile;
		yearsActive?: number;
		insights?: unknown;
		// UI-Sprache in der die prose-Felder (headline, rationales, notes)
		// formuliert werden sollen. Default 'de'.
		locale?: "de" | "en";
	}): Promise<CareerAnalysis>;
	// Analytical signal on a job posting itself. Helps employers/headhunter
	// see whether the role is well-described and helps the matching engine
	// later reason about quality.
	assessJobPostingQuality(input: {
		title: string;
		description: string;
		requirements: { name: string; weight: "must" | "nice" }[];
		salaryMin: number | null;
		salaryMax: number | null;
		remotePolicy: string;
	}): Promise<JobPostingQuality>;
	// Übersetzt textuelle Profilinhalte in die andere Sprache (DE↔EN).
	// Eigennamen, Firmen, Personennamen, Standorte und feststehende
	// Skill-Bezeichnungen (ISO 27001, AWS, …) bleiben unverändert.
	translateProfile(
		input: ProfileTranslationInput,
	): Promise<ProfileTranslationOutput>;
	// Empfohlenes Gehaltsband für genau dieses Profil in einem konkreten Land.
	// Berücksichtigt Skill-Mix, Erfahrung, Branche und lokales Lohnniveau.
	recommendCandidateSalary(
		input: CandidateSalaryRecommendationInput,
	): Promise<CandidateSalaryRecommendation>;
	// Generische Text-Übersetzung — für Freitexte (Nachrichten, Notizen,
	// Snapshot-Skills). Eigennamen, Firmen, Standorte, feststehende
	// Skill-Bezeichnungen (ISO 27001, AWS, …) bleiben unverändert. Wenn
	// `texts` mehrere Strings hat, kommen sie in derselben Reihenfolge
	// zurück. Robuster Fallback: bei Fehler liefert das Provider die
	// Originale 1:1 zurück, niemals throw.
	translateTexts(input: {
		texts: string[];
		from: "de" | "en";
		to: "de" | "en";
		// Hilft dem Modell, Konsistenz zu halten ("Skill-Namen", "Notiz",
		// "Nachricht zwischen Recruiter und Kandidat:in" usw.)
		context?: string;
	}): Promise<string[]>;
}

export type ProfileTranslationInput = {
	from: "de" | "en";
	to: "de" | "en";
	headline?: string | null;
	summary?: string | null;
	industries?: string[] | null;
	skills?: { name: string; level?: number }[] | null;
	experience?:
		| {
				role: string;
				description?: string | null;
		  }[]
		| null;
	education?:
		| {
				degree: string;
				thesisTitle?: string | null;
				focus?: string | null;
		  }[]
		| null;
	awards?: string[] | null;
	mobility?: string | null;
	projects?:
		| {
				name: string;
				role?: string | null;
				description?: string | null;
		  }[]
		| null;
	publications?:
		| {
				title: string;
				venue?: string | null;
		  }[]
		| null;
	volunteering?:
		| {
				organization: string;
				role: string;
				description?: string | null;
		  }[]
		| null;
};

export type ProfileTranslationOutput = {
	headline?: string;
	summary?: string;
	industries?: string[];
	skills?: { name: string; level?: number }[];
	experience?: { role: string; description?: string }[];
	education?: { degree: string; thesisTitle?: string; focus?: string }[];
	awards?: string[];
	mobility?: string;
	projects?: { name: string; role?: string; description?: string }[];
	publications?: { title: string; venue?: string }[];
	volunteering?: {
		organization: string;
		role: string;
		description?: string;
	}[];
};

// Shape returned by analyzeCareerProspects. Rich enough to power a
// dedicated /profile section.
export type CareerAnalysis = {
	// Sprache in der die prose-Felder geschrieben sind. Wird bei der
	// Generierung gesetzt; Felder ohne language gelten implizit als 'de'
	// (alte DB-Einträge vor diesem Feld).
	language?: "de" | "en";
	// One-paragraph executive summary (~80 words).
	headline: string;
	// 3-5 strengths the candidate can lean into.
	strengths: string[];
	// 3-5 honest weaknesses or risks (used internally; visible to the
	// candidate as "growth areas").
	growthAreas: string[];
	// Salary band the candidate could realistically command at their
	// current level + market.
	salary: {
		low: number;
		mid: number;
		high: number;
		currency: string;
		rationale: string;
	};
	// Industries that would obviously fit (based on stated experience).
	primaryIndustries: string[];
	// Industries that aren't immediately obvious but would be a strong
	// fit given the skill mix.
	adjacentIndustries: { name: string; rationale: string }[];
	// Concrete certifications worth pursuing in the next 12 months.
	certificationSuggestions: {
		name: string;
		issuer: string;
		why: string;
		effortHours: number;
	}[];
	// Job titles the candidate should look at, including non-obvious ones.
	roleSuggestions: { title: string; rationale: string; obvious: boolean }[];
	// Pro / contra hiring this candidate, employer-facing.
	hiringPros: string[];
	hiringCons: string[];
	// Current market context for this kind of profile.
	marketContext: {
		demand: "high" | "medium" | "low";
		notes: string;
	};
};

// Quality assessment of a posted job. Used to nudge employers to write
// better descriptions and to surface red flags to candidates.
export type JobPostingQuality = {
	score: number; // 0-100
	completeness: number; // 0-100 — has salary, location, requirements, …
	clarity: number; // 0-100 — is the description specific enough
	redFlags: string[];
	suggestions: string[];
};
