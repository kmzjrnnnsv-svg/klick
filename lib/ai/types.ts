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
	suggestJobRequirements(input: {
		title: string;
		description: string;
	}): Promise<SuggestedJobRequirement[]>;
	matchRationale(input: MatchRationaleInput): Promise<string>;
}
