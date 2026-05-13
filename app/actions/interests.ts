"use server";

import { and, desc, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { db } from "@/db";
import {
	auditLog,
	candidateProfiles,
	disclosures,
	employers,
	type Interest,
	interests,
	type Job,
	jobs,
	matches,
	users,
	vaultItems,
} from "@/db/schema";
import { orchestrateVerifications } from "@/lib/verify/orchestrator";

const showInterestSchema = z.object({
	matchId: z.string().min(1),
	verifyDepth: z.enum(["light", "standard", "deep"]).default("light"),
	message: z.string().max(2000).optional(),
});

const expressDirectInterestSchema = z.object({
	// Profil-Token statt direkter userId — verhindert dass Employer einfach
	// User-IDs raten und massenhaft Interest-Spam schickt.
	publicShareToken: z.string().min(16),
	// Optional: ein eigener Job. Wenn null, ist's ein "nur kennenlernen"-Outreach.
	jobId: z.string().min(1).nullable().optional(),
	verifyDepth: z.enum(["light", "standard", "deep"]).default("light"),
	message: z.string().max(2000).optional(),
});

async function requireEmployer() {
	const session = await auth();
	if (!session?.user?.id) throw new Error("unauthenticated");
	const [user] = await db
		.select({ role: users.role })
		.from(users)
		.where(eq(users.id, session.user.id))
		.limit(1);
	if (user?.role !== "employer") throw new Error("forbidden");
	const [emp] = await db
		.select()
		.from(employers)
		.where(eq(employers.userId, session.user.id))
		.limit(1);
	if (!emp) throw new Error("no employer record");
	return { userId: session.user.id, employer: emp };
}

export async function showInterest(input: {
	matchId: string;
	verifyDepth: "light" | "standard" | "deep";
	message?: string;
}): Promise<{ id: string }> {
	const { userId, employer } = await requireEmployer();
	const data = showInterestSchema.parse(input);

	const [match] = await db
		.select()
		.from(matches)
		.where(eq(matches.id, data.matchId))
		.limit(1);
	if (!match) throw new Error("match not found");

	// Validate the match belongs to one of this employer's jobs.
	const [job] = await db
		.select()
		.from(jobs)
		.where(and(eq(jobs.id, match.jobId), eq(jobs.employerId, employer.id)))
		.limit(1);
	if (!job) throw new Error("forbidden: job not owned by employer");

	// Reuse an open interest if one already exists for this match.
	const [existing] = await db
		.select()
		.from(interests)
		.where(
			and(eq(interests.matchId, data.matchId), eq(interests.status, "pending")),
		)
		.limit(1);
	if (existing) return { id: existing.id };

	const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000); // 14 days

	const [created] = await db
		.insert(interests)
		.values({
			matchId: data.matchId,
			jobId: match.jobId,
			employerId: employer.id,
			candidateUserId: match.candidateUserId,
			verifyDepth: data.verifyDepth,
			message: data.message,
			expiresAt,
		})
		.returning();

	await db
		.update(matches)
		.set({ status: "interested" })
		.where(eq(matches.id, data.matchId));

	await db.insert(auditLog).values({
		actorUserId: userId,
		action: "interest.created",
		target: created.id,
		payload: {
			matchId: data.matchId,
			verifyDepth: data.verifyDepth,
			candidateUserId: match.candidateUserId,
		},
	});

	revalidatePath(`/jobs/${match.jobId}/candidates`);
	revalidatePath("/requests");

	// Kick off verifications based on depth. light = noop. standard/deep run
	// connectors (Mock by default) without blocking the form response.
	if (data.verifyDepth !== "light") {
		after(() => orchestrateVerifications(created.id));
	}

	return { id: created.id };
}

// Direct-Outreach: ein Employer hat das Public-Share-Profil eines
// Kandidaten gefunden und möchte Interesse zeigen — entweder für eine
// konkrete Stelle oder als "nur kennenlernen". Kein matchId nötig.
export async function expressDirectInterest(input: {
	publicShareToken: string;
	jobId?: string | null;
	verifyDepth?: "light" | "standard" | "deep";
	message?: string;
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
	try {
		const { userId, employer } = await requireEmployer();
		const data = expressDirectInterestSchema.parse(input);

		// Kandidat über Token auflösen — verhindert ID-Guessing.
		const [candidate] = await db
			.select({ userId: candidateProfiles.userId })
			.from(candidateProfiles)
			.where(eq(candidateProfiles.publicShareToken, data.publicShareToken))
			.limit(1);
		if (!candidate) return { ok: false, error: "Kandidat nicht gefunden." };

		// Wenn ein Job angegeben ist, muss er dem Employer gehören.
		if (data.jobId) {
			const [job] = await db
				.select({ id: jobs.id })
				.from(jobs)
				.where(and(eq(jobs.id, data.jobId), eq(jobs.employerId, employer.id)))
				.limit(1);
			if (!job) {
				return {
					ok: false,
					error: "Diese Stelle gehört nicht zu deiner Firma.",
				};
			}
		}

		// Duplikat-Check: gibt's schon ein offenes Interest für diesen
		// Kandidaten + (optional Job)?
		const existingRows = await db
			.select({ id: interests.id, jobId: interests.jobId })
			.from(interests)
			.where(
				and(
					eq(interests.candidateUserId, candidate.userId),
					eq(interests.employerId, employer.id),
					eq(interests.status, "pending"),
				),
			);
		const dup = existingRows.find((r) => r.jobId === (data.jobId ?? null));
		if (dup) return { ok: true, id: dup.id };

		const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

		const [created] = await db
			.insert(interests)
			.values({
				source: "direct",
				matchId: null,
				jobId: data.jobId ?? null,
				employerId: employer.id,
				candidateUserId: candidate.userId,
				verifyDepth: data.verifyDepth ?? "light",
				message: data.message,
				expiresAt,
			})
			.returning();

		await db.insert(auditLog).values({
			actorUserId: userId,
			action: "interest.direct",
			target: created.id,
			payload: {
				candidateUserId: candidate.userId,
				jobId: data.jobId ?? null,
				source: "direct",
			},
		});

		revalidatePath("/requests");
		if (data.jobId) revalidatePath(`/jobs/${data.jobId}/candidates`);

		if ((data.verifyDepth ?? "light") !== "light") {
			after(() => orchestrateVerifications(created.id));
		}

		return { ok: true, id: created.id };
	} catch (e) {
		console.error("[interests.direct] failed", e);
		return {
			ok: false,
			error: e instanceof Error ? e.message : "Anfrage fehlgeschlagen.",
		};
	}
}

export type CandidateInterestView = {
	interest: Interest;
	job: Pick<
		Job,
		| "id"
		| "title"
		| "description"
		| "location"
		| "remotePolicy"
		| "salaryMin"
		| "salaryMax"
		| "salaryBenchmarkLow"
		| "salaryBenchmarkHigh"
		| "salaryFairness"
		| "salaryDeltaPct"
	>;
	companyName: string;
};

// Helper for employer view: which vault items has THIS candidate disclosed
// for this interest? Returns the file metadata (no decryption) so the
// employer can click through to /api/vault/[id]/file (auth-gated; backend
// still enforces ownership).
export async function listDisclosedItemsForInterest(interestId: string) {
	const session = await auth();
	if (!session?.user?.id) return [];
	// Verify the requester owns the underlying employer for this interest.
	const [row] = await db
		.select({
			employerUser: employers.userId,
		})
		.from(interests)
		.innerJoin(employers, eq(employers.id, interests.employerId))
		.where(eq(interests.id, interestId))
		.limit(1);
	if (!row || row.employerUser !== session.user.id) return [];

	return db
		.select({
			id: disclosures.vaultItemId,
			filename: vaultItems.filename,
			kind: vaultItems.kind,
			mime: vaultItems.mime,
			sourceUrl: vaultItems.sourceUrl,
		})
		.from(disclosures)
		.innerJoin(vaultItems, eq(vaultItems.id, disclosures.vaultItemId))
		.where(
			and(
				eq(disclosures.interestId, interestId),
				isNull(disclosures.revokedAt),
			),
		);
}

export async function listIncomingInterests(): Promise<
	CandidateInterestView[]
> {
	const session = await auth();
	if (!session?.user?.id) return [];
	return db
		.select({
			interest: interests,
			job: {
				id: jobs.id,
				title: jobs.title,
				description: jobs.description,
				location: jobs.location,
				remotePolicy: jobs.remotePolicy,
				salaryMin: jobs.salaryMin,
				salaryMax: jobs.salaryMax,
				salaryBenchmarkLow: jobs.salaryBenchmarkLow,
				salaryBenchmarkHigh: jobs.salaryBenchmarkHigh,
				salaryFairness: jobs.salaryFairness,
				salaryDeltaPct: jobs.salaryDeltaPct,
			},
			companyName: employers.companyName,
		})
		.from(interests)
		.innerJoin(jobs, eq(jobs.id, interests.jobId))
		.innerJoin(employers, eq(employers.id, interests.employerId))
		.where(eq(interests.candidateUserId, session.user.id))
		.orderBy(desc(interests.createdAt));
}

export async function getIncomingInterest(
	id: string,
): Promise<CandidateInterestView | null> {
	const session = await auth();
	if (!session?.user?.id) return null;
	const [row] = await db
		.select({
			interest: interests,
			job: {
				id: jobs.id,
				title: jobs.title,
				description: jobs.description,
				location: jobs.location,
				remotePolicy: jobs.remotePolicy,
				salaryMin: jobs.salaryMin,
				salaryMax: jobs.salaryMax,
				salaryBenchmarkLow: jobs.salaryBenchmarkLow,
				salaryBenchmarkHigh: jobs.salaryBenchmarkHigh,
				salaryFairness: jobs.salaryFairness,
				salaryDeltaPct: jobs.salaryDeltaPct,
			},
			companyName: employers.companyName,
		})
		.from(interests)
		.innerJoin(jobs, eq(jobs.id, interests.jobId))
		.innerJoin(employers, eq(employers.id, interests.employerId))
		.where(
			and(eq(interests.id, id), eq(interests.candidateUserId, session.user.id)),
		)
		.limit(1);
	return row ?? null;
}

export async function decideInterest(
	id: string,
	approve: boolean,
): Promise<void> {
	const session = await auth();
	if (!session?.user?.id) throw new Error("unauthenticated");
	const userId = session.user.id;

	const [interest] = await db
		.select()
		.from(interests)
		.where(and(eq(interests.id, id), eq(interests.candidateUserId, userId)))
		.limit(1);
	if (!interest) throw new Error("not found");
	if (interest.status !== "pending") throw new Error("already decided");

	const newStatus = approve ? "approved" : "rejected";
	await db
		.update(interests)
		.set({ status: newStatus, decidedAt: new Date() })
		.where(eq(interests.id, id));

	// Direct-Outreach (source='direct') hat keinen matchId — kein Match-
	// Status zu aktualisieren.
	if (interest.matchId) {
		await db
			.update(matches)
			.set({ status: approve ? "approved" : "rejected" })
			.where(eq(matches.id, interest.matchId));
	}

	await db.insert(auditLog).values({
		actorUserId: userId,
		action: approve ? "interest.approved" : "interest.rejected",
		target: id,
		payload: {
			matchId: interest.matchId,
			employerId: interest.employerId,
		},
	});

	revalidatePath("/requests");
	revalidatePath(`/requests/${id}`);
	revalidatePath(`/jobs/${interest.jobId}/candidates`);
}

export type EmployerInterestView = {
	interest: Interest;
	candidate: {
		userId: string;
		email: string | null;
		displayName: string | null;
		headline: string | null;
		location: string | null;
		summary: string | null;
		yearsExperience: number | null;
	};
};

/**
 * For employer use: list interests for a job. If status === "approved", the
 * candidate identity (email + displayName) is included; otherwise returned
 * fields are anonymized.
 */
export async function listInterestsForJob(
	jobId: string,
): Promise<EmployerInterestView[]> {
	const { employer } = await requireEmployer();
	const rows = await db
		.select({
			interest: interests,
			email: users.email,
			displayName: candidateProfiles.displayName,
			headline: candidateProfiles.headline,
			location: candidateProfiles.location,
			summary: candidateProfiles.summary,
			yearsExperience: candidateProfiles.yearsExperience,
			userId: users.id,
		})
		.from(interests)
		.innerJoin(users, eq(users.id, interests.candidateUserId))
		.leftJoin(
			candidateProfiles,
			eq(candidateProfiles.userId, interests.candidateUserId),
		)
		.where(
			and(eq(interests.jobId, jobId), eq(interests.employerId, employer.id)),
		)
		.orderBy(desc(interests.createdAt));

	return rows.map((r) => {
		const approved = r.interest.status === "approved";
		return {
			interest: r.interest,
			candidate: {
				userId: r.userId,
				email: approved ? r.email : null,
				displayName: approved ? r.displayName : null,
				headline: r.headline,
				location: r.location,
				summary: r.summary,
				yearsExperience: r.yearsExperience,
			},
		};
	});
}

export async function getInterestForMatch(
	matchId: string,
): Promise<Interest | null> {
	const { employer } = await requireEmployer();
	const [row] = await db
		.select()
		.from(interests)
		.where(
			and(
				eq(interests.matchId, matchId),
				eq(interests.employerId, employer.id),
			),
		)
		.orderBy(desc(interests.createdAt))
		.limit(1);
	return row ?? null;
}
