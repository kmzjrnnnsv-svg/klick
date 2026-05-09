"use server";

import { and, asc, desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { db } from "@/db";
import {
	type Application,
	type ApplicationEvent,
	type ApplicationJobSnapshot,
	type ApplicationMatchSnapshot,
	type ApplicationProfileSnapshot,
	type ApplicationStatus,
	applicationEvents,
	applications,
	candidateProfiles,
	employers,
	jobs,
	matches,
	users,
} from "@/db/schema";
import { pushNotification } from "./notifications";

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

// Postgres meldet fehlende Tabellen / Spalten mit SQLSTATE 42P01 / 42703.
// Wir mappen das auf eine Klartext-Botschaft, damit nicht der rohe Query
// im UI landet wenn auf dem Server die Migration fehlt.
function friendlyDbError(e: unknown): string | null {
	const msg = e instanceof Error ? e.message : String(e);
	const code =
		typeof e === "object" && e !== null && "code" in e
			? String((e as { code?: unknown }).code)
			: "";
	if (
		code === "42P01" ||
		/relation .* does not exist/i.test(msg) ||
		/table .* does not exist/i.test(msg)
	) {
		return "Diese Funktion ist auf dem Server noch nicht aktiviert. Bitte 'pnpm db:migrate' ausführen.";
	}
	if (code === "42703" || /column .* does not exist/i.test(msg)) {
		return "Schema veraltet. Bitte 'pnpm db:migrate' auf dem Server ausführen.";
	}
	return null;
}

async function requireEmployer(): Promise<{
	userId: string;
	employerId: string;
}> {
	const session = await auth();
	if (!session?.user?.id) throw new Error("unauthenticated");
	const [emp] = await db
		.select()
		.from(employers)
		.where(eq(employers.userId, session.user.id))
		.limit(1);
	if (!emp) throw new Error("no employer");
	return { userId: session.user.id, employerId: emp.id };
}

export type SubmitApplicationResult =
	| { ok: true; id: string }
	| { ok: false; error: string };

export async function submitApplication(input: {
	jobId: string;
	coverLetter?: string;
}): Promise<SubmitApplicationResult> {
	try {
		const userId = await requireCandidate();

		const [job] = await db
			.select()
			.from(jobs)
			.where(eq(jobs.id, input.jobId))
			.limit(1);
		if (!job) return { ok: false, error: "Stelle nicht gefunden." };
		if (job.status !== "published") {
			return { ok: false, error: "Stelle ist nicht ausgeschrieben." };
		}

		const [existing] = await db
			.select({ id: applications.id })
			.from(applications)
			.where(
				and(
					eq(applications.jobId, input.jobId),
					eq(applications.candidateUserId, userId),
				),
			)
			.limit(1);
		if (existing) {
			return {
				ok: false,
				error: "Du hast dich auf diese Stelle bereits beworben.",
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
				error: "Bitte fülle erst dein Profil aus, bevor du dich bewirbst.",
			};
		}

		const profileSnapshot: ApplicationProfileSnapshot = {
			displayName: profile.displayName,
			headline: profile.headline,
			location: profile.location,
			yearsExperience: profile.yearsExperience,
			salaryDesired: profile.salaryDesired,
			skills: profile.skills ?? [],
			summary: profile.summary,
			industries: profile.industries,
		};

		const jobSnapshot: ApplicationJobSnapshot = {
			title: job.title,
			description: job.description,
			location: job.location,
			remotePolicy: job.remotePolicy,
			salaryMin: job.salaryMin,
			salaryMax: job.salaryMax,
			yearsExperienceMin: job.yearsExperienceMin,
			requirements: job.requirements ?? [],
			languages: job.languages,
		};

		// Existing match (computed by engine) — copy as snapshot.
		const [match] = await db
			.select()
			.from(matches)
			.where(
				and(
					eq(matches.jobId, input.jobId),
					eq(matches.candidateUserId, userId),
				),
			)
			.limit(1);
		const matchSnapshot: ApplicationMatchSnapshot | null = match
			? {
					hardScore: match.hardScore,
					softScore: match.softScore,
					matchedSkills: match.matchedSkills ?? [],
					missingSkills: match.missingSkills ?? [],
					adjacentSkills: match.adjacentSkills ?? [],
					rationale: match.rationale,
				}
			: null;

		const [created] = await db
			.insert(applications)
			.values({
				jobId: input.jobId,
				candidateUserId: userId,
				employerId: job.employerId,
				coverLetter: input.coverLetter?.trim() ?? null,
				profileSnapshot,
				jobSnapshot,
				matchSnapshot,
			})
			.returning({ id: applications.id });

		await db.insert(applicationEvents).values({
			applicationId: created.id,
			kind: "status_change",
			status: "submitted",
			byRole: "candidate",
			byUserId: userId,
		});

		// Notify employer.
		const [emp] = await db
			.select({ userId: employers.userId, name: employers.companyName })
			.from(employers)
			.where(eq(employers.id, job.employerId))
			.limit(1);
		if (emp) {
			await pushNotification({
				userId: emp.userId,
				kind: "system",
				title: `Neue Bewerbung: ${job.title}`,
				body: profile.displayName ?? "Anonyme:r Kandidat:in",
				link: `/jobs/${job.id}/applications/${created.id}`,
			});
		}

		revalidatePath(`/jobs/browse/${input.jobId}`);
		revalidatePath("/applications");
		revalidatePath(`/jobs/${input.jobId}/applications`);
		return { ok: true, id: created.id };
	} catch (e) {
		console.error("[applications] submit failed", e);
		const friendly = friendlyDbError(e);
		if (friendly) return { ok: false, error: friendly };
		return {
			ok: false,
			error: e instanceof Error ? e.message : "unbekannter Fehler",
		};
	}
}

export async function setApplicationStatus(input: {
	applicationId: string;
	status: ApplicationStatus;
	note?: string;
}): Promise<{ ok: boolean; error?: string }> {
	try {
		const { userId, employerId } = await requireEmployer();
		const [app] = await db
			.select()
			.from(applications)
			.where(eq(applications.id, input.applicationId))
			.limit(1);
		if (!app || app.employerId !== employerId)
			return { ok: false, error: "Bewerbung nicht gefunden." };

		await db
			.update(applications)
			.set({ status: input.status, updatedAt: new Date() })
			.where(eq(applications.id, input.applicationId));

		await db.insert(applicationEvents).values({
			applicationId: input.applicationId,
			kind: "status_change",
			status: input.status,
			byRole: "employer",
			byUserId: userId,
			note: input.note?.trim(),
		});

		await pushNotification({
			userId: app.candidateUserId,
			kind: "system",
			title: `Status deiner Bewerbung: ${input.status}`,
			body: `${app.jobSnapshot.title}${input.note ? ` — ${input.note.slice(0, 80)}` : ""}`,
			link: `/applications/${input.applicationId}`,
		});

		revalidatePath(`/applications/${input.applicationId}`);
		revalidatePath(`/jobs/${app.jobId}/applications`);
		return { ok: true };
	} catch (e) {
		console.error("[applications] set status failed", e);
		const friendly = friendlyDbError(e);
		if (friendly) return { ok: false, error: friendly };
		return {
			ok: false,
			error: e instanceof Error ? e.message : "fehlgeschlagen",
		};
	}
}

export async function withdrawApplication(
	applicationId: string,
): Promise<{ ok: boolean; error?: string }> {
	try {
		const userId = await requireCandidate();
		const [app] = await db
			.select()
			.from(applications)
			.where(eq(applications.id, applicationId))
			.limit(1);
		if (!app || app.candidateUserId !== userId)
			return { ok: false, error: "Bewerbung nicht gefunden." };

		await db
			.update(applications)
			.set({ status: "withdrawn", updatedAt: new Date() })
			.where(eq(applications.id, applicationId));
		await db.insert(applicationEvents).values({
			applicationId,
			kind: "status_change",
			status: "withdrawn",
			byRole: "candidate",
			byUserId: userId,
		});

		const [emp] = await db
			.select({ userId: employers.userId })
			.from(employers)
			.where(eq(employers.id, app.employerId))
			.limit(1);
		if (emp) {
			await pushNotification({
				userId: emp.userId,
				kind: "system",
				title: `Bewerbung zurückgezogen: ${app.jobSnapshot.title}`,
				body: app.profileSnapshot.displayName ?? "Kandidat:in",
				link: `/jobs/${app.jobId}/applications/${applicationId}`,
			});
		}

		revalidatePath("/applications");
		revalidatePath(`/applications/${applicationId}`);
		return { ok: true };
	} catch (e) {
		return {
			ok: false,
			error: e instanceof Error ? e.message : "fehlgeschlagen",
		};
	}
}

// Mark as seen on first employer open (best-effort, no notification).
export async function markApplicationSeen(
	applicationId: string,
): Promise<void> {
	try {
		const { employerId } = await requireEmployer();
		const [app] = await db
			.select()
			.from(applications)
			.where(eq(applications.id, applicationId))
			.limit(1);
		if (!app || app.employerId !== employerId) return;
		if (app.status !== "submitted") return;
		await db
			.update(applications)
			.set({ status: "seen", updatedAt: new Date() })
			.where(eq(applications.id, applicationId));
		await db.insert(applicationEvents).values({
			applicationId,
			kind: "status_change",
			status: "seen",
			byRole: "system",
		});
	} catch (e) {
		console.warn("[applications] markSeen", e);
	}
}

export type ApplicationListEntry = {
	application: Application;
};

export async function listMyApplications(): Promise<ApplicationListEntry[]> {
	try {
		const userId = await requireCandidate();
		const rows = await db
			.select()
			.from(applications)
			.where(eq(applications.candidateUserId, userId))
			.orderBy(desc(applications.createdAt));
		return rows.map((r) => ({ application: r }));
	} catch (e) {
		if (friendlyDbError(e)) return [];
		throw e;
	}
}

export async function listApplicationsForJob(
	jobId: string,
): Promise<Application[]> {
	try {
		const { employerId } = await requireEmployer();
		const [job] = await db
			.select()
			.from(jobs)
			.where(eq(jobs.id, jobId))
			.limit(1);
		if (!job || job.employerId !== employerId) return [];
		return await db
			.select()
			.from(applications)
			.where(eq(applications.jobId, jobId))
			.orderBy(desc(applications.createdAt));
	} catch (e) {
		if (friendlyDbError(e)) return [];
		throw e;
	}
}

export type ApplicationDetail = {
	application: Application;
	events: ApplicationEvent[];
	currentProfile: {
		skills: { name: string; level?: number }[];
		summary: string | null;
		yearsExperience: number | null;
		salaryDesired: number | null;
	} | null;
	viewerRole: "candidate" | "employer" | null;
};

export async function getApplicationDetail(
	applicationId: string,
): Promise<ApplicationDetail | null> {
	const session = await auth();
	if (!session?.user?.id) return null;

	const [app] = await db
		.select()
		.from(applications)
		.where(eq(applications.id, applicationId))
		.limit(1);
	if (!app) return null;

	let viewerRole: "candidate" | "employer" | null = null;
	if (app.candidateUserId === session.user.id) viewerRole = "candidate";
	else {
		const [emp] = await db
			.select({ id: employers.id })
			.from(employers)
			.where(eq(employers.userId, session.user.id))
			.limit(1);
		if (emp?.id === app.employerId) viewerRole = "employer";
	}
	if (!viewerRole) return null;

	const events = await db
		.select()
		.from(applicationEvents)
		.where(eq(applicationEvents.applicationId, applicationId))
		.orderBy(asc(applicationEvents.createdAt));

	let currentProfile: ApplicationDetail["currentProfile"] = null;
	if (viewerRole === "candidate") {
		const [p] = await db
			.select({
				skills: candidateProfiles.skills,
				summary: candidateProfiles.summary,
				yearsExperience: candidateProfiles.yearsExperience,
				salaryDesired: candidateProfiles.salaryDesired,
			})
			.from(candidateProfiles)
			.where(eq(candidateProfiles.userId, app.candidateUserId))
			.limit(1);
		if (p) {
			currentProfile = {
				skills: (p.skills ?? []) as { name: string; level?: number }[],
				summary: p.summary,
				yearsExperience: p.yearsExperience,
				salaryDesired: p.salaryDesired,
			};
		}
	}

	return { application: app, events, currentProfile, viewerRole };
}
