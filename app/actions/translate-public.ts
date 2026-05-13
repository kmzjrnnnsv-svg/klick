"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { candidateProfiles } from "@/db/schema";
import { getAIProvider } from "@/lib/ai";

// Synchroner Translate-Trigger für die Public-Share-Seite. Der Besucher
// klickt explizit auf "Profil jetzt übersetzen" → wir laufen Claude
// SYNCHRON (nicht via after()) und persistieren das Ergebnis bevor wir
// zurückkommen. Beim folgenden Reload ist alles in der gewünschten
// Sprache. Token-basiert, kein Auth nötig.
export async function translatePublicProfile(input: {
	publicShareToken: string;
	targetLocale: "de" | "en";
}): Promise<{ ok: true } | { ok: false; error: string }> {
	try {
		if (!input.publicShareToken || input.publicShareToken.length < 16) {
			return { ok: false, error: "invalid_token" };
		}
		if (input.targetLocale !== "de" && input.targetLocale !== "en") {
			return { ok: false, error: "invalid_locale" };
		}

		const [profile] = await db
			.select()
			.from(candidateProfiles)
			.where(eq(candidateProfiles.publicShareToken, input.publicShareToken))
			.limit(1);
		if (!profile) return { ok: false, error: "Profil nicht gefunden." };

		const origin =
			(profile.profileLanguageOrigin as "de" | "en" | null) ?? "de";
		if (origin === input.targetLocale) {
			// Schon die Origin-Sprache — nichts zu tun.
			return { ok: true };
		}

		const ai = getAIProvider();
		const out = await ai.translateProfile({
			from: origin,
			to: input.targetLocale,
			headline: profile.headline,
			summary: profile.summary,
			industries: profile.industries,
			languages: profile.languages,
			skills: (profile.skills ?? null) as
				| { name: string; level?: number }[]
				| null,
			experience: profile.experience
				? profile.experience.map((e) => ({
						role: e.role,
						description: e.description,
					}))
				: null,
			education: profile.education
				? profile.education.map((e) => ({
						degree: e.degree,
						thesisTitle: e.thesisTitle,
						focus: e.focus,
					}))
				: null,
			awards: profile.awards,
			mobility: profile.mobility,
			projects: profile.projects
				? profile.projects.map((p) => ({
						name: p.name,
						role: p.role,
						description: p.description,
					}))
				: null,
			publications: profile.publications
				? profile.publications.map((p) => ({
						title: p.title,
						venue: p.venue,
					}))
				: null,
			volunteering: profile.volunteering
				? profile.volunteering.map((v) => ({
						organization: v.organization,
						role: v.role,
						description: v.description,
					}))
				: null,
		});

		const existing = profile.translations ?? {};
		await db
			.update(candidateProfiles)
			.set({
				translations: { ...existing, [input.targetLocale]: out },
				translationsUpdatedAt: new Date(),
			})
			.where(eq(candidateProfiles.userId, profile.userId));

		revalidatePath(`/p/${input.publicShareToken}`);
		return { ok: true };
	} catch (e) {
		console.error("[translate-public] failed", e);
		return {
			ok: false,
			error: e instanceof Error ? e.message : "fehlgeschlagen",
		};
	}
}
