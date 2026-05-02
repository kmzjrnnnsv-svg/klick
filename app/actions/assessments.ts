"use server";

import { and, desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import {
	type AssessmentChoice,
	assessmentResponses,
	employers,
	jobAssessmentQuestions,
	jobAssessments,
	jobs,
	users,
} from "@/db/schema";
import { getAIProvider } from "@/lib/ai";
import { pushNotification } from "./notifications";

async function requireEmployer() {
	const session = await auth();
	if (!session?.user?.id) throw new Error("unauthenticated");
	const [u] = await db
		.select({ role: users.role })
		.from(users)
		.where(eq(users.id, session.user.id))
		.limit(1);
	if (u?.role !== "employer") throw new Error("forbidden");
	const [emp] = await db
		.select()
		.from(employers)
		.where(eq(employers.userId, session.user.id))
		.limit(1);
	if (!emp) throw new Error("no employer profile");
	return { userId: session.user.id, employer: emp };
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

export async function upsertAssessment(input: {
	jobId: string;
	title: string;
	description?: string;
	questions: Array<{
		kind: "mc" | "open";
		body: string;
		choices?: AssessmentChoice[];
		correctChoice?: number;
		rubric?: string;
		maxPoints?: number;
	}>;
}): Promise<{ id: string }> {
	const { employer } = await requireEmployer();
	const [job] = await db
		.select()
		.from(jobs)
		.where(eq(jobs.id, input.jobId))
		.limit(1);
	if (!job || job.employerId !== employer.id) throw new Error("forbidden");
	if (input.questions.length === 0) throw new Error("at least one question");

	const [existing] = await db
		.select()
		.from(jobAssessments)
		.where(eq(jobAssessments.jobId, input.jobId))
		.limit(1);

	let assessmentId: string;
	if (existing) {
		await db
			.update(jobAssessments)
			.set({
				title: input.title.trim().slice(0, 200),
				description: input.description?.trim() ?? null,
			})
			.where(eq(jobAssessments.id, existing.id));
		assessmentId = existing.id;
		// Replace question set wholesale — simpler than diffing.
		await db
			.delete(jobAssessmentQuestions)
			.where(eq(jobAssessmentQuestions.assessmentId, existing.id));
	} else {
		const [created] = await db
			.insert(jobAssessments)
			.values({
				jobId: input.jobId,
				title: input.title.trim().slice(0, 200),
				description: input.description?.trim() ?? null,
			})
			.returning({ id: jobAssessments.id });
		assessmentId = created.id;
	}

	for (let i = 0; i < input.questions.length; i++) {
		const q = input.questions[i];
		await db.insert(jobAssessmentQuestions).values({
			assessmentId,
			position: i,
			kind: q.kind,
			body: q.body.trim().slice(0, 800),
			choices: q.kind === "mc" ? (q.choices ?? null) : null,
			correctChoice: q.kind === "mc" ? (q.correctChoice ?? null) : null,
			rubric: q.kind === "open" ? (q.rubric?.trim() ?? null) : null,
			maxPoints: Math.max(1, Math.min(10, q.maxPoints ?? 1)),
		});
	}

	revalidatePath(`/jobs/${input.jobId}`);
	revalidatePath(`/jobs/${input.jobId}/assessment`);
	revalidatePath(`/jobs/browse/${input.jobId}`);
	return { id: assessmentId };
}

export async function getAssessmentForJob(jobId: string) {
	const [a] = await db
		.select()
		.from(jobAssessments)
		.where(eq(jobAssessments.jobId, jobId))
		.limit(1);
	if (!a) return null;
	const questions = await db
		.select()
		.from(jobAssessmentQuestions)
		.where(eq(jobAssessmentQuestions.assessmentId, a.id))
		.orderBy(jobAssessmentQuestions.position);
	return { assessment: a, questions };
}

export async function startAssessmentResponse(jobId: string): Promise<{
	id: string;
}> {
	const candidateId = await requireCandidate();
	const a = await getAssessmentForJob(jobId);
	if (!a) throw new Error("no assessment for this job");

	const [existing] = await db
		.select()
		.from(assessmentResponses)
		.where(
			and(
				eq(assessmentResponses.assessmentId, a.assessment.id),
				eq(assessmentResponses.candidateUserId, candidateId),
			),
		)
		.limit(1);
	if (existing) return { id: existing.id };

	const [created] = await db
		.insert(assessmentResponses)
		.values({
			assessmentId: a.assessment.id,
			jobId,
			candidateUserId: candidateId,
			answers: [],
		})
		.returning({ id: assessmentResponses.id });
	return { id: created.id };
}

export async function submitAssessment(input: {
	responseId: string;
	answers: Array<{
		questionId: string;
		choiceIndex?: number;
		openText?: string;
	}>;
}): Promise<void> {
	const candidateId = await requireCandidate();
	const [resp] = await db
		.select()
		.from(assessmentResponses)
		.where(eq(assessmentResponses.id, input.responseId))
		.limit(1);
	if (!resp || resp.candidateUserId !== candidateId)
		throw new Error("not found");
	if (resp.status === "submitted" || resp.status === "graded")
		throw new Error("already submitted");

	const questions = await db
		.select()
		.from(jobAssessmentQuestions)
		.where(eq(jobAssessmentQuestions.assessmentId, resp.assessmentId))
		.orderBy(jobAssessmentQuestions.position);

	const byId = new Map(questions.map((q) => [q.id, q]));
	const maxScore = questions.reduce((sum, q) => sum + q.maxPoints, 0);
	const stored = input.answers.map((a) => {
		const q = byId.get(a.questionId);
		if (!q) return { questionId: a.questionId, kind: "open" as const };
		return {
			questionId: a.questionId,
			kind: q.kind,
			choiceIndex: q.kind === "mc" ? a.choiceIndex : undefined,
			openText: q.kind === "open" ? a.openText : undefined,
		};
	});

	await db
		.update(assessmentResponses)
		.set({
			answers: stored,
			status: "submitted",
			submittedAt: new Date(),
			maxScore,
		})
		.where(eq(assessmentResponses.id, input.responseId));

	// Grade in the background — instant MC scoring + AI for open answers.
	after(async () => {
		await gradeAssessment(input.responseId).catch((e) =>
			console.error("[assessments] grade failed", e),
		);
	});

	const [job] = await db
		.select({ id: jobs.id, title: jobs.title, employerId: jobs.employerId })
		.from(jobs)
		.where(eq(jobs.id, resp.jobId))
		.limit(1);
	if (job) {
		const [emp] = await db
			.select({ userId: employers.userId })
			.from(employers)
			.where(eq(employers.id, job.employerId))
			.limit(1);
		if (emp) {
			await pushNotification({
				userId: emp.userId,
				kind: "system",
				title: `Assessment abgeschickt: ${job.title}`,
				body: "Eine anonyme Antwort liegt vor — Score wird gerade berechnet.",
				link: `/jobs/${job.id}/assessment/responses`,
			});
		}
	}

	revalidatePath(`/jobs/browse/${resp.jobId}`);
}

async function gradeAssessment(responseId: string): Promise<void> {
	const [resp] = await db
		.select()
		.from(assessmentResponses)
		.where(eq(assessmentResponses.id, responseId))
		.limit(1);
	if (!resp) return;
	const questions = await db
		.select()
		.from(jobAssessmentQuestions)
		.where(eq(jobAssessmentQuestions.assessmentId, resp.assessmentId));
	const byId = new Map(questions.map((q) => [q.id, q]));
	const ai = getAIProvider();

	const graded: typeof resp.answers = [];
	let total = 0;
	for (const a of resp.answers) {
		const q = byId.get(a.questionId);
		if (!q) {
			graded.push(a);
			continue;
		}
		if (q.kind === "mc") {
			const pts =
				a.choiceIndex === q.correctChoice
					? q.maxPoints
					: q.choices && a.choiceIndex !== undefined
						? Math.max(
								0,
								Math.min(
									q.maxPoints,
									Math.round(q.choices[a.choiceIndex]?.weight ?? 0),
								),
							)
						: 0;
			total += pts;
			graded.push({ ...a, pointsEarned: pts });
		} else if (
			q.kind === "open" &&
			a.openText &&
			a.openText.trim().length > 0
		) {
			const r = await ai.gradeOpenAnswer({
				question: q.body,
				rubric: q.rubric,
				answer: a.openText,
				maxPoints: q.maxPoints,
			});
			total += r.pointsEarned;
			graded.push({
				...a,
				pointsEarned: r.pointsEarned,
				aiFeedback: r.feedback,
			});
		} else {
			graded.push({ ...a, pointsEarned: 0 });
		}
	}

	await db
		.update(assessmentResponses)
		.set({
			answers: graded,
			totalScore: total,
			status: "graded",
			gradedAt: new Date(),
		})
		.where(eq(assessmentResponses.id, responseId));
}

export async function getMyResponse(jobId: string) {
	const candidateId = await requireCandidate();
	const a = await getAssessmentForJob(jobId);
	if (!a) return null;
	const [resp] = await db
		.select()
		.from(assessmentResponses)
		.where(
			and(
				eq(assessmentResponses.assessmentId, a.assessment.id),
				eq(assessmentResponses.candidateUserId, candidateId),
			),
		)
		.limit(1);
	return resp ?? null;
}

export async function listResponsesForJob(jobId: string) {
	const { employer } = await requireEmployer();
	const [job] = await db
		.select({ employerId: jobs.employerId })
		.from(jobs)
		.where(eq(jobs.id, jobId))
		.limit(1);
	if (!job || job.employerId !== employer.id) throw new Error("forbidden");
	return db
		.select()
		.from(assessmentResponses)
		.where(eq(assessmentResponses.jobId, jobId))
		.orderBy(desc(assessmentResponses.submittedAt));
}

export async function getResponseScore(
	candidateUserId: string,
	jobId: string,
): Promise<{ score: number; max: number; status: string } | null> {
	const a = await getAssessmentForJob(jobId);
	if (!a) return null;
	const [r] = await db
		.select({
			totalScore: assessmentResponses.totalScore,
			maxScore: assessmentResponses.maxScore,
			status: assessmentResponses.status,
		})
		.from(assessmentResponses)
		.where(
			and(
				eq(assessmentResponses.assessmentId, a.assessment.id),
				eq(assessmentResponses.candidateUserId, candidateUserId),
			),
		)
		.limit(1);
	if (!r || r.totalScore === null || r.maxScore === null) return null;
	return { score: r.totalScore, max: r.maxScore, status: r.status };
}
