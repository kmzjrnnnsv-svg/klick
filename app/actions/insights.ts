"use server";

import { eq } from "drizzle-orm";
import { after } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { candidateProfiles, vaultItems } from "@/db/schema";
import { getAIProvider } from "@/lib/ai";
import { computeInsightsFromData } from "@/lib/insights/compute";
import type { CandidateInsights } from "@/lib/insights/types";

// Insights mit yearsActive werden täglich älter — Stand 31.12.23 zeigt
// auch noch im Mai 2026 "10 Jahre" obwohl es längst 13 sind. Daher auf
// Read-Pfaden nach 7 Tagen Staleness im Hintergrund neu berechnen.
const INSIGHTS_STALE_AFTER_DAYS = 7;

// Recompute the candidate's insights snapshot. Called from:
//   - saveProfile / saveSkillsStep / finishOnboarding (profile changes)
//   - extractAndPersist after a CV import (skills + experience may have changed)
//   - refreshMyInsights — direkt user-getriggert vom Profil-Lesart-Block
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
				const currentRoleYears = insights.tenure.currentRole
					? Math.round(insights.tenure.currentRole.monthsOngoing / 12)
					: 0;
				const previousYearsBeforeCurrent = Math.max(
					0,
					insights.experience.yearsActive - currentRoleYears,
				);
				const ai = getAIProvider();
				const narrative = await ai.summarizeCandidate({
					headline: profile.headline,
					summary: profile.summary,
					yearsActive: insights.experience.yearsActive,
					yearsContinuous: insights.experience.yearsContinuous,
					previousYearsBeforeCurrent,
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
					skills: (profile.skills ?? [])
						.slice(0, 16)
						.map((s) => ({ name: s.name, level: s.level })),
					certificateCount: insights.certificates.total,
					certificatePattern: insights.certificates.pattern,
					asOf: new Date().toISOString().slice(0, 10),
					locale: "de",
				});

				insights.narrative = {
					summary: narrative.summary,
					workStyle: narrative.workStyle,
					strengths: narrative.strengths,
				};
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
	const userId = session.user.id;
	const [row] = await db
		.select({
			insights: candidateProfiles.insights,
			updatedAt: candidateProfiles.insightsUpdatedAt,
		})
		.from(candidateProfiles)
		.where(eq(candidateProfiles.userId, userId))
		.limit(1);

	// Staleness-Check: über INSIGHTS_STALE_AFTER_DAYS Tage alt → im Hinter-
	// grund neu berechnen. Der/die User:in sieht beim nächsten Aufruf
	// frische Zahlen ohne diesen Request zu blockieren.
	const ageMs = row?.updatedAt
		? Date.now() - row.updatedAt.getTime()
		: Number.POSITIVE_INFINITY;
	const insights = (row?.insights as CandidateInsights | null) ?? null;
	if (ageMs > INSIGHTS_STALE_AFTER_DAYS * 24 * 60 * 60 * 1000) {
		after(() => recomputeInsights(userId));
	}

	return insights;
}

// User-getriggertes Refresh des Profil-Lesart-Blocks. Blockierend, damit
// der Button am Ende vollendete Insights zurückbekommt. Result-Pattern,
// damit Next.js keine generischen "unexpected response"-Fehler beim
// Client zeigt.
export type RefreshInsightsResult =
	| { ok: true; insights: CandidateInsights | null }
	| { ok: false; error: string };

export async function refreshMyInsights(): Promise<RefreshInsightsResult> {
	try {
		const session = await auth();
		if (!session?.user?.id) return { ok: false, error: "unauthenticated" };
		const userId = session.user.id;

		await recomputeInsights(userId);

		const [row] = await db
			.select({ insights: candidateProfiles.insights })
			.from(candidateProfiles)
			.where(eq(candidateProfiles.userId, userId))
			.limit(1);
		return {
			ok: true,
			insights: (row?.insights as CandidateInsights | null) ?? null,
		};
	} catch (e) {
		console.error("[insights] refreshMyInsights failed", e);
		return {
			ok: false,
			error: e instanceof Error ? e.message : "unbekannter Fehler",
		};
	}
}
