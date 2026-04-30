"use server";

import { and, desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { computeMatchesForJob } from "@/app/actions/matches";
import { auth } from "@/auth";
import { db } from "@/db";
import {
	type Employer,
	employers,
	type Job,
	type JobRequirement,
	jobs,
	users,
} from "@/db/schema";
import { getAIProvider } from "@/lib/ai";
import type { SuggestedJobRequirement } from "@/lib/ai/types";

const requirementSchema: z.ZodType<JobRequirement> = z.object({
	name: z.string().min(1).max(80),
	weight: z.enum(["must", "nice"]),
	minLevel: z
		.union([
			z.literal(1),
			z.literal(2),
			z.literal(3),
			z.literal(4),
			z.literal(5),
		])
		.optional(),
});

const jobFormSchema = z.object({
	title: z.string().min(2).max(200),
	description: z.string().min(20).max(8000),
	location: z.string().max(120).optional(),
	remotePolicy: z.enum(["onsite", "hybrid", "remote"]).default("hybrid"),
	employmentType: z
		.enum(["fulltime", "parttime", "contract", "internship"])
		.default("fulltime"),
	salaryMin: z.coerce.number().int().min(0).max(1_000_000).optional(),
	salaryMax: z.coerce.number().int().min(0).max(1_000_000).optional(),
	yearsExperienceMin: z.coerce.number().int().min(0).max(40).default(0),
	languages: z.array(z.string()).optional(),
	requirements: z.array(requirementSchema).optional(),
	status: z.enum(["draft", "published", "archived"]).default("draft"),
});

async function requireEmployerSession() {
	const session = await auth();
	if (!session?.user?.id) throw new Error("unauthenticated");
	const userId = session.user.id;

	const [user] = await db
		.select({ tenantId: users.tenantId, role: users.role })
		.from(users)
		.where(eq(users.id, userId))
		.limit(1);
	if (!user) throw new Error("user not found");
	if (user.role !== "employer") {
		throw new Error("forbidden: not an employer");
	}
	if (!user.tenantId) throw new Error("user not assigned to a tenant");

	return { userId, tenantId: user.tenantId };
}

export async function ensureEmployer(companyName: string): Promise<Employer> {
	const { userId, tenantId } = await requireEmployerSession();

	const [existing] = await db
		.select()
		.from(employers)
		.where(eq(employers.userId, userId))
		.limit(1);
	if (existing) return existing;

	const [created] = await db
		.insert(employers)
		.values({ userId, tenantId, companyName })
		.returning();
	return created;
}

export async function getEmployer(): Promise<Employer | null> {
	const session = await auth();
	if (!session?.user?.id) return null;
	const [e] = await db
		.select()
		.from(employers)
		.where(eq(employers.userId, session.user.id))
		.limit(1);
	return e ?? null;
}

export async function listJobs(): Promise<Job[]> {
	const e = await getEmployer();
	if (!e) return [];
	return db
		.select()
		.from(jobs)
		.where(eq(jobs.employerId, e.id))
		.orderBy(desc(jobs.updatedAt));
}

export async function getJob(id: string): Promise<Job | null> {
	const e = await getEmployer();
	if (!e) return null;
	const [j] = await db
		.select()
		.from(jobs)
		.where(and(eq(jobs.id, id), eq(jobs.employerId, e.id)))
		.limit(1);
	return j ?? null;
}

export async function saveJob(
	id: string | null,
	formData: FormData,
): Promise<{ id: string }> {
	await requireEmployerSession();
	const e = await getEmployer();
	if (!e) {
		throw new Error("Set up your company first via ensureEmployer()");
	}

	const raw = {
		title: formData.get("title")?.toString() ?? "",
		description: formData.get("description")?.toString() ?? "",
		location: formData.get("location")?.toString() || undefined,
		remotePolicy: formData.get("remotePolicy")?.toString() ?? "hybrid",
		employmentType: formData.get("employmentType")?.toString() ?? "fulltime",
		salaryMin: formData.get("salaryMin")?.toString() || undefined,
		salaryMax: formData.get("salaryMax")?.toString() || undefined,
		yearsExperienceMin:
			formData.get("yearsExperienceMin")?.toString() || undefined,
		languages: parseList(formData.get("languages")?.toString() ?? ""),
		requirements: tryParseRequirements(
			formData.get("requirements")?.toString(),
		),
		status: formData.get("status")?.toString() ?? "draft",
	};
	const data = jobFormSchema.parse(raw);

	if (id) {
		const [existing] = await db
			.select({ id: jobs.id })
			.from(jobs)
			.where(and(eq(jobs.id, id), eq(jobs.employerId, e.id)))
			.limit(1);
		if (!existing) throw new Error("not found");
		await db
			.update(jobs)
			.set({ ...data, updatedAt: new Date() })
			.where(eq(jobs.id, id));
		revalidatePath("/jobs");
		revalidatePath(`/jobs/${id}`);
		if (data.status === "published") {
			after(() => computeMatchesForJob(id));
		}
		return { id };
	}
	const [created] = await db
		.insert(jobs)
		.values({ employerId: e.id, ...data })
		.returning({ id: jobs.id });
	revalidatePath("/jobs");
	if (data.status === "published") {
		after(() => computeMatchesForJob(created.id));
	}
	return { id: created.id };
}

export async function deleteJob(id: string): Promise<void> {
	await requireEmployerSession();
	const e = await getEmployer();
	if (!e) return;
	await db.delete(jobs).where(and(eq(jobs.id, id), eq(jobs.employerId, e.id)));
	revalidatePath("/jobs");
}

export async function suggestRequirements(input: {
	title: string;
	description: string;
}): Promise<SuggestedJobRequirement[]> {
	if (!input.title.trim() || input.description.trim().length < 20) {
		return [];
	}
	return getAIProvider().suggestJobRequirements(input);
}

function parseList(raw: string): string[] {
	return raw
		.split(",")
		.map((s) => s.trim())
		.filter(Boolean);
}

function tryParseRequirements(raw: string | undefined): JobRequirement[] {
	if (!raw) return [];
	try {
		const v = JSON.parse(raw);
		return Array.isArray(v) ? (v as JobRequirement[]) : [];
	} catch {
		return [];
	}
}
