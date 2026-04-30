"use server";

import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { candidateProfiles, vaultItems } from "@/db/schema";
import { getAIProvider } from "@/lib/ai";
import { computeInsightsFromData } from "@/lib/insights/compute";
import type { CandidateInsights } from "@/lib/insights/types";

// Recompute the candidate's insights snapshot. Called from:
//   - saveProfile / saveSkillsStep / finishOnboarding (profile changes)
//   - extractAndPersist after a CV import (skills + experience may have changed)
// Errors are swallowed so a flaky AI call never breaks the calling action.
export async function recomputeInsights(userId: string): Promise<void> {
	try {
		const [profile] = await db
			.select()
			.from(candidateProfiles)
			.where(eq(candidateProfiles.userId, userId))
			.limit(1);
		if (!profile) return;

		const items = await db
			.select()
			.from(vaultItems)
			.where(eq(vaultItems.userId, userId));

		const insights = computeInsightsFromData(profile, items);

		// Optional AI narrative — only when the profile has enough signal to
		// justify it (skip for nearly-empty profiles, costs less on the API
		// and avoids confidently-wrong fluff).
		const hasSignal =
			insights.tenure.totalRoles > 0 || (profile.skills?.length ?? 0) >= 3;
		if (hasSignal) {
			try {
				const narrative = await getAIProvider().summarizeCandidate({
					headline: profile.headline,
					summary: profile.summary,
					yearsActive: insights.experience.yearsActive,
					yearsContinuous: insights.experience.yearsContinuous,
					totalRoles: insights.tenure.totalRoles,
					currentRole: insights.tenure.currentRole
						? {
								company: insights.tenure.currentRole.company,
								role: insights.tenure.currentRole.role,
								monthsOngoing: insights.tenure.currentRole.monthsOngoing,
							}
						: undefined,
					firstJobYear: insights.tenure.firstJob
						? Number.parseInt(
								insights.tenure.firstJob.startYearMonth.slice(0, 4),
								10,
							)
						: undefined,
					gaps: insights.tenure.gaps.length,
					skills: (profile.skills ?? []).map((s) => s.name).slice(0, 12),
					certificateCount: insights.certificates.total,
					certificatePattern: insights.certificates.pattern,
				});
				insights.narrative = narrative;
			} catch (e) {
				console.warn("[insights] narrative failed", e);
			}
		}

		await db
			.update(candidateProfiles)
			.set({ insights, insightsUpdatedAt: new Date() })
			.where(eq(candidateProfiles.userId, userId));
	} catch (e) {
		console.error("[insights] compute failed", { userId, error: e });
	}
}

export async function getMyInsights(): Promise<CandidateInsights | null> {
	const session = await auth();
	if (!session?.user?.id) return null;
	const [row] = await db
		.select({ insights: candidateProfiles.insights })
		.from(candidateProfiles)
		.where(eq(candidateProfiles.userId, session.user.id))
		.limit(1);
	return (row?.insights as CandidateInsights | null) ?? null;
}
