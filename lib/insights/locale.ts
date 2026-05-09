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
		| "skills"
		| "experience"
		| "education"
		| "awards"
		| "mobility"
		| "translations"
		| "profileLanguageOrigin"
	>,
	locale: "de" | "en",
): {
	headline: string | null;
	summary: string | null;
	industries: string[] | null;
	skills: { name: string; level?: number }[] | null;
	experience: typeof profile.experience;
	education: typeof profile.education;
	awards: string[] | null;
	mobility: string | null;
} {
	const origin = profile.profileLanguageOrigin ?? "de";
	// Wenn die UI-Locale = Origin, nichts zu tun.
	if (locale === origin) {
		return {
			headline: profile.headline,
			summary: profile.summary,
			industries: profile.industries ?? null,
			skills: (profile.skills ?? null) as
				| { name: string; level?: number }[]
				| null,
			experience: profile.experience,
			education: profile.education,
			awards: profile.awards ?? null,
			mobility: profile.mobility,
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
				};
			})
		: profile.education;

	return {
		headline: pick(tr?.headline, profile.headline),
		summary: pick(tr?.summary, profile.summary),
		industries: pick(tr?.industries, profile.industries ?? null),
		skills: pick(
			tr?.skills,
			(profile.skills ?? null) as { name: string; level?: number }[] | null,
		),
		experience: mergedExperience,
		education: mergedEducation,
		awards: pick(tr?.awards, profile.awards ?? null),
		mobility: pick(tr?.mobility, profile.mobility),
	};
}
