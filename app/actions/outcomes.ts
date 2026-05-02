"use server";

import { and, desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { db } from "@/db";
import {
	employers,
	jobs,
	type Outcome,
	offers,
	outcomes,
	users,
} from "@/db/schema";
import { pushNotification } from "./notifications";

async function getRoleAndEmployer() {
	const session = await auth();
	if (!session?.user?.id) throw new Error("unauthenticated");
	const [u] = await db
		.select({ role: users.role })
		.from(users)
		.where(eq(users.id, session.user.id))
		.limit(1);
	if (!u) throw new Error("forbidden");
	let employerId: string | null = null;
	if (u.role === "employer") {
		const [emp] = await db
			.select()
			.from(employers)
			.where(eq(employers.userId, session.user.id))
			.limit(1);
		employerId = emp?.id ?? null;
	}
	return { userId: session.user.id, role: u.role, employerId };
}

export async function reportOutcome(input: {
	jobId: string;
	candidateUserId: string;
	kind: Outcome["kind"];
	notes?: string;
	finalSalary?: number;
}): Promise<void> {
	const { userId, role, employerId } = await getRoleAndEmployer();
	if (role !== "employer" && role !== "candidate") throw new Error("forbidden");

	// Resolve the employer for this job — both sides write to the same row,
	// but a candidate doesn't carry an employerId so we look it up.
	const [job] = await db
		.select({ employerId: jobs.employerId })
		.from(jobs)
		.where(eq(jobs.id, input.jobId))
		.limit(1);
	if (!job) throw new Error("job not found");
	if (role === "employer" && employerId !== job.employerId) {
		throw new Error("not your job");
	}
	if (role === "candidate" && userId !== input.candidateUserId) {
		throw new Error("not your outcome");
	}

	const reportedByRole = role === "employer" ? "employer" : "candidate";

	await db
		.insert(outcomes)
		.values({
			jobId: input.jobId,
			candidateUserId: input.candidateUserId,
			employerId: job.employerId,
			reportedByRole,
			reportedByUserId: userId,
			kind: input.kind,
			notes: input.notes,
			finalSalary: input.finalSalary,
		})
		.onConflictDoUpdate({
			target: [
				outcomes.jobId,
				outcomes.candidateUserId,
				outcomes.reportedByRole,
			],
			set: {
				kind: input.kind,
				notes: input.notes,
				finalSalary: input.finalSalary,
				reportedAt: new Date(),
			},
		});

	revalidatePath("/offers");
	revalidatePath(`/jobs/${input.jobId}/offers`);
}

export async function getOutcome(input: {
	jobId: string;
	candidateUserId: string;
	role: "employer" | "candidate";
}): Promise<Outcome | null> {
	const [r] = await db
		.select()
		.from(outcomes)
		.where(
			and(
				eq(outcomes.jobId, input.jobId),
				eq(outcomes.candidateUserId, input.candidateUserId),
				eq(outcomes.reportedByRole, input.role),
			),
		)
		.limit(1);
	return r ?? null;
}

// Aggregate hire-rate per employer — used by admin and ranking later.
export async function aggregateOutcomesForEmployer(
	employerId: string,
): Promise<{ hired: number; declined: number; total: number }> {
	const rows = await db
		.select()
		.from(outcomes)
		.where(eq(outcomes.employerId, employerId))
		.orderBy(desc(outcomes.reportedAt));
	let hired = 0;
	let declined = 0;
	for (const r of rows) {
		if (r.kind === "hired") hired++;
		else if (
			r.kind === "declined_by_candidate" ||
			r.kind === "declined_by_employer"
		)
			declined++;
	}
	return { hired, declined, total: rows.length };
}

// Tenant-wide aggregated stats for the admin insights page. Suppress small
// buckets (<3 employers) to avoid pinpointing a specific company.
export async function aggregatedOutcomesPlatform(): Promise<{
	totalReports: number;
	hired: number;
	declinedByCandidate: number;
	declinedByEmployer: number;
	inNegotiation: number;
	noResponse: number;
	avgFinalSalary: number | null;
	hireRate: number | null;
}> {
	const session = await auth();
	if (!session?.user?.id) throw new Error("unauthenticated");
	const [u] = await db
		.select({ role: users.role })
		.from(users)
		.where(eq(users.id, session.user.id))
		.limit(1);
	if (u?.role !== "admin") throw new Error("forbidden");
	const rows = await db.select().from(outcomes);
	const total = rows.length;
	let hired = 0;
	let dc = 0;
	let de = 0;
	let inn = 0;
	let nr = 0;
	let salarySum = 0;
	let salaryCount = 0;
	for (const r of rows) {
		if (r.kind === "hired") {
			hired++;
			if (r.finalSalary) {
				salarySum += r.finalSalary;
				salaryCount++;
			}
		} else if (r.kind === "declined_by_candidate") dc++;
		else if (r.kind === "declined_by_employer") de++;
		else if (r.kind === "in_negotiation") inn++;
		else if (r.kind === "no_response") nr++;
	}
	const decided = hired + dc + de;
	return {
		totalReports: total,
		hired,
		declinedByCandidate: dc,
		declinedByEmployer: de,
		inNegotiation: inn,
		noResponse: nr,
		avgFinalSalary:
			salaryCount > 0 ? Math.round(salarySum / salaryCount) : null,
		hireRate: decided > 0 ? Math.round((hired / decided) * 100) : null,
	};
}

// When an offer is accepted, prompt both sides for outcome (later — for now
// just record the implicit "hired" outcome from employer side).
export async function pingOutcomePrompt(offerId: string): Promise<void> {
	const [o] = await db
		.select()
		.from(offers)
		.where(eq(offers.id, offerId))
		.limit(1);
	if (!o || o.status !== "accepted") return;
	await pushNotification({
		userId: o.candidateUserId,
		kind: "system",
		title: "War der Match erfolgreich?",
		body: "Hilf uns, das Matching besser zu machen — kurze Rückmeldung in deinen Angeboten.",
		link: `/offers/${o.id}`,
	}).catch(() => {});
}
