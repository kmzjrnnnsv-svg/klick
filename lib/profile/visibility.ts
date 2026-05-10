import type {
	CandidateProfile,
	ProfileSectionKey,
	ProfileSectionVisibility,
} from "@/db/schema";

// Standardregeln: ohne explizite Auswahl ist Basics/Summary/Skills "matches_only"
// sichtbar (also nicht-public). Sensible Sektionen (Salary, Availability) bleiben
// matches_only by default. Der Kandidat muss "public" aktiv setzen.
const DEFAULT_VISIBILITY: Record<
	ProfileSectionKey,
	"private" | "matches_only" | "public"
> = {
	basics: "matches_only",
	summary: "matches_only",
	skills: "matches_only",
	experience: "matches_only",
	education: "matches_only",
	certifications: "matches_only",
	publications: "matches_only",
	projects: "matches_only",
	volunteering: "matches_only",
	awards: "matches_only",
	industries: "matches_only",
	availability: "matches_only",
	socialLinks: "matches_only",
	drivingLicenses: "matches_only",
	salary: "private",
};

export const ALL_SECTIONS: ProfileSectionKey[] = [
	"basics",
	"summary",
	"skills",
	"experience",
	"education",
	"certifications",
	"publications",
	"projects",
	"volunteering",
	"awards",
	"industries",
	"availability",
	"socialLinks",
	"drivingLicenses",
	"salary",
];

export function visibilityFor(
	section: ProfileSectionKey,
	map: ProfileSectionVisibility | null | undefined,
): "private" | "matches_only" | "public" {
	return map?.[section] ?? DEFAULT_VISIBILITY[section];
}

export function isVisibleAt(
	section: ProfileSectionKey,
	map: ProfileSectionVisibility | null | undefined,
	scope: "matches" | "public",
): boolean {
	const v = visibilityFor(section, map);
	if (v === "private") return false;
	if (scope === "matches") return v === "matches_only" || v === "public";
	return v === "public";
}

// Liefert ein Profil-Objekt, in dem Felder gesperrter Sektionen auf null/[]
// gesetzt sind. Das Format passt 1:1 zum Drizzle-Row, nur eben "redacted".
export function redactProfile(
	profile: CandidateProfile,
	scope: "matches" | "public",
): CandidateProfile {
	const map = profile.sectionVisibility;
	const allow = (s: ProfileSectionKey) => isVisibleAt(s, map, scope);

	return {
		...profile,
		// Basics (displayName, headline, location, yearsExperience, languages)
		displayName: allow("basics") ? profile.displayName : null,
		headline: allow("basics") ? profile.headline : null,
		location: allow("basics") ? profile.location : null,
		yearsExperience: allow("basics") ? profile.yearsExperience : null,
		languages: allow("basics") ? profile.languages : null,
		summary: allow("summary") ? profile.summary : null,
		skills: allow("skills") ? profile.skills : null,
		experience: allow("experience") ? profile.experience : null,
		education: allow("education") ? profile.education : null,
		certificationsMentioned: allow("certifications")
			? profile.certificationsMentioned
			: null,
		publications: allow("publications") ? profile.publications : null,
		projects: allow("projects") ? profile.projects : null,
		volunteering: allow("volunteering") ? profile.volunteering : null,
		awards: allow("awards") ? profile.awards : null,
		industries: allow("industries") ? profile.industries : null,
		availability: allow("availability") ? profile.availability : null,
		socialLinks: allow("socialLinks") ? profile.socialLinks : null,
		drivingLicenses: allow("drivingLicenses") ? profile.drivingLicenses : null,
		salaryMin: allow("salary") ? profile.salaryMin : null,
		salaryDesired: allow("salary") ? profile.salaryDesired : null,
	};
}
