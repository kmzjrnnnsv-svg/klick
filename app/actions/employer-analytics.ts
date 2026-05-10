"use server";

import { and, desc, eq, gte, isNull, sql } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import {
	agencyMembers,
	applicationEvents,
	applications,
	employers,
	jobs,
	matches,
	offers,
	users,
	verifications,
} from "@/db/schema";

// Lokaler Mirror von requireMyEmployer aus agency.ts — verhindert Zirkular-
// Imports und lässt uns den Resolver hier robust gegen "User ist Member
// einer fremden Firma"-Fälle bauen.
async function resolveMyEmployerId(): Promise<string | null> {
	const session = await auth();
	if (!session?.user?.id) return null;
	const [own] = await db
		.select({ id: employers.id })
		.from(employers)
		.where(eq(employers.userId, session.user.id))
		.limit(1);
	if (own) return own.id;
	const [member] = await db
		.select({ employerId: agencyMembers.employerId })
		.from(agencyMembers)
		.where(eq(agencyMembers.userId, session.user.id))
		.orderBy(desc(agencyMembers.joinedAt))
		.limit(1);
	return member?.employerId ?? null;
}

export type EmployerAnalytics = {
	employerId: string;
	companyName: string;
	kpis: {
		openJobs: number;
		applications30d: number;
		offerAcceptRate: number; // % of decided offers that were accepted
		medianResponseHours: number | null; // employer reaction to offers
	};
	funnel: {
		applications: number;
		seen: number;
		inReview: number;
		shortlisted: number;
		interview: number;
		offer: number;
		accepted: number;
	};
	applicationStatusMix: { status: string; n: number }[];
	stageOutcomes: { outcome: string; n: number }[];
	topJobs: { id: string; title: string; n: number }[];
	volume30d: { bucket: string; n: number }[]; // 7-tage-Buckets
	verifyResults: { kind: string; passed: number; failed: number; pending: number }[];
	timeToFill: { count: number; medianDays: number | null; p25Days: number | null; p75Days: number | null };
	teamSize: number;
	activity: {
		ts: Date;
		applicationId: string;
		status: string | null;
		outcome: string | null;
		kind: string;
		byRole: string;
	}[];
};

function medianOf(xs: number[]): number | null {
	if (xs.length === 0) return null;
	const sorted = xs.slice().sort((a, b) => a - b);
	const mid = Math.floor(sorted.length / 2);
	const m =
		sorted.length % 2 === 0
			? (sorted[mid - 1] + sorted[mid]) / 2
			: sorted[mid];
	return Math.round(m * 10) / 10;
}

function quantile(xs: number[], q: number): number | null {
	if (xs.length === 0) return null;
	const sorted = xs.slice().sort((a, b) => a - b);
	const idx = Math.min(sorted.length - 1, Math.floor(sorted.length * q));
	return Math.round(sorted[idx] * 10) / 10;
}

export async function getEmployerAnalytics(): Promise<EmployerAnalytics | null> {
	const employerId = await resolveMyEmployerId();
	if (!employerId) return null;
	const [emp] = await db
		.select({ id: employers.id, companyName: employers.companyName })
		.from(employers)
		.where(eq(employers.id, employerId))
		.limit(1);
	if (!emp) return null;

	const now = Date.now();
	const since30 = new Date(now - 30 * 86400_000);

	// Open jobs
	const [openJobsRow] = await db
		.select({ n: sql<number>`count(*)::int`.as("n") })
		.from(jobs)
		.where(and(eq(jobs.employerId, employerId), eq(jobs.status, "published")));

	// Applications 30d
	const [apps30dRow] = await db
		.select({ n: sql<number>`count(*)::int`.as("n") })
		.from(applications)
		.where(
			and(
				eq(applications.employerId, employerId),
				gte(applications.createdAt, since30),
			),
		)
		.catch(() => [{ n: 0 }] as { n: number }[]);

	// Offers + median response time
	const offerRows = await db
		.select({
			status: offers.status,
			createdAt: offers.createdAt,
			decidedAt: offers.decidedAt,
		})
		.from(offers)
		.where(eq(offers.employerId, employerId))
		.catch(() => []);
	const decidedOffers = offerRows.filter((o) => o.decidedAt !== null);
	const acceptedN = offerRows.filter((o) => o.status === "accepted").length;
	const offerAcceptRate =
		decidedOffers.length > 0
			? Math.round((acceptedN / decidedOffers.length) * 100)
			: 0;
	const offerResponseHours = decidedOffers
		.map((o) =>
			o.createdAt && o.decidedAt
				? (o.decidedAt.getTime() - o.createdAt.getTime()) / 3600_000
				: null,
		)
		.filter((x): x is number => x !== null);
	const medianResponseHours = medianOf(offerResponseHours);

	// Funnel (Submitted → … → Offer → Accepted) basierend auf Status-Counts.
	const statusRows = await db
		.select({
			status: applications.status,
			n: sql<number>`count(*)::int`.as("n"),
		})
		.from(applications)
		.where(eq(applications.employerId, employerId))
		.groupBy(applications.status)
		.catch(() => []);
	const sm = new Map<string, number>();
	for (const r of statusRows) sm.set(r.status, Number(r.n));
	// Kumulativer Funnel: jede Stufe schließt alle weiteren ein
	const total = [...sm.values()].reduce((a, b) => a + b, 0);
	const cumulativeFromStatus = (stages: string[]) =>
		stages.reduce((a, s) => a + (sm.get(s) ?? 0), 0);
	const funnel = {
		applications: total,
		seen: cumulativeFromStatus([
			"seen",
			"in_review",
			"shortlisted",
			"interview",
			"offer",
		]),
		inReview: cumulativeFromStatus([
			"in_review",
			"shortlisted",
			"interview",
			"offer",
		]),
		shortlisted: cumulativeFromStatus(["shortlisted", "interview", "offer"]),
		interview: cumulativeFromStatus(["interview", "offer"]),
		offer: sm.get("offer") ?? 0,
		accepted: acceptedN,
	};

	// Application-Status-Verteilung (für StackedBar)
	const applicationStatusMix = statusRows.map((r) => ({
		status: r.status,
		n: Number(r.n),
	}));

	// Stage-Outcomes auf Bewerbungen dieser Firma
	const stageOutcomeRows = await db
		.select({
			outcome: applicationEvents.outcome,
			n: sql<number>`count(*)::int`.as("n"),
		})
		.from(applicationEvents)
		.innerJoin(
			applications,
			eq(applications.id, applicationEvents.applicationId),
		)
		.where(
			and(
				eq(applications.employerId, employerId),
				sql`${applicationEvents.outcome} IS NOT NULL`,
			),
		)
		.groupBy(applicationEvents.outcome)
		.catch(() => []);
	const stageOutcomes = stageOutcomeRows
		.filter((r) => r.outcome !== null)
		.map((r) => ({ outcome: r.outcome as string, n: Number(r.n) }));

	// Top Jobs nach Application-Anzahl
	const topJobsRows = await db
		.select({
			id: jobs.id,
			title: jobs.title,
			n: sql<number>`count(${applications.id})::int`.as("n"),
		})
		.from(jobs)
		.leftJoin(applications, eq(applications.jobId, jobs.id))
		.where(eq(jobs.employerId, employerId))
		.groupBy(jobs.id, jobs.title)
		.orderBy(desc(sql<number>`count(${applications.id})`))
		.limit(8)
		.catch(() => []);
	const topJobs = topJobsRows.map((r) => ({
		id: r.id,
		title: r.title,
		n: Number(r.n),
	}));

	// Volumen 30d in 7-Tages-Buckets (4 Buckets)
	const allApps30 = await db
		.select({ createdAt: applications.createdAt })
		.from(applications)
		.where(
			and(
				eq(applications.employerId, employerId),
				gte(applications.createdAt, since30),
			),
		)
		.catch(() => []);
	const buckets = [0, 0, 0, 0];
	for (const a of allApps30) {
		if (!a.createdAt) continue;
		const daysAgo = Math.floor((now - a.createdAt.getTime()) / 86400_000);
		const idx = Math.min(3, Math.floor(daysAgo / 7));
		buckets[3 - idx]++;
	}
	const volume30d = [
		{ bucket: "T-21–30", n: buckets[0] },
		{ bucket: "T-14–20", n: buckets[1] },
		{ bucket: "T-7–13", n: buckets[2] },
		{ bucket: "T-0–6", n: buckets[3] },
	];

	// Verify-Ergebnisse auf Bewerbungen dieser Firma (über interests)
	const vRows = await db
		.select({
			kind: verifications.kind,
			status: verifications.status,
			n: sql<number>`count(*)::int`.as("n"),
		})
		.from(verifications)
		.innerJoin(applications, eq(applications.candidateUserId, verifications.candidateUserId))
		.where(eq(applications.employerId, employerId))
		.groupBy(verifications.kind, verifications.status)
		.catch(() => []);
	const vMap = new Map<
		string,
		{ passed: number; failed: number; pending: number }
	>();
	for (const r of vRows) {
		const cur = vMap.get(r.kind) ?? { passed: 0, failed: 0, pending: 0 };
		if (r.status === "passed") cur.passed = Number(r.n);
		if (r.status === "failed") cur.failed = Number(r.n);
		if (r.status === "pending") cur.pending = Number(r.n);
		vMap.set(r.kind, cur);
	}
	const verifyResults = [...vMap.entries()].map(([kind, v]) => ({ kind, ...v }));

	// Time-to-Fill: Job-Created → erste accepted Offer
	const ttfRows = await db
		.select({
			jobCreated: jobs.createdAt,
			decidedAt: offers.decidedAt,
		})
		.from(offers)
		.innerJoin(jobs, eq(jobs.id, offers.jobId))
		.where(and(eq(offers.employerId, employerId), eq(offers.status, "accepted")))
		.catch(() => []);
	const ttfDays = ttfRows
		.map((r) =>
			r.jobCreated && r.decidedAt
				? (r.decidedAt.getTime() - r.jobCreated.getTime()) / 86400_000
				: null,
		)
		.filter((x): x is number => x !== null && x >= 0);
	const timeToFill = {
		count: ttfDays.length,
		medianDays: quantile(ttfDays, 0.5),
		p25Days: quantile(ttfDays, 0.25),
		p75Days: quantile(ttfDays, 0.75),
	};

	// Team-Size
	const teamRows = await db
		.select({ n: sql<number>`count(*)::int`.as("n") })
		.from(agencyMembers)
		.where(
			and(
				eq(agencyMembers.employerId, employerId),
				isNull(agencyMembers.joinedAt) ? undefined : undefined,
			),
		)
		.catch(() => [{ n: 0 }]);
	const teamSize = Number(teamRows[0]?.n ?? 0);

	// Aktivitäts-Feed: letzte 10 application_events dieser Firma
	const activityRows = await db
		.select({
			ts: applicationEvents.createdAt,
			applicationId: applicationEvents.applicationId,
			status: applicationEvents.status,
			outcome: applicationEvents.outcome,
			kind: applicationEvents.kind,
			byRole: applicationEvents.byRole,
		})
		.from(applicationEvents)
		.innerJoin(
			applications,
			eq(applications.id, applicationEvents.applicationId),
		)
		.where(eq(applications.employerId, employerId))
		.orderBy(desc(applicationEvents.createdAt))
		.limit(10)
		.catch(() => []);
	const activity = activityRows.map((r) => ({
		ts: r.ts,
		applicationId: r.applicationId,
		status: r.status,
		outcome: r.outcome,
		kind: r.kind,
		byRole: r.byRole,
	}));

	return {
		employerId: emp.id,
		companyName: emp.companyName,
		kpis: {
			openJobs: Number(openJobsRow?.n ?? 0),
			applications30d: Number(apps30dRow?.n ?? 0),
			offerAcceptRate,
			medianResponseHours,
		},
		funnel,
		applicationStatusMix,
		stageOutcomes,
		topJobs,
		volume30d,
		verifyResults,
		timeToFill,
		teamSize,
		activity,
	};
}
