import type { CandidateProfile, ProfileTranslationFields } from "@/db/schema";

// Liefert die in der angegebenen UI-Locale anzuzeigenden Profil-Felder.
// Fallback-Reihenfolge: translations[locale] → translations[other] →
// Original-Felder. Felder die in der Übersetzung NICHT enthalten sind
// (oder leer sind), fallen zurück auf das Original.
export function localizedProfile(
	profile: Pick<
		CandidateProfile,
		| "headline"
		| "summary"
		| "industries"
		| "languages"
		| "skills"
		| "experience"
		| "education"
		| "awards"
		| "mobility"
		| "projects"
		| "publications"
		| "volunteering"
		| "translations"
		| "profileLanguageOrigin"
	>,
	locale: "de" | "en",
): {
	headline: string | null;
	summary: string | null;
	industries: string[] | null;
	languages: string[] | null;
	skills: { name: string; level?: number }[] | null;
	experience: typeof profile.experience;
	education: typeof profile.education;
	awards: string[] | null;
	mobility: string | null;
	projects: typeof profile.projects;
	publications: typeof profile.publications;
	volunteering: typeof profile.volunteering;
} {
	const origin = profile.profileLanguageOrigin ?? "de";
	// Wenn die UI-Locale = Origin, nichts zu tun.
	if (locale === origin) {
		return {
			headline: profile.headline,
			summary: profile.summary,
			industries: profile.industries ?? null,
			languages: profile.languages ?? null,
			skills: (profile.skills ?? null) as
				| { name: string; level?: number }[]
				| null,
			experience: profile.experience,
			education: profile.education,
			awards: profile.awards ?? null,
			mobility: profile.mobility,
			projects: profile.projects,
			publications: profile.publications,
			volunteering: profile.volunteering,
		};
	}

	const tr: ProfileTranslationFields | undefined =
		profile.translations?.[locale];

	const pick = <T>(translated: T | undefined, fallback: T): T =>
		translated !== undefined && translated !== null && translated !== ""
			? translated
			: fallback;

	const mergedExperience = profile.experience
		? profile.experience.map((e, i) => {
				const t = tr?.experience?.[i];
				return {
					...e,
					role: pick(t?.role, e.role),
					description: pick(t?.description, e.description),
				};
			})
		: profile.experience;

	const mergedEducation = profile.education
		? profile.education.map((e, i) => {
				const t = tr?.education?.[i];
				return {
					...e,
					degree: pick(t?.degree, e.degree),
					thesisTitle: pick(t?.thesisTitle, e.thesisTitle),
					focus: pick(t?.focus, e.focus),
				};
			})
		: profile.education;

	const mergedProjects = profile.projects
		? profile.projects.map((p, i) => {
				const t = tr?.projects?.[i];
				return {
					...p,
					name: pick(t?.name, p.name),
					role: pick(t?.role, p.role),
					description: pick(t?.description, p.description),
				};
			})
		: profile.projects;

	const mergedPublications = profile.publications
		? profile.publications.map((p, i) => {
				const t = tr?.publications?.[i];
				return {
					...p,
					title: pick(t?.title, p.title),
					venue: pick(t?.venue, p.venue),
				};
			})
		: profile.publications;

	const mergedVolunteering = profile.volunteering
		? profile.volunteering.map((v, i) => {
				const t = tr?.volunteering?.[i];
				return {
					...v,
					organization: pick(t?.organization, v.organization),
					role: pick(t?.role, v.role),
					description: pick(t?.description, v.description),
				};
			})
		: profile.volunteering;

	return {
		headline: pick(tr?.headline, profile.headline),
		summary: pick(tr?.summary, profile.summary),
		industries: pick(tr?.industries, profile.industries ?? null),
		languages: pick(tr?.languages, profile.languages ?? null),
		skills: pick(
			tr?.skills,
			(profile.skills ?? null) as { name: string; level?: number }[] | null,
		),
		experience: mergedExperience,
		education: mergedEducation,
		awards: pick(tr?.awards, profile.awards ?? null),
		mobility: pick(tr?.mobility, profile.mobility),
		projects: mergedProjects,
		publications: mergedPublications,
		volunteering: mergedVolunteering,
	};
}
