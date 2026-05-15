"use server";

import { and, desc, eq, isNotNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { pushNotification } from "@/app/actions/notifications";
import { notifySavedSearchHits } from "@/app/actions/saved-searches";
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
import { osrmRoute } from "@/lib/geo/distance";
import { otpTransitRoute } from "@/lib/geo/transit";
import { sendTransactionalMail } from "@/lib/mail/send";
import { scoreMatch } from "@/lib/match/engine";

const TOP_N = 20;

export async function computeMatchesForJob(jobId: string): Promise<void> {
	const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);
	if (!job || job.status !== "published") return;

	// Fan-out saved-search hits — independent of match scoring; even if no
	// candidate scores high, a saved search may want to see the new posting.
	await notifySavedSearchHits(job);

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
		userEmail: string | null;
		hardScore: 0 | 100;
		softScore: number;
		hardReasons: string[];
		matchedSkills: string[];
		missingSkills: string[];
		adjacentSkills: string[];
		commute: ReturnType<typeof scoreMatch>["commute"];
	}[] = [];

	for (const { profile, user } of candidates) {
		if (profile.visibility === "private") continue;
		const score = scoreMatch(job, profile);
		if (!score.hardPass) continue;
		// Upgrade commute estimate with a real routing engine when available.
		// car/bike/walk → OSRM; transit → OpenTripPlanner. Both fall back to
		// the haversine-based estimate if the API isn't reachable.
		let commute = score.commute;
		if (
			commute &&
			profile.addressLat != null &&
			profile.addressLng != null &&
			job.locationLat != null &&
			job.locationLng != null
		) {
			const from = { lat: profile.addressLat, lng: profile.addressLng };
			const to = { lat: job.locationLat, lng: job.locationLng };
			let real: { km: number; minutes: number } | null = null;
			if (
				commute.mode === "car" ||
				commute.mode === "bike" ||
				commute.mode === "walk"
			) {
				real = await osrmRoute(from, to, commute.mode);
			} else if (commute.mode === "transit") {
				real = await otpTransitRoute(from, to);
			}
			if (real) {
				const exceedsLimit =
					profile.maxCommuteMinutes != null &&
					real.minutes > profile.maxCommuteMinutes;
				commute = {
					km: Math.round(real.km),
					minutes: real.minutes,
					mode: commute.mode,
					exceedsLimit,
				};
			}
		}
		passing.push({
			profile,
			userId: user.id,
			userEmail: user.email ?? null,
			hardScore: score.hardScore,
			softScore: score.softScore,
			hardReasons: score.hardReasons,
			matchedSkills: score.matchedSkills,
			missingSkills: score.missingSkills,
			adjacentSkills: score.adjacentSkills,
			commute,
		});
	}

	passing.sort((a, b) => b.softScore - a.softScore);
	const top = passing.slice(0, TOP_N);

	// Match-Berechnung läuft immer im Hintergrund (after()-Hook nach Job-
	// Publish), niemals als User-Auswertung → Mock-Provider, kein Claude.
	const ai = getAIProvider({ background: true });

	// Find existing matches so we know which are NEW (worth a notification).
	const existingMatchIds = new Set(
		(
			await db
				.select({ candidateUserId: matches.candidateUserId })
				.from(matches)
				.where(eq(matches.jobId, job.id))
		).map((r) => r.candidateUserId),
	);

	// Compute rationales + assessments (one per top match). Sequential to
	// avoid rate limits.
	for (const m of top) {
		try {
			const [rationale, assessment] = await Promise.all([
				ai.matchRationale({
					jobTitle: job.title,
					jobDescription: job.description,
					candidateHeadline: m.profile.headline,
					candidateSummary: m.profile.summary,
					matchedSkills: m.matchedSkills,
					missingSkills: m.missingSkills,
					yearsExperience: m.profile.yearsExperience,
					yearsRequired: job.yearsExperienceMin,
				}),
				ai.assessMatch({
					jobTitle: job.title,
					jobDescription: job.description,
					yearsRequired: job.yearsExperienceMin ?? 0,
					candidateHeadline: m.profile.headline,
					candidateSummary: m.profile.summary,
					candidateYears: m.profile.yearsExperience,
					matchedSkills: m.matchedSkills,
					missingSkills: m.missingSkills,
					adjacentSkills: m.adjacentSkills,
				}),
			]);
			const isNew = !existingMatchIds.has(m.userId);
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
					adjacentSkills: m.adjacentSkills,
					commute: m.commute ?? null,
					pros: assessment.pros,
					cons: assessment.cons,
					experienceVerdict: assessment.experienceVerdict,
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
						adjacentSkills: m.adjacentSkills,
						commute: m.commute ?? null,
						pros: assessment.pros,
						cons: assessment.cons,
						experienceVerdict: assessment.experienceVerdict,
						computedAt: new Date(),
					},
				});

			// Notify the candidate when this is a fresh, strong match. Skip
			// re-runs and weak matches to avoid spamming. Best-effort.
			if (isNew && m.softScore >= 60 && m.userId) {
				await pushNotification({
					userId: m.userId,
					kind: "new_match",
					title: `Neuer Match: ${job.title}`,
					body: `Score ${m.softScore}/100${job.location ? ` · ${job.location}` : ""}`,
					link: "/matches",
					payload: { jobId: job.id, softScore: m.softScore },
				});
				if (m.userEmail) {
					const baseUrl = process.env.AUTH_URL ?? "https://raza.work";
					await sendTransactionalMail({
						to: m.userEmail,
						subject: `Neue passende Stelle: ${job.title}`,
						text:
							`Eine neue Stelle könnte zu dir passen:\n\n` +
							`${job.title}${job.location ? ` · ${job.location}` : ""}\n` +
							`Match-Score: ${m.softScore}/100\n\n` +
							`${rationale}\n\n` +
							`Schau sie dir an: ${baseUrl}/matches\n\n` +
							`Du erhältst diese Mail, weil dein Profil bei Klick zu dieser Stelle passt. Du bleibst anonym, bis du selbst Interesse zeigst.`,
					});
				}
			}
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

	// Reine after()-Hintergrund-Funktion (Profil-Save / CV-Import) →
	// Mock-Provider, niemals Claude.
	const ai = getAIProvider({ background: true });
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

// Public-ish job listing for candidates: shows every published job in
// their tenant, regardless of match score. Adds a soft preview of how
// they'd score for it (so they can self-assess before sending interest).
export type BrowseJob = {
	job: Job;
	companyName: string;
	hardPass: boolean;
	softScore: number;
	matchedSkills: string[];
	missingSkills: string[];
	commute: import("@/lib/match/engine").MatchScore["commute"];
};

export async function browseJobs(
	filters: {
		remote?: "any" | "remote_only" | "no_remote";
		minSalary?: number;
		q?: string;
	} = {},
): Promise<BrowseJob[]> {
	const session = await auth();
	if (!session?.user?.id) return [];
	const userId = session.user.id;

	const [user] = await db
		.select({ tenantId: users.tenantId })
		.from(users)
		.where(eq(users.id, userId))
		.limit(1);
	if (!user?.tenantId) return [];

	const [profile] = await db
		.select()
		.from(candidateProfiles)
		.where(eq(candidateProfiles.userId, userId))
		.limit(1);

	const rows = await db
		.select({
			job: jobs,
			companyName: employers.companyName,
		})
		.from(jobs)
		.innerJoin(employers, eq(employers.id, jobs.employerId))
		.where(
			and(eq(employers.tenantId, user.tenantId), eq(jobs.status, "published")),
		)
		.orderBy(desc(jobs.updatedAt));

	const { scoreMatch } = await import("@/lib/match/engine");
	const out: BrowseJob[] = [];
	for (const r of rows) {
		const q = filters.q?.trim().toLowerCase();
		if (q) {
			const haystack =
				`${r.job.title} ${r.job.description} ${r.companyName} ${(r.job.requirements ?? []).map((req) => req.name).join(" ")}`.toLowerCase();
			if (!haystack.includes(q)) continue;
		}
		if (filters.remote === "remote_only" && r.job.remotePolicy !== "remote") {
			continue;
		}
		if (filters.remote === "no_remote" && r.job.remotePolicy === "remote") {
			continue;
		}
		if (filters.minSalary && filters.minSalary > 0) {
			const cap = r.job.salaryMax ?? r.job.salaryMin ?? 0;
			if (cap < filters.minSalary) continue;
		}
		const score = profile
			? scoreMatch(r.job, profile)
			: {
					hardPass: false,
					softScore: 0,
					matchedSkills: [],
					missingSkills: (r.job.requirements ?? [])
						.filter((req) => req.weight === "must")
						.map((req) => req.name),
					commute: null,
				};
		out.push({
			job: r.job,
			companyName: r.companyName,
			hardPass: score.hardPass,
			softScore: score.softScore,
			matchedSkills: score.matchedSkills,
			missingSkills: score.missingSkills,
			commute: score.commute,
		});
	}
	return out;
}

export type MatchFilters = {
	remote?: "any" | "remote_only" | "no_remote";
	minSalary?: number;
	maxCommuteMinutes?: number;
	sort?: "score" | "commute" | "salary";
};

export async function listMatchesForCandidate(
	filters: MatchFilters = {},
): Promise<CandidateMatchView[]> {
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

	const filtered = rows.filter(({ job, match }) => {
		if (filters.remote === "remote_only" && job.remotePolicy !== "remote") {
			return false;
		}
		if (filters.remote === "no_remote" && job.remotePolicy === "remote") {
			return false;
		}
		if (filters.minSalary && filters.minSalary > 0) {
			const cap = job.salaryMax ?? job.salaryMin ?? 0;
			if (cap < filters.minSalary) return false;
		}
		if (filters.maxCommuteMinutes && match.commute) {
			if (match.commute.minutes > filters.maxCommuteMinutes) return false;
		}
		return true;
	});

	if (filters.sort === "commute") {
		filtered.sort((a, b) => {
			const am = a.match.commute?.minutes ?? Number.POSITIVE_INFINITY;
			const bm = b.match.commute?.minutes ?? Number.POSITIVE_INFINITY;
			return am - bm;
		});
	} else if (filters.sort === "salary") {
		filtered.sort((a, b) => {
			const ax = a.job.salaryMax ?? a.job.salaryMin ?? 0;
			const bx = b.job.salaryMax ?? b.job.salaryMin ?? 0;
			return bx - ax;
		});
	}
	// "score" is the default — already sorted by softScore desc.

	return filtered;
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
