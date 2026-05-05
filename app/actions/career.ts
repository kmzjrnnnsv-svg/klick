"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { db } from "@/db";
import type { ProfileExperience } from "@/db/schema";
import { candidateProfiles, users } from "@/db/schema";
import { getAIProvider } from "@/lib/ai";
import type { CareerAnalysis, ExtractedProfile } from "@/lib/ai/types";

async function requireCandidate(): Promise<string> {
	const session = await auth();
	if (!session?.user?.id) throw new Error("unauthenticated");
	const [u] = await db
		.select({ role: users.role })
		.from(users)
		.where(eq(users.id, session.user.id))
		.limit(1);
	if (u?.role !== "candidate") throw new Error("forbidden");
	return session.user.id;
}

function profileToExtracted(
	row: typeof candidateProfiles.$inferSelect,
): ExtractedProfile {
	return {
		displayName: row.displayName ?? undefined,
		headline: row.headline ?? undefined,
		location: row.location ?? undefined,
		yearsExperience: row.yearsExperience ?? undefined,
		languages: row.languages ?? undefined,
		skills: row.skills ?? undefined,
		experience: (row.experience ?? undefined) as
			| ProfileExperience[]
			| undefined,
		education: row.education ?? undefined,
		summary: row.summary ?? undefined,
		industries: row.industries ?? undefined,
		awards: row.awards ?? undefined,
		certificationsMentioned: row.certificationsMentioned ?? undefined,
		mobility: row.mobility ?? undefined,
		preferredRoleLevel: row.preferredRoleLevel ?? undefined,
	};
}

export type CareerActionResult =
	| { ok: true; analysis: CareerAnalysis }
	| { ok: false; error: string; code: string };

// Result-pattern statt throw — sonst zeigt Next.js generisches
// "An unexpected response was received from the server" beim Client.
export async function refreshCareerAnalysis(): Promise<CareerActionResult> {
	let userId: string;
	try {
		userId = await requireCandidate();
	} catch (e) {
		return {
			ok: false,
			code: "auth",
			error: e instanceof Error ? e.message : "auth_failed",
		};
	}

	const [profile] = await db
		.select()
		.from(candidateProfiles)
		.where(eq(candidateProfiles.userId, userId))
		.limit(1);
	if (!profile) {
		return {
			ok: false,
			code: "no_profile",
			error: "Bitte fülle erst dein Profil aus (mindestens Name + Skills).",
		};
	}

	let analysis: CareerAnalysis;
	try {
		const ai = getAIProvider();
		analysis = await ai.analyzeCareerProspects({
			profile: profileToExtracted(profile),
			yearsActive: profile.yearsExperience ?? undefined,
			insights: profile.insights,
		});
	} catch (e) {
		console.error("[career] AI analyze failed", e);
		return {
			ok: false,
			code: "ai_failed",
			error:
				e instanceof Error
					? `KI konnte das Profil nicht auswerten: ${e.message}`
					: "KI konnte das Profil nicht auswerten.",
		};
	}

	try {
		await db
			.update(candidateProfiles)
			.set({ careerAnalysis: analysis, careerAnalysisAt: new Date() })
			.where(eq(candidateProfiles.userId, userId));
	} catch (e) {
		console.error("[career] DB update failed", e);
		const msg = e instanceof Error ? e.message : String(e);
		// Häufigste Ursache: Migration 0021 nicht gelaufen → Spalte fehlt.
		if (msg.includes("career_analysis") || msg.includes("does not exist")) {
			return {
				ok: false,
				code: "missing_column",
				error:
					"Datenbank-Spalte fehlt. Bitte 'pnpm db:migrate' auf dem Server ausführen.",
			};
		}
		return { ok: false, code: "db_failed", error: msg };
	}

	revalidatePath("/profile");
	return { ok: true, analysis };
}

export async function getMyCareerAnalysis(): Promise<{
	analysis: CareerAnalysis | null;
	updatedAt: Date | null;
}> {
	const userId = await requireCandidate();
	try {
		const [row] = await db
			.select({
				analysis: candidateProfiles.careerAnalysis,
				updatedAt: candidateProfiles.careerAnalysisAt,
			})
			.from(candidateProfiles)
			.where(eq(candidateProfiles.userId, userId))
			.limit(1);
		return {
			analysis: (row?.analysis ?? null) as CareerAnalysis | null,
			updatedAt: row?.updatedAt ?? null,
		};
	} catch (e) {
		// Column probably missing. Gracefully degrade so /profile renders.
		console.warn("[career] read failed, degrading", e);
		return { analysis: null, updatedAt: null };
	}
}
