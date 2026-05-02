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

export async function refreshCareerAnalysis(): Promise<CareerAnalysis> {
	const userId = await requireCandidate();
	const [profile] = await db
		.select()
		.from(candidateProfiles)
		.where(eq(candidateProfiles.userId, userId))
		.limit(1);
	if (!profile) throw new Error("no profile");

	const ai = getAIProvider();
	const analysis = await ai.analyzeCareerProspects({
		profile: profileToExtracted(profile),
		yearsActive: profile.yearsExperience ?? undefined,
		insights: profile.insights,
	});

	await db
		.update(candidateProfiles)
		.set({ careerAnalysis: analysis, careerAnalysisAt: new Date() })
		.where(eq(candidateProfiles.userId, userId));

	revalidatePath("/profile");
	return analysis;
}

export async function getMyCareerAnalysis(): Promise<{
	analysis: CareerAnalysis | null;
	updatedAt: Date | null;
}> {
	const userId = await requireCandidate();
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
}
