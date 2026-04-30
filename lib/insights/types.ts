// Computed insights surfaced on the candidate profile + in the employer match
// view. All derived from the candidate's structured profile + vault items;
// no user input. Re-computed on every profile/vault change.

export type ExperienceConflict = {
	declared: number;
	computed: number;
	delta: number; // declared - computed (positive = declared more than reality)
	severity: "none" | "minor" | "major";
};

export type TenureStats = {
	totalRoles: number;
	averageMonths: number;
	longestMonths: number;
	shortestMonths: number;
	currentRole?: {
		company: string;
		role: string;
		sinceYearMonth: string; // YYYY-MM
		monthsOngoing: number;
	};
	firstJob?: {
		company: string;
		role: string;
		startYearMonth: string;
	};
	gaps: Array<{
		fromYearMonth: string;
		toYearMonth: string;
		months: number;
	}>;
};

export type CertificateStats = {
	total: number;
	valid: number;
	expired: number;
	withoutDate: number;
	// Distribution per year (e.g. {"2024": 3, "2023": 1}). Used to spot
	// "burst learner" vs "steady". Empty when no certs have a year.
	perYear: Record<string, number>;
	pattern: "none" | "single" | "burst" | "steady" | "sparse";
	// Issuer names (deduped) — surfaced so employers can eyeball legitimacy.
	issuers: string[];
};

export type CandidateInsights = {
	computedAt: string; // ISO

	experience: {
		yearsContinuous: number;
		yearsActive: number;
		conflict: ExperienceConflict;
	};
	tenure: TenureStats;
	certificates: CertificateStats;

	// Optional, set by AIProvider.summarizeCandidate. Skipped when no AI is
	// configured or the call fails — UI falls back to the deterministic blocks.
	narrative?: {
		summary: string;
		workStyle: string[];
		strengths: string[];
	};
};
