"use server";

import { and, asc, desc, eq, lte, or, sql } from "drizzle-orm";
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
	agencyMembers,
	applicationEvents,
	applicationMessages,
	applicationNotes,
	applications,
	candidateProfiles,
	employers,
	type JobStage,
	jobStages,
	jobs,
	matches,
	REJECT_REASONS,
	type RejectReason,
	stageRatings,
	users,
} from "@/db/schema";
import {
	pushNotification,
	pushNotificationToEmployerTeam,
} from "./notifications";
import { instantiateJobStages } from "./templates";

// 3 Monate ohne Reaktion → Pflicht-Closure-Dialog für den Arbeitgeber.
// Recherche: Median-Antwortzeit aktuell 6,7 Tage, Erwartung 1-2 Wochen,
// 75% bekommen NIE Antwort. 90 Tage ist die Außengrenze "wir akzeptieren
// nicht mehr dass das offen bleibt".
const CLOSURE_DEADLINE_DAYS = 90;

function addDays(date: Date, days: number): Date {
	const d = new Date(date);
	d.setUTCDate(d.getUTCDate() + days);
	return d;
}

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

		// Wenn die Stelle ein Template hat, aber noch keine job_stages
		// instanziiert wurden (z.B. weil sie schon vor Phase 12 published
		// wurde), holen wir das jetzt nach.
		if (job.templateId) {
			await instantiateJobStages(job.id, job.templateId).catch(() => {
				// kein Hard-Fail — Bewerbung darf trotzdem rein.
			});
		}

		// Lade Stage-Liste (kann leer sein bei Legacy-Jobs ohne Template).
		const stages = await db
			.select()
			.from(jobStages)
			.where(eq(jobStages.jobId, job.id))
			.orderBy(asc(jobStages.position))
			.catch(() => [] as JobStage[]);

		const firstStage = stages[0] ?? null;
		const now = new Date();

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
				currentStageId: firstStage?.id ?? null,
				stageEnteredAt: firstStage ? now : null,
				closureDeadlineAt: addDays(now, CLOSURE_DEADLINE_DAYS),
			})
			.returning({ id: applications.id });

		await db.insert(applicationEvents).values({
			applicationId: created.id,
			kind: firstStage ? "stage_change" : "status_change",
			status: "submitted",
			stageId: firstStage?.id ?? null,
			outcome: "advance",
			byRole: "candidate",
			byUserId: userId,
		});

		// Notify employer-team (alle joined Members).
		await pushNotificationToEmployerTeam({
			employerId: job.employerId,
			kind: "system",
			title: `Neue Bewerbung: ${job.title}`,
			body: profile.displayName ?? "Anonyme:r Kandidat:in",
			link: `/jobs/${job.id}/applications/${created.id}`,
		});

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

// Wolt-Style-Copy für jeden Status-Wechsel. Title kommt aus der Sicht
// des Kandidaten ("Deine Bewerbung wurde gesehen") und body erklärt
// was als nächstes passiert. Keine Personennamen.
function statusCandidateCopy(
	status: ApplicationStatus,
	jobTitle: string,
	note?: string,
): { title: string; body: string } {
	const noteSuffix = note?.trim() ? ` — ${note.slice(0, 100)}` : "";
	const titles: Record<ApplicationStatus, string> = {
		submitted: `Bewerbung eingereicht: ${jobTitle}`,
		seen: `Deine Bewerbung wurde gesehen: ${jobTitle}`,
		in_review: `Bewerbung wird geprüft: ${jobTitle}`,
		shortlisted: `Du bist auf der Shortlist: ${jobTitle}`,
		interview: `Interview-Phase: ${jobTitle}`,
		offer: `Angebot wird vorbereitet: ${jobTitle}`,
		declined: `Absage: ${jobTitle}`,
		withdrawn: `Zurückgezogen: ${jobTitle}`,
		archived: `Archiviert: ${jobTitle}`,
	};
	const bodies: Record<ApplicationStatus, string> = {
		submitted: "Die Firma hat deine Bewerbung erhalten.",
		seen: "Jemand vom Team hat sich deine Bewerbung angeschaut.",
		in_review: "Skills und Anforderungen werden gerade verglichen.",
		shortlisted:
			"Du bist im engeren Kreis — vermutlich kommt bald eine Einladung.",
		interview: "Du sprichst mit der Firma. Bei Rückfragen nutze den Chat.",
		offer: "Schau in Offers, sobald das Angebot da ist.",
		declined: "Im Feedback siehst du den Grund.",
		withdrawn: "Bewerbung wurde von dir zurückgenommen.",
		archived: "Bewerbung archiviert — Verlauf bleibt einsehbar.",
	};
	return {
		title: titles[status],
		body: `${bodies[status]}${noteSuffix}`,
	};
}

export async function setApplicationStatus(input: {
	applicationId: string;
	status: ApplicationStatus;
	note?: string;
	rejectReason?: RejectReason;
	rejectFreeText?: string;
}): Promise<{ ok: boolean; error?: string }> {
	try {
		// Decline ohne Grund ist nicht erlaubt — Kandidat:innen haben ein Recht
		// auf eine begründete Absage. UI soll immer Begründungs-Dialog zeigen.
		if (input.status === "declined") {
			if (!input.rejectReason) {
				return {
					ok: false,
					error: "Absage braucht einen Grund — bitte wähle eine Kategorie aus.",
				};
			}
			if (!REJECT_REASONS.includes(input.rejectReason)) {
				return { ok: false, error: "Ungültiger Absage-Grund." };
			}
		}

		// Auth: legacy-Owner ODER Team-Member.
		const { userId } = await requireEmployerAccessForApp(input.applicationId);
		const [app] = await db
			.select()
			.from(applications)
			.where(eq(applications.id, input.applicationId))
			.limit(1);
		if (!app) return { ok: false, error: "Bewerbung nicht gefunden." };

		// Wenn Status sich nicht ändert, kein Spam-Event.
		if (app.status === input.status) {
			return { ok: true };
		}

		const updateSet: Partial<typeof applications.$inferInsert> = {
			status: input.status,
			updatedAt: new Date(),
		};
		if (input.status === "declined") {
			updateSet.rejectReason = input.rejectReason;
			updateSet.rejectFreeText = input.rejectFreeText?.trim() || null;
		}
		await db
			.update(applications)
			.set(updateSet)
			.where(eq(applications.id, input.applicationId));

		await db.insert(applicationEvents).values({
			applicationId: input.applicationId,
			kind: "status_change",
			status: input.status,
			rejectReason: input.status === "declined" ? input.rejectReason : null,
			byRole: "employer",
			byUserId: userId,
			note: input.note?.trim() || input.rejectFreeText?.trim(),
		});

		// Kandidat:in bekommt eine schöne Notification — keine Person,
		// nur was als nächstes passiert.
		const copy = statusCandidateCopy(
			input.status,
			app.jobSnapshot.title,
			input.note,
		);
		await pushNotification({
			userId: app.candidateUserId,
			kind: "system",
			title: copy.title,
			body: copy.body,
			link: `/applications/${input.applicationId}`,
		});

		revalidatePath(`/applications/${input.applicationId}`);
		revalidatePath(`/jobs/${app.jobId}/applications`);
		revalidatePath(`/jobs/${app.jobId}/applications/board`);
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

		await pushNotificationToEmployerTeam({
			employerId: app.employerId,
			kind: "system",
			title: `Bewerbung zurückgezogen: ${app.jobSnapshot.title}`,
			body: app.profileSnapshot.displayName ?? "Kandidat:in",
			link: `/jobs/${app.jobId}/applications/${applicationId}`,
		});

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
		displayName: string | null;
		headline: string | null;
		location: string | null;
		skills: { name: string; level?: number }[];
		summary: string | null;
		yearsExperience: number | null;
		salaryDesired: number | null;
		industries: string[] | null;
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

	const eventsRaw = await db
		.select()
		.from(applicationEvents)
		.where(eq(applicationEvents.applicationId, applicationId))
		.orderBy(asc(applicationEvents.createdAt));
	// Anonymität gegenüber Kandidat:innen: byUserId nie an die
	// Kandidat-Sicht durchreichen — der Kandidat sieht nur Rollen
	// (candidate / employer / system), nie konkrete Personen.
	const events =
		viewerRole === "candidate"
			? eventsRaw.map((e) => ({ ...e, byUserId: null }))
			: eventsRaw;

	let currentProfile: ApplicationDetail["currentProfile"] = null;
	if (viewerRole === "candidate") {
		const [p] = await db
			.select({
				displayName: candidateProfiles.displayName,
				headline: candidateProfiles.headline,
				location: candidateProfiles.location,
				skills: candidateProfiles.skills,
				summary: candidateProfiles.summary,
				yearsExperience: candidateProfiles.yearsExperience,
				salaryDesired: candidateProfiles.salaryDesired,
				industries: candidateProfiles.industries,
			})
			.from(candidateProfiles)
			.where(eq(candidateProfiles.userId, app.candidateUserId))
			.limit(1);
		if (p) {
			currentProfile = {
				displayName: p.displayName,
				headline: p.headline,
				location: p.location,
				skills: (p.skills ?? []) as { name: string; level?: number }[],
				summary: p.summary,
				yearsExperience: p.yearsExperience,
				salaryDesired: p.salaryDesired,
				industries: p.industries,
			};
		}
	}

	return { application: app, events, currentProfile, viewerRole };
}

// ─── Phase 12: Stage-Outcome-Aktionen ────────────────────────────────────
// Drei Pflicht-Outcomes pro Stage: advance / reject / on_hold. Reject
// MUSS eine Begründung aus dem festen Katalog tragen — verhindert
// Geister-Absagen (siehe Studie: 75% Bewerbungen ohne jede Antwort).

export type StageOutcomeKind = "advance" | "reject" | "on_hold";

export type StageOutcomeInput = {
	applicationId: string;
	outcome: StageOutcomeKind;
	rejectReason?: RejectReason;
	rejectFreeText?: string;
	note?: string;
};

export async function decideStageOutcome(
	input: StageOutcomeInput,
): Promise<{ ok: boolean; error?: string }> {
	try {
		const { userId, employerId } = await requireEmployer();
		const [app] = await db
			.select()
			.from(applications)
			.where(eq(applications.id, input.applicationId))
			.limit(1);
		if (!app || app.employerId !== employerId) {
			return { ok: false, error: "Bewerbung nicht gefunden." };
		}
		if (
			app.status === "declined" ||
			app.status === "withdrawn" ||
			app.status === "archived"
		) {
			return { ok: false, error: "Bewerbung ist bereits abgeschlossen." };
		}

		const stages = await db
			.select()
			.from(jobStages)
			.where(eq(jobStages.jobId, app.jobId))
			.orderBy(asc(jobStages.position));

		const currentIdx = app.currentStageId
			? stages.findIndex((s) => s.id === app.currentStageId)
			: -1;
		const nextStage =
			currentIdx >= 0 && currentIdx + 1 < stages.length
				? stages[currentIdx + 1]
				: null;

		const now = new Date();

		if (input.outcome === "reject") {
			if (!input.rejectReason || !REJECT_REASONS.includes(input.rejectReason)) {
				return {
					ok: false,
					error:
						"Bitte einen Ablehnungs-Grund aus dem Katalog wählen. Einfach 'abgelehnt' ohne Grund ist nicht erlaubt.",
				};
			}
			await db
				.update(applications)
				.set({
					status: "declined",
					rejectReason: input.rejectReason,
					rejectFreeText: input.rejectFreeText?.trim() || null,
					closureDeadlineAt: null,
					updatedAt: now,
				})
				.where(eq(applications.id, input.applicationId));
			await db.insert(applicationEvents).values({
				applicationId: input.applicationId,
				kind: "stage_change",
				status: "declined",
				stageId: app.currentStageId,
				outcome: "reject",
				rejectReason: input.rejectReason,
				byRole: "employer",
				byUserId: userId,
				note: input.rejectFreeText?.trim() || input.note?.trim() || null,
			});
			await pushNotification({
				userId: app.candidateUserId,
				kind: "system",
				title: `Absage: ${app.jobSnapshot.title}`,
				body: rejectReasonLabelDE(input.rejectReason),
				link: `/applications/${input.applicationId}`,
			});
		} else if (input.outcome === "on_hold") {
			// Hold = Status bleibt sichtbar in_review, aber Closure-Deadline
			// wird verlängert. Kein Stage-Wechsel.
			await db
				.update(applications)
				.set({
					closureDeadlineAt: addDays(now, 30),
					updatedAt: now,
				})
				.where(eq(applications.id, input.applicationId));
			await db.insert(applicationEvents).values({
				applicationId: input.applicationId,
				kind: "stage_change",
				stageId: app.currentStageId,
				outcome: "on_hold",
				byRole: "employer",
				byUserId: userId,
				note: input.note?.trim() || null,
			});
			await pushNotification({
				userId: app.candidateUserId,
				kind: "system",
				title: `On-Hold: ${app.jobSnapshot.title}`,
				body:
					input.note?.trim() ??
					"Der Arbeitgeber pausiert deine Bewerbung kurz. Du wirst informiert wenn es weiter geht.",
				link: `/applications/${input.applicationId}`,
			});
		} else {
			// advance — in nächste Stage. Wenn keine nächste Stage existiert,
			// gilt es als Offer-Stage erreicht.
			const targetStage = nextStage ?? stages[stages.length - 1] ?? null;
			const isFinal = !nextStage;
			await db
				.update(applications)
				.set({
					status: isFinal ? "offer" : statusForStage(targetStage),
					currentStageId: targetStage?.id ?? app.currentStageId,
					stageEnteredAt: now,
					closureDeadlineAt: addDays(now, CLOSURE_DEADLINE_DAYS),
					updatedAt: now,
				})
				.where(eq(applications.id, input.applicationId));
			await db.insert(applicationEvents).values({
				applicationId: input.applicationId,
				kind: "stage_change",
				status: isFinal ? "offer" : statusForStage(targetStage),
				stageId: targetStage?.id ?? null,
				outcome: "advance",
				byRole: "employer",
				byUserId: userId,
				note: input.note?.trim() || null,
			});
			await pushNotification({
				userId: app.candidateUserId,
				kind: "system",
				title: `Weiter: ${app.jobSnapshot.title}`,
				body: targetStage?.name ?? "Nächster Schritt",
				link: `/applications/${input.applicationId}`,
			});
		}

		revalidatePath(`/applications/${input.applicationId}`);
		revalidatePath(`/jobs/${app.jobId}/applications`);
		revalidatePath(`/jobs/${app.jobId}/applications/${input.applicationId}`);
		return { ok: true };
	} catch (e) {
		console.error("[applications] decideStageOutcome", e);
		const friendly = friendlyDbError(e);
		if (friendly) return { ok: false, error: friendly };
		return {
			ok: false,
			error: e instanceof Error ? e.message : "fehlgeschlagen",
		};
	}
}

function statusForStage(
	stage: JobStage | null,
): "in_review" | "interview" | "offer" {
	if (!stage) return "in_review";
	switch (stage.kind) {
		case "phone_screen":
		case "interview":
		case "assessment_center":
		case "technical_assessment":
			return "interview";
		case "offer_preparation":
		case "offer_negotiation":
		case "final_decision":
			return "offer";
		default:
			return "in_review";
	}
}

function rejectReasonLabelDE(r: RejectReason): string {
	switch (r) {
		case "not_qualified_skills":
			return "Skill-Profil hat nicht gepasst.";
		case "not_qualified_experience":
			return "Berufserfahrung hat nicht gepasst.";
		case "salary_mismatch":
			return "Gehaltsvorstellung lag außerhalb des Rahmens.";
		case "location_mismatch":
			return "Standort/Remote-Setup hat nicht gepasst.";
		case "culture_mismatch":
			return "Kulturelle Passung wurde anders gesehen.";
		case "position_filled":
			return "Stelle ist anderweitig besetzt worden.";
		case "position_canceled":
			return "Stelle wurde gestrichen.";
		case "internal_candidate":
			return "Ein interner Kandidat hat die Stelle bekommen.";
		case "other":
			return "Andere Gründe — siehe Notiz.";
	}
}

// ─── Per-Stage-Bewertung durch Bewerber ───────────────────────────────────
// 4 Fragen — 1..5 Skala. Quelle: iCIMS/AIHR Candidate-Experience-Surveys.
// Aggregiert auf Employer-Ebene (Min-Bucket 10) ergibt das öffentliche
// Stats — Gegenpol zu Glassdoor: Daten kommen aus echten Prozessen, nicht
// aus Anonym-Reviews.
export async function rateStage(input: {
	applicationId: string;
	jobStageId: string;
	clarity?: number | null;
	respect?: number | null;
	effort?: number | null;
	responseTime?: number | null;
	comment?: string;
}): Promise<{ ok: boolean; error?: string }> {
	try {
		const userId = await requireCandidate();
		const [app] = await db
			.select()
			.from(applications)
			.where(eq(applications.id, input.applicationId))
			.limit(1);
		if (!app || app.candidateUserId !== userId) {
			return { ok: false, error: "Bewerbung nicht gefunden." };
		}
		const clamp = (n: number | null | undefined) =>
			n == null ? null : Math.min(5, Math.max(1, Math.round(n)));
		await db
			.insert(stageRatings)
			.values({
				applicationId: input.applicationId,
				jobStageId: input.jobStageId,
				candidateUserId: userId,
				clarity: clamp(input.clarity),
				respect: clamp(input.respect),
				effort: clamp(input.effort),
				responseTime: clamp(input.responseTime),
				comment: input.comment?.trim() || null,
			})
			.onConflictDoNothing();
		revalidatePath(`/applications/${input.applicationId}`);
		return { ok: true };
	} catch (e) {
		console.error("[applications] rateStage", e);
		const friendly = friendlyDbError(e);
		if (friendly) return { ok: false, error: friendly };
		return {
			ok: false,
			error: e instanceof Error ? e.message : "fehlgeschlagen",
		};
	}
}

// Listet alle vom Kandidaten bereits eingereichten Bewertungen pro Stage
// für genau diese Bewerbung. Hilft der UI: für vergangene Stages, die noch
// nicht bewertet wurden, wird das Inline-Rating angezeigt.
export async function listMyStageRatings(
	applicationId: string,
): Promise<{ jobStageId: string; createdAt: Date }[]> {
	try {
		const userId = await requireCandidate();
		const [app] = await db
			.select({ candidateUserId: applications.candidateUserId })
			.from(applications)
			.where(eq(applications.id, applicationId))
			.limit(1);
		if (!app || app.candidateUserId !== userId) return [];
		return await db
			.select({
				jobStageId: stageRatings.jobStageId,
				createdAt: stageRatings.createdAt,
			})
			.from(stageRatings)
			.where(eq(stageRatings.applicationId, applicationId));
	} catch (e) {
		console.warn("[applications] listMyStageRatings", e);
		return [];
	}
}

// ─── In-App-Messaging pro Bewerbung ───────────────────────────────────────
// Beide Seiten dürfen schreiben sobald die Bewerbung aktiv ist. Quelle:
// 87,5% der zurückgezogenen Bewerbungen begründen mit "Kommunikations-
// Problemen" (Eddy 2023). Eine simple Thread-View löst das.
export async function sendApplicationMessage(input: {
	applicationId: string;
	body: string;
}): Promise<{ ok: boolean; error?: string; id?: string }> {
	try {
		const session = await auth();
		if (!session?.user?.id) return { ok: false, error: "Nicht angemeldet." };
		const userId = session.user.id;
		const body = input.body.trim();
		if (body.length < 1) return { ok: false, error: "Leere Nachricht." };
		if (body.length > 2000)
			return { ok: false, error: "Maximal 2000 Zeichen." };

		const [app] = await db
			.select()
			.from(applications)
			.where(eq(applications.id, input.applicationId))
			.limit(1);
		if (!app) return { ok: false, error: "Bewerbung nicht gefunden." };

		let role: "candidate" | "employer" | null = null;
		let recipientUserId: string | null = null;
		if (app.candidateUserId === userId) {
			role = "candidate";
			const [emp] = await db
				.select({ userId: employers.userId })
				.from(employers)
				.where(eq(employers.id, app.employerId))
				.limit(1);
			recipientUserId = emp?.userId ?? null;
		} else {
			const [emp] = await db
				.select({ id: employers.id, userId: employers.userId })
				.from(employers)
				.where(eq(employers.userId, userId))
				.limit(1);
			if (emp?.id === app.employerId) {
				role = "employer";
				recipientUserId = app.candidateUserId;
			}
		}
		if (!role) return { ok: false, error: "Kein Zugriff." };

		const [created] = await db
			.insert(applicationMessages)
			.values({
				applicationId: input.applicationId,
				byUserId: userId,
				byRole: role,
				body,
			})
			.returning({ id: applicationMessages.id });

		await db.insert(applicationEvents).values({
			applicationId: input.applicationId,
			kind: "message",
			byRole: role,
			byUserId: userId,
			note: body.slice(0, 200),
		});

		if (recipientUserId) {
			await pushNotification({
				userId: recipientUserId,
				kind: "system",
				title: `Neue Nachricht: ${app.jobSnapshot.title}`,
				body: body.slice(0, 140),
				link:
					role === "candidate"
						? `/jobs/${app.jobId}/applications/${input.applicationId}`
						: `/applications/${input.applicationId}`,
			});
		}

		revalidatePath(`/applications/${input.applicationId}`);
		revalidatePath(`/jobs/${app.jobId}/applications/${input.applicationId}`);
		return { ok: true, id: created.id };
	} catch (e) {
		console.error("[applications] sendMessage", e);
		const friendly = friendlyDbError(e);
		if (friendly) return { ok: false, error: friendly };
		return {
			ok: false,
			error: e instanceof Error ? e.message : "fehlgeschlagen",
		};
	}
}

export async function listApplicationMessages(applicationId: string) {
	try {
		const session = await auth();
		if (!session?.user?.id) return [];
		const [app] = await db
			.select()
			.from(applications)
			.where(eq(applications.id, applicationId))
			.limit(1);
		if (!app) return [];
		// Access-Check: Kandidat oder Employer-Owner / Team-Mitglied.
		const isCandidate = app.candidateUserId === session.user.id;
		if (!isCandidate) {
			const [emp] = await db
				.select({ id: employers.id })
				.from(employers)
				.where(eq(employers.userId, session.user.id))
				.limit(1);
			if (emp?.id !== app.employerId) {
				// Auch Team-Mitglieder dürfen mitlesen.
				const [member] = await db
					.select({ id: agencyMembers.id })
					.from(agencyMembers)
					.where(
						and(
							eq(agencyMembers.employerId, app.employerId),
							eq(agencyMembers.userId, session.user.id),
						),
					)
					.limit(1);
				if (!member) return [];
			}
		}
		const rows = await db
			.select()
			.from(applicationMessages)
			.where(eq(applicationMessages.applicationId, applicationId))
			.orderBy(asc(applicationMessages.createdAt));
		// Kandidat:innen sehen niemals, WELCHE konkrete Person eine
		// Nachricht geschickt hat — nur die Rolle (candidate / employer).
		return isCandidate ? rows.map((m) => ({ ...m, byUserId: null })) : rows;
	} catch (e) {
		if (friendlyDbError(e)) return [];
		throw e;
	}
}

// ─── Forced-Closure-Scanner ───────────────────────────────────────────────
// Recherche: 1 in 5 Stellen ist "Ghost", 81% der Recruiter geben es zu,
// 75% der Bewerbungen kriegen NIE Antwort. Lösung: hartes Closure-Limit.
// Nach Ablauf der closureDeadlineAt erscheint ein Pflicht-Dialog beim
// Arbeitgeber. Wenn er den ignoriert, blockiert der Volume-Lock neue
// Stellen-Postings (siehe lib/match Volume-Lock-Hooks → templates.ts).
export async function listOverdueApplicationsForEmployer(): Promise<
	{
		application: Application;
		daysOverdue: number;
	}[]
> {
	try {
		const { employerId } = await requireEmployer();
		const now = new Date();
		const rows = await db
			.select()
			.from(applications)
			.where(
				and(
					eq(applications.employerId, employerId),
					or(
						and(
							sql`${applications.status} NOT IN ('declined','withdrawn','archived','offer')`,
							lte(applications.closureDeadlineAt, now),
						),
					),
				),
			)
			.orderBy(asc(applications.closureDeadlineAt))
			.limit(20);
		return rows.map((r) => ({
			application: r,
			daysOverdue: r.closureDeadlineAt
				? Math.floor(
						(now.getTime() - r.closureDeadlineAt.getTime()) /
							(24 * 60 * 60 * 1000),
					)
				: 0,
		}));
	} catch (e) {
		if (friendlyDbError(e)) return [];
		throw e;
	}
}

// Hilfsfunktion für Stage-Renderung pro Bewerbung — lädt die job_stages
// passend zum Job der Bewerbung.
export async function getStagesForApplication(
	applicationId: string,
): Promise<JobStage[]> {
	try {
		const [app] = await db
			.select({ jobId: applications.jobId })
			.from(applications)
			.where(eq(applications.id, applicationId))
			.limit(1);
		if (!app) return [];
		return await db
			.select()
			.from(jobStages)
			.where(eq(jobStages.jobId, app.jobId))
			.orderBy(asc(jobStages.position));
	} catch (e) {
		if (friendlyDbError(e)) return [];
		throw e;
	}
}

// ─── DSGVO: Auto-Lösch-Cron ───────────────────────────────────────────────
// Recherche: Bewerberdaten müssen nach Zweck gelöscht werden. 6 Monate
// nach finalem Closure-Ereignis ist die übliche Frist (Verjährung der
// AGG-Klagen). Strategie: Redact statt Hard-Delete — wir behalten die
// aggregierte Statistik (counts, ratings) aber entfernen alles Personen-
// bezogene aus den Snapshots und löschen Cover-Letter + Messages +
// Free-Text-Reject-Begründungen.
const GDPR_RETENTION_DAYS = 180;

export async function listApplicationsDueForGdprCleanup(): Promise<
	Application[]
> {
	try {
		const cutoff = new Date(
			Date.now() - GDPR_RETENTION_DAYS * 24 * 60 * 60 * 1000,
		);
		return await db
			.select()
			.from(applications)
			.where(
				and(
					sql`${applications.status} IN ('declined','withdrawn','archived')`,
					lte(applications.updatedAt, cutoff),
					sql`${applications.profileSnapshot} ? 'displayName'`,
				),
			)
			.limit(100);
	} catch {
		return [];
	}
}

// Führt den Cleanup wirklich aus. Idempotent: doppelt aufgerufen passiert
// nichts, weil die WHERE-Klausel die schon redacted Bewerbungen ausschließt
// (`displayName` ist nach Redact aus dem JSONB raus).
export async function pruneGdprStaleApplications(): Promise<{
	redacted: number;
}> {
	try {
		const cutoff = new Date(
			Date.now() - GDPR_RETENTION_DAYS * 24 * 60 * 60 * 1000,
		);
		const ids = await db
			.select({ id: applications.id })
			.from(applications)
			.where(
				and(
					sql`${applications.status} IN ('declined','withdrawn','archived')`,
					lte(applications.updatedAt, cutoff),
					sql`${applications.profileSnapshot} ? 'displayName'`,
				),
			)
			.limit(500);
		if (ids.length === 0) return { redacted: 0 };

		const idList = ids.map((r) => r.id);
		const idSql = sql.join(
			idList.map((id) => sql`${id}`),
			sql`, `,
		);

		// Cover-Letter + Free-Text + Personenbezug aus Snapshot löschen.
		// JSONB Operator `-` entfernt einen Schlüssel.
		await db.execute(sql`
			UPDATE applications
			SET
				cover_letter = NULL,
				reject_free_text = NULL,
				profile_snapshot = profile_snapshot
					- 'displayName'
					- 'location'
					- 'salaryDesired'
					- 'summary'
			WHERE id IN (${idSql})
		`);

		// Messages hard-deleten — Free-Text-Inhalte.
		await db.execute(sql`
			DELETE FROM application_messages
			WHERE application_id IN (${idSql})
		`);

		// Event-Log entpersonalisieren — Notes löschen, Timestamps +
		// Status + Outcome bleiben für Audit/Statistik.
		await db.execute(sql`
			UPDATE application_events
			SET note = NULL, by_user_id = NULL
			WHERE application_id IN (${idSql})
		`);

		console.info(
			`[gdpr] redacted ${idList.length} stale applications (>${GDPR_RETENTION_DAYS} days old)`,
		);
		return { redacted: idList.length };
	} catch (e) {
		console.warn("[gdpr] prune failed", e);
		return { redacted: 0 };
	}
}

// ─── Team-Notizen ────────────────────────────────────────────────────────
// Sichtbar nur für Employer-Members, NICHT für Kandidat:innen. Wird beim
// Application-Detail-Page über dem Message-Thread eingebettet.

async function requireEmployerAccessForApp(appId: string): Promise<{
	userId: string;
	employerId: string;
}> {
	const session = await auth();
	if (!session?.user?.id) throw new Error("unauthenticated");
	const [app] = await db
		.select({ employerId: applications.employerId })
		.from(applications)
		.where(eq(applications.id, appId))
		.limit(1);
	if (!app) throw new Error("not found");
	const [owner] = await db
		.select({ id: employers.id })
		.from(employers)
		.where(
			and(
				eq(employers.id, app.employerId),
				eq(employers.userId, session.user.id),
			),
		)
		.limit(1);
	if (owner) return { userId: session.user.id, employerId: app.employerId };
	const [member] = await db
		.select({ id: agencyMembers.id })
		.from(agencyMembers)
		.where(
			and(
				eq(agencyMembers.employerId, app.employerId),
				eq(agencyMembers.userId, session.user.id),
			),
		)
		.limit(1);
	if (!member) throw new Error("not authorised");
	return { userId: session.user.id, employerId: app.employerId };
}

export async function listApplicationNotes(applicationId: string): Promise<
	{
		id: string;
		body: string;
		createdAt: Date;
		authorName: string | null;
		authorEmail: string | null;
	}[]
> {
	await requireEmployerAccessForApp(applicationId);
	const rows = await db
		.select({
			id: applicationNotes.id,
			body: applicationNotes.body,
			createdAt: applicationNotes.createdAt,
			authorUserId: applicationNotes.authorUserId,
			authorName: users.name,
			authorEmail: users.email,
		})
		.from(applicationNotes)
		.leftJoin(users, eq(users.id, applicationNotes.authorUserId))
		.where(eq(applicationNotes.applicationId, applicationId))
		.orderBy(desc(applicationNotes.createdAt));
	return rows.map((r) => ({
		id: r.id,
		body: r.body,
		createdAt: r.createdAt,
		authorName: r.authorName,
		authorEmail: r.authorEmail,
	}));
}

export async function addApplicationNote(input: {
	applicationId: string;
	body: string;
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
	try {
		const { userId } = await requireEmployerAccessForApp(input.applicationId);
		const body = input.body.trim();
		if (body.length === 0) {
			return { ok: false, error: "Notiz darf nicht leer sein." };
		}
		if (body.length > 4000) {
			return { ok: false, error: "Notiz ist zu lang (max 4000 Zeichen)." };
		}
		const [n] = await db
			.insert(applicationNotes)
			.values({
				applicationId: input.applicationId,
				authorUserId: userId,
				body,
			})
			.returning({ id: applicationNotes.id });

		// Wenn die Bewerbung noch in "submitted" oder "seen" steht, hebt das
		// erste Team-Kommentar sie automatisch auf "in_review" — denn ab dem
		// Moment wird sie konkret diskutiert.
		try {
			const [app] = await db
				.select({ status: applications.status })
				.from(applications)
				.where(eq(applications.id, input.applicationId))
				.limit(1);
			if (app && (app.status === "submitted" || app.status === "seen")) {
				await db
					.update(applications)
					.set({ status: "in_review", updatedAt: new Date() })
					.where(eq(applications.id, input.applicationId));
				await db.insert(applicationEvents).values({
					applicationId: input.applicationId,
					kind: "status_change",
					status: "in_review",
					byRole: "system",
					note: "Team-Notiz hinzugefügt — automatisch auf In Prüfung gesetzt.",
				});
			}
		} catch (e) {
			console.warn("[applications] auto-in_review failed", e);
		}

		revalidatePath(`/applications/${input.applicationId}`);
		// Auch der Employer-Detail-Pfad (jobs/[id]/applications/[appId])
		// rendert die Notes — beide Pfade revalidieren.
		return { ok: true, id: n.id };
	} catch (e) {
		return {
			ok: false,
			error: e instanceof Error ? e.message : "fehlgeschlagen",
		};
	}
}

export async function deleteApplicationNote(
	noteId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
	try {
		const session = await auth();
		if (!session?.user?.id) return { ok: false, error: "unauthenticated" };
		const [n] = await db
			.select()
			.from(applicationNotes)
			.where(eq(applicationNotes.id, noteId))
			.limit(1);
		if (!n) return { ok: false, error: "Notiz nicht gefunden." };
		// Nur eigene Notizen darf der/die Author:in löschen.
		if (n.authorUserId !== session.user.id) {
			return { ok: false, error: "Nur eigene Notizen können gelöscht werden." };
		}
		await db.delete(applicationNotes).where(eq(applicationNotes.id, noteId));
		revalidatePath(`/applications/${n.applicationId}`);
		return { ok: true };
	} catch (e) {
		return {
			ok: false,
			error: e instanceof Error ? e.message : "fehlgeschlagen",
		};
	}
}

// ─── Status + Bulk-Status für Kanban / Liste ─────────────────────────────

export async function bulkSetApplicationStatus(input: {
	applicationIds: string[];
	status: ApplicationStatus;
}): Promise<{ ok: true; n: number } | { ok: false; error: string }> {
	try {
		const session = await auth();
		if (!session?.user?.id) return { ok: false, error: "unauthenticated" };
		let count = 0;
		// Iteratiover Ansatz statt einem big-UPDATE: jede App muss einzeln
		// gegen den Auth-Guard laufen (Mandanten-Trennung). Ist O(N) DB-Calls
		// — bei realistischer Bulk-Größe (max 20-30) völlig okay.
		for (const id of input.applicationIds) {
			const r = await setApplicationStatus({
				applicationId: id,
				status: input.status,
			});
			if (r.ok) count++;
		}
		return { ok: true, n: count };
	} catch (e) {
		return {
			ok: false,
			error: e instanceof Error ? e.message : "fehlgeschlagen",
		};
	}
}
