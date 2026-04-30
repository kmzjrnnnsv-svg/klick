"use server";

import { and, desc, eq, isNotNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { db } from "@/db";
import {
	type CandidateProfile,
	candidateProfiles,
	type Employer,
	employers,
	type Job,
	jobs,
	type Match,
	matches,
	users,
} from "@/db/schema";
import { getAIProvider } from "@/lib/ai";
import { scoreMatch } from "@/lib/match/engine";

const TOP_N = 20;

export async function computeMatchesForJob(jobId: string): Promise<void> {
	const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);
	if (!job || job.status !== "published") return;

	const [emp] = await db
		.select()
		.from(employers)
		.where(eq(employers.id, job.employerId))
		.limit(1);
	if (!emp) return;

	// All candidate profiles in the same tenant whose visibility allows matching.
	const candidates = await db
		.select({
			profile: candidateProfiles,
			user: users,
		})
		.from(candidateProfiles)
		.innerJoin(users, eq(users.id, candidateProfiles.userId))
		.where(and(eq(users.tenantId, emp.tenantId), eq(users.role, "candidate")));

	const passing: {
		profile: CandidateProfile;
		userId: string;
		hardScore: 0 | 100;
		softScore: number;
		hardReasons: string[];
		matchedSkills: string[];
		missingSkills: string[];
	}[] = [];

	for (const { profile, user } of candidates) {
		if (profile.visibility === "private") continue;
		const score = scoreMatch(job, profile);
		if (!score.hardPass) continue;
		passing.push({
			profile,
			userId: user.id,
			hardScore: score.hardScore,
			softScore: score.softScore,
			hardReasons: score.hardReasons,
			matchedSkills: score.matchedSkills,
			missingSkills: score.missingSkills,
		});
	}

	passing.sort((a, b) => b.softScore - a.softScore);
	const top = passing.slice(0, TOP_N);

	const ai = getAIProvider();

	// Compute rationales (one per top match). Sequential to avoid rate limits.
	for (const m of top) {
		try {
			const rationale = await ai.matchRationale({
				jobTitle: job.title,
				jobDescription: job.description,
				candidateHeadline: m.profile.headline,
				candidateSummary: m.profile.summary,
				matchedSkills: m.matchedSkills,
				missingSkills: m.missingSkills,
				yearsExperience: m.profile.yearsExperience,
				yearsRequired: job.yearsExperienceMin,
			});
			await db
				.insert(matches)
				.values({
					jobId: job.id,
					candidateUserId: m.userId,
					hardScore: m.hardScore,
					softScore: m.softScore,
					rationale,
					hardReasons: m.hardReasons,
					matchedSkills: m.matchedSkills,
					missingSkills: m.missingSkills,
				})
				.onConflictDoUpdate({
					target: [matches.jobId, matches.candidateUserId],
					set: {
						hardScore: m.hardScore,
						softScore: m.softScore,
						rationale,
						hardReasons: m.hardReasons,
						matchedSkills: m.matchedSkills,
						missingSkills: m.missingSkills,
						computedAt: new Date(),
					},
				});
		} catch (e) {
			console.error("match rationale failed", e);
		}
	}

	revalidatePath("/jobs");
	revalidatePath(`/jobs/${jobId}`);
	revalidatePath(`/jobs/${jobId}/candidates`);
}

export async function recomputeMatchesForCandidate(
	candidateUserId: string,
): Promise<void> {
	// Re-score this candidate against every published job in their tenant.
	const [user] = await db
		.select({ tenantId: users.tenantId, role: users.role })
		.from(users)
		.where(eq(users.id, candidateUserId))
		.limit(1);
	if (!user || user.role !== "candidate" || !user.tenantId) return;

	const [profile] = await db
		.select()
		.from(candidateProfiles)
		.where(eq(candidateProfiles.userId, candidateUserId))
		.limit(1);
	if (!profile || profile.visibility === "private") return;

	const tenantJobs = await db
		.select({ job: jobs })
		.from(jobs)
		.innerJoin(employers, eq(employers.id, jobs.employerId))
		.where(
			and(eq(employers.tenantId, user.tenantId), eq(jobs.status, "published")),
		);

	const ai = getAIProvider();
	for (const { job } of tenantJobs) {
		const score = scoreMatch(job, profile);
		if (!score.hardPass) {
			await db
				.delete(matches)
				.where(
					and(
						eq(matches.jobId, job.id),
						eq(matches.candidateUserId, candidateUserId),
					),
				);
			continue;
		}
		try {
			const rationale = await ai.matchRationale({
				jobTitle: job.title,
				jobDescription: job.description,
				candidateHeadline: profile.headline,
				candidateSummary: profile.summary,
				matchedSkills: score.matchedSkills,
				missingSkills: score.missingSkills,
				yearsExperience: profile.yearsExperience,
				yearsRequired: job.yearsExperienceMin,
			});
			await db
				.insert(matches)
				.values({
					jobId: job.id,
					candidateUserId,
					hardScore: score.hardScore,
					softScore: score.softScore,
					rationale,
					hardReasons: score.hardReasons,
					matchedSkills: score.matchedSkills,
					missingSkills: score.missingSkills,
				})
				.onConflictDoUpdate({
					target: [matches.jobId, matches.candidateUserId],
					set: {
						hardScore: score.hardScore,
						softScore: score.softScore,
						rationale,
						hardReasons: score.hardReasons,
						matchedSkills: score.matchedSkills,
						missingSkills: score.missingSkills,
						computedAt: new Date(),
					},
				});
		} catch (e) {
			console.error("match rationale failed", e);
		}
	}

	revalidatePath("/matches");
}

export type CandidateMatchView = {
	match: Match;
	job: Job;
	employer: Pick<Employer, "id" | "companyName">;
};

export async function listMatchesForCandidate(): Promise<CandidateMatchView[]> {
	const session = await auth();
	if (!session?.user?.id) return [];

	const rows = await db
		.select({
			match: matches,
			job: jobs,
			employer: { id: employers.id, companyName: employers.companyName },
		})
		.from(matches)
		.innerJoin(jobs, eq(jobs.id, matches.jobId))
		.innerJoin(employers, eq(employers.id, jobs.employerId))
		.where(
			and(
				eq(matches.candidateUserId, session.user.id),
				eq(jobs.status, "published"),
				isNotNull(matches.rationale),
			),
		)
		.orderBy(desc(matches.softScore));
	return rows;
}

export type AnonymousCandidateMatchView = {
	match: Match;
	headline: string | null;
	location: string | null;
	yearsExperience: number | null;
	summary: string | null;
	insights: import("@/lib/insights/types").CandidateInsights | null;
	industries: string[] | null;
	awards: string[] | null;
	certificationsMentioned:
		| import("@/db/schema").ProfileCertificationMention[]
		| null;
	mobility: string | null;
	preferredRoleLevel:
		| "junior"
		| "mid"
		| "senior"
		| "lead"
		| "principal"
		| "exec"
		| null;
};

export async function listMatchesForJob(
	jobId: string,
): Promise<AnonymousCandidateMatchView[]> {
	const session = await auth();
	if (!session?.user?.id) return [];

	const [job] = await db
		.select({ employerId: jobs.employerId })
		.from(jobs)
		.where(eq(jobs.id, jobId))
		.limit(1);
	if (!job) return [];

	const [emp] = await db
		.select({ id: employers.id })
		.from(employers)
		.where(
			and(
				eq(employers.id, job.employerId),
				eq(employers.userId, session.user.id),
			),
		)
		.limit(1);
	if (!emp) return [];

	const rows = await db
		.select({
			match: matches,
			headline: candidateProfiles.headline,
			location: candidateProfiles.location,
			yearsExperience: candidateProfiles.yearsExperience,
			summary: candidateProfiles.summary,
			insights: candidateProfiles.insights,
			industries: candidateProfiles.industries,
			awards: candidateProfiles.awards,
			certificationsMentioned: candidateProfiles.certificationsMentioned,
			mobility: candidateProfiles.mobility,
			preferredRoleLevel: candidateProfiles.preferredRoleLevel,
		})
		.from(matches)
		.innerJoin(
			candidateProfiles,
			eq(candidateProfiles.userId, matches.candidateUserId),
		)
		.where(eq(matches.jobId, jobId))
		.orderBy(desc(matches.softScore));
	return rows as AnonymousCandidateMatchView[];
}
