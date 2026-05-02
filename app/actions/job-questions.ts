"use server";

import { and, desc, eq, isNotNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { db } from "@/db";
import {
	employers,
	type JobQuestion,
	jobQuestions,
	jobs,
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

export async function askJobQuestion(input: {
	jobId: string;
	body: string;
}): Promise<{ id: string }> {
	const candidateId = await requireCandidate();
	const body = input.body.trim();
	if (body.length < 5) throw new Error("question too short");
	if (body.length > 600) throw new Error("question too long");

	const [job] = await db
		.select({ id: jobs.id, title: jobs.title, employerId: jobs.employerId })
		.from(jobs)
		.where(eq(jobs.id, input.jobId))
		.limit(1);
	if (!job) throw new Error("job not found");

	const [created] = await db
		.insert(jobQuestions)
		.values({
			jobId: input.jobId,
			candidateUserId: candidateId,
			body,
		})
		.returning({ id: jobQuestions.id });

	const [emp] = await db
		.select({ userId: employers.userId })
		.from(employers)
		.where(eq(employers.id, job.employerId))
		.limit(1);
	if (emp) {
		await pushNotification({
			userId: emp.userId,
			kind: "system",
			title: `Neue Frage zu „${job.title}"`,
			body: body.slice(0, 140),
			link: `/jobs/${input.jobId}/questions`,
			payload: { jobId: input.jobId, questionId: created.id },
		});
	}

	revalidatePath(`/jobs/browse/${input.jobId}`);
	revalidatePath(`/jobs/${input.jobId}/questions`);
	return created;
}

export async function answerJobQuestion(input: {
	questionId: string;
	answer: string;
	makePublic?: boolean;
}): Promise<void> {
	const { userId, employer } = await requireEmployer();
	const answer = input.answer.trim();
	if (answer.length < 1) throw new Error("answer empty");
	if (answer.length > 1500) throw new Error("answer too long");

	const [q] = await db
		.select({
			question: jobQuestions,
			employerId: jobs.employerId,
			jobId: jobs.id,
			jobTitle: jobs.title,
		})
		.from(jobQuestions)
		.leftJoin(jobs, eq(jobs.id, jobQuestions.jobId))
		.where(eq(jobQuestions.id, input.questionId))
		.limit(1);
	if (!q || q.employerId !== employer.id) throw new Error("not found");

	await db
		.update(jobQuestions)
		.set({
			answer,
			answeredAt: new Date(),
			answeredByUserId: userId,
			isPublic: !!input.makePublic,
		})
		.where(eq(jobQuestions.id, input.questionId));

	await pushNotification({
		userId: q.question.candidateUserId,
		kind: "system",
		title: `Antwort auf deine Frage zu „${q.jobTitle ?? "Stelle"}"`,
		body: answer.slice(0, 140),
		link: `/jobs/browse/${q.jobId}`,
		payload: { jobId: q.jobId, questionId: q.question.id },
	});

	revalidatePath(`/jobs/browse/${q.jobId}`);
	revalidatePath(`/jobs/${q.jobId}/questions`);
}

// Anyone visiting the job page sees only public Q&A (anonymous).
export async function listPublicQuestionsForJob(
	jobId: string,
): Promise<{ body: string; answer: string; answeredAt: Date }[]> {
	const rows = await db
		.select()
		.from(jobQuestions)
		.where(
			and(
				eq(jobQuestions.jobId, jobId),
				eq(jobQuestions.isPublic, true),
				isNotNull(jobQuestions.answer),
			),
		)
		.orderBy(desc(jobQuestions.answeredAt));
	return rows
		.filter((r) => r.answer && r.answeredAt)
		.map((r) => ({
			body: r.body,
			answer: r.answer as string,
			answeredAt: r.answeredAt as Date,
		}));
}

// Logged-in candidate sees their own Q&A on a job (private + public mixed).
export async function listMyQuestionsForJob(
	jobId: string,
): Promise<JobQuestion[]> {
	const candidateId = await requireCandidate();
	return db
		.select()
		.from(jobQuestions)
		.where(
			and(
				eq(jobQuestions.jobId, jobId),
				eq(jobQuestions.candidateUserId, candidateId),
			),
		)
		.orderBy(desc(jobQuestions.createdAt));
}

// Employer inbox: all questions on their job.
export async function listQuestionsForJob(
	jobId: string,
): Promise<JobQuestion[]> {
	const { employer } = await requireEmployer();
	const [job] = await db
		.select({ employerId: jobs.employerId })
		.from(jobs)
		.where(eq(jobs.id, jobId))
		.limit(1);
	if (!job || job.employerId !== employer.id) throw new Error("forbidden");
	return db
		.select()
		.from(jobQuestions)
		.where(eq(jobQuestions.jobId, jobId))
		.orderBy(desc(jobQuestions.createdAt));
}
