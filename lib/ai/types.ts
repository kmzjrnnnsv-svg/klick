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
	/** Format: `lang:level` where level ∈ {native, c2, c1, b2, b1, a2, a1}. Example: "de:native". */
	languages?: string[];
	skills?: ExtractedSkill[];
	experience?: ExtractedExperience[];
	education?: ExtractedEducation[];
	summary?: string;
};

export interface AIProvider {
	readonly slug: string;
	parseCv(bytes: Uint8Array, mime: string): Promise<ExtractedProfile>;
}
