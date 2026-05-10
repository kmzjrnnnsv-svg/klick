"use server";

import { and, desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { z } from "zod";
import { computeMatchesForJob } from "@/app/actions/matches";
import {
	ensureDefaultTemplate,
	instantiateJobStages,
} from "@/app/actions/templates";
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
import { geocode } from "@/lib/geo/geocode";

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
	teamSize: z.coerce.number().int().min(0).max(100000).optional(),
	growthStage: z
		.enum([
			"pre_seed",
			"seed",
			"series_a",
			"series_b",
			"series_c_plus",
			"profitable",
			"public",
			"non_profit",
			"agency",
		])
		.optional(),
	techStackDetail: z.string().max(2000).optional(),
	decisionProcess: z.string().max(1000).optional(),
	remoteOnsiteRatio: z.coerce.number().int().min(0).max(100).optional(),
	mustReasoning: z.string().max(1500).optional(),
	first90DaysGoals: z.string().max(2000).optional(),
	templateId: z.string().optional(),
	honestPostingFlag: z
		.enum(["open", "internal_preferred", "compliance_only"])
		.default("open"),
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

// Onboarding-form action — full employer create/update + advance the wizard.
// Covers Headhunter (isAgency=true) since the table is shared.
export async function saveEmployerOnboarding(
	formData: FormData,
): Promise<void> {
	const { userId, tenantId } = await requireEmployerSession();

	const companyName = String(formData.get("companyName") ?? "").trim();
	if (!companyName) throw new Error("Bitte einen Firmennamen angeben.");
	const websiteRaw = String(formData.get("website") ?? "").trim();
	const description = String(formData.get("description") ?? "").trim() || null;
	const isAgency = formData.get("isAgency") === "on";

	let website: string | null = null;
	if (websiteRaw) {
		try {
			const u = new URL(
				websiteRaw.startsWith("http") ? websiteRaw : `https://${websiteRaw}`,
			);
			website = u.toString().replace(/\/$/, "");
		} catch {
			throw new Error("Website ist keine gültige URL.");
		}
	}

	const values = {
		userId,
		tenantId,
		companyName,
		website,
		description,
		isAgency,
	};

	await db.insert(employers).values(values).onConflictDoUpdate({
		target: employers.userId,
		set: { companyName, website, description, isAgency },
	});

	revalidatePath("/jobs");
	redirect("/onboarding/employer/done");
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

// Employer-Self-Service: Eigene Firmen-Daten bearbeiten. Anders als das
// Onboarding-Form (das beim ersten Login durchläuft) ist das die Edit-
// Variante, die jederzeit erreichbar ist.
export async function updateOwnEmployer(
	formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
	try {
		const { userId } = await requireEmployerSession();
		const [own] = await db
			.select()
			.from(employers)
			.where(eq(employers.userId, userId))
			.limit(1);
		if (!own) return { ok: false, error: "Kein Unternehmen — erst onboarden." };

		const companyName = String(formData.get("companyName") ?? "").trim();
		if (!companyName) return { ok: false, error: "Bitte einen Firmennamen." };
		const websiteRaw = String(formData.get("website") ?? "").trim();
		const description =
			String(formData.get("description") ?? "").trim() || null;
		const isAgency = formData.get("isAgency") === "on";

		let website: string | null = null;
		if (websiteRaw) {
			try {
				const u = new URL(
					websiteRaw.startsWith("http") ? websiteRaw : `https://${websiteRaw}`,
				);
				website = u.toString().replace(/\/$/, "");
			} catch {
				return { ok: false, error: "Website ist keine gültige URL." };
			}
		}

		await db
			.update(employers)
			.set({ companyName, website, description, isAgency })
			.where(eq(employers.id, own.id));

		revalidatePath("/agency/profile");
		revalidatePath("/jobs");
		revalidatePath(`/c/${own.id}`);
		return { ok: true };
	} catch (e) {
		return {
			ok: false,
			error: e instanceof Error ? e.message : "fehlgeschlagen",
		};
	}
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
		teamSize: formData.get("teamSize")?.toString() || undefined,
		growthStage: formData.get("growthStage")?.toString() || undefined,
		techStackDetail: formData.get("techStackDetail")?.toString() || undefined,
		decisionProcess: formData.get("decisionProcess")?.toString() || undefined,
		remoteOnsiteRatio:
			formData.get("remoteOnsiteRatio")?.toString() || undefined,
		mustReasoning: formData.get("mustReasoning")?.toString() || undefined,
		first90DaysGoals: formData.get("first90DaysGoals")?.toString() || undefined,
		templateId: formData.get("templateId")?.toString() || undefined,
		honestPostingFlag: formData.get("honestPostingFlag")?.toString() || "open",
	};
	const data = jobFormSchema.parse(raw);

	// EU Pay Transparency Directive (Juni 2026): Gehaltsband ist Pflicht
	// in jedem Posting. Wir zwingen auch beim Speichern als Draft nicht,
	// aber beim Veröffentlichen blockieren wir.
	if (data.status === "published") {
		if (!data.salaryMin || !data.salaryMax) {
			throw new Error(
				"Gehaltsband (Min + Max) ist Pflicht beim Veröffentlichen — die EU Pay Transparency Directive ab Juni 2026 verlangt das. Speicher die Stelle als Entwurf, oder ergänze das Gehalt.",
			);
		}
		if (data.salaryMin > data.salaryMax) {
			throw new Error("Salary-Min darf nicht über Salary-Max liegen.");
		}
	}

	// Geocode the job location for commute matching. Remote-only postings
	// keep null lat/lng — the engine treats commute as N/A then.
	const geo =
		data.location && data.remotePolicy !== "remote"
			? await geocode(data.location)
			: null;

	// AI salary benchmark — best-effort, swallowed on failure so a flaky
	// model call doesn't block the save.
	let benchmark: { low: number; high: number } | null = null;
	let salaryFairness: "under" | "fair" | "over" | null = null;
	let salaryDeltaPct: number | null = null;
	try {
		const ai = getAIProvider();
		const bm = await ai.benchmarkSalary({
			title: data.title,
			description: data.description,
			location: data.location ?? null,
			yearsRequired: data.yearsExperienceMin ?? 0,
			level: undefined,
			requirements: (data.requirements ?? []).map((r) => r.name),
			remote: data.remotePolicy,
		});
		if (bm.low > 0 && bm.high > 0) {
			benchmark = { low: bm.low, high: bm.high };
			const declared = data.salaryMax ?? data.salaryMin ?? null;
			if (declared) {
				const mid = (bm.low + bm.high) / 2;
				const delta = ((declared - mid) / mid) * 100;
				salaryDeltaPct = Math.round(delta);
				salaryFairness = delta >= 5 ? "over" : delta <= -5 ? "under" : "fair";
			}
		}
	} catch (e) {
		console.warn("[salary] benchmark failed", e);
	}

	// Job-Posting-Quality — best-effort, swallowed on failure.
	let postingQuality: unknown = null;
	try {
		const ai = getAIProvider();
		postingQuality = await ai.assessJobPostingQuality({
			title: data.title,
			description: data.description,
			requirements: (data.requirements ?? []).map((r) => ({
				name: r.name,
				weight: r.weight,
			})),
			salaryMin: data.salaryMin ?? null,
			salaryMax: data.salaryMax ?? null,
			remotePolicy: data.remotePolicy,
		});
	} catch (e) {
		console.warn("[quality] assessment failed", e);
	}

	const dataWithGeo = {
		...data,
		locationLat: geo?.lat ?? null,
		locationLng: geo?.lng ?? null,
		salaryBenchmarkLow: benchmark?.low ?? null,
		salaryBenchmarkHigh: benchmark?.high ?? null,
		salaryFairness,
		salaryDeltaPct,
		postingQuality,
	};

	// Template-Vorbelegung: wenn keins gewählt, Standard-Template anlegen
	// und auswählen. So bekommt jede Stelle Stages, ohne dass der
	// Arbeitgeber sich initial darum kümmern muss.
	let templateId: string | null = data.templateId ?? null;
	if (!templateId) {
		templateId = await ensureDefaultTemplate(e.id).catch(() => null);
	}

	const valuesWithTemplate = {
		...dataWithGeo,
		templateId,
		honestPostingFlag: data.honestPostingFlag,
	};

	if (id) {
		const [existing] = await db
			.select({ id: jobs.id })
			.from(jobs)
			.where(and(eq(jobs.id, id), eq(jobs.employerId, e.id)))
			.limit(1);
		if (!existing) throw new Error("not found");
		await db
			.update(jobs)
			.set({ ...valuesWithTemplate, updatedAt: new Date() })
			.where(eq(jobs.id, id));
		revalidatePath("/jobs");
		revalidatePath(`/jobs/${id}`);
		if (data.status === "published") {
			if (templateId) {
				await instantiateJobStages(id, templateId).catch((err) => {
					console.warn("[jobs] stage instantiate failed", err);
				});
			}
			after(() => computeMatchesForJob(id));
		}
		return { id };
	}
	const [created] = await db
		.insert(jobs)
		.values({ employerId: e.id, ...valuesWithTemplate })
		.returning({ id: jobs.id });
	revalidatePath("/jobs");
	if (data.status === "published") {
		if (templateId) {
			await instantiateJobStages(created.id, templateId).catch((err) => {
				console.warn("[jobs] stage instantiate failed", err);
			});
		}
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

// Dupliziert eine Stelle inkl. Anforderungen/Sprachen/Salary etc., setzt
// status auf "draft" und hängt " (Kopie)" an den Titel.
export async function duplicateJob(
	id: string,
): Promise<{ ok: true; jobId: string } | { ok: false; error: string }> {
	try {
		await requireEmployerSession();
		const e = await getEmployer();
		if (!e) return { ok: false, error: "Kein Employer-Kontext." };
		const [src] = await db
			.select()
			.from(jobs)
			.where(and(eq(jobs.id, id), eq(jobs.employerId, e.id)))
			.limit(1);
		if (!src) return { ok: false, error: "Stelle nicht gefunden." };
		// biome-ignore lint/correctness/noUnusedVariables: explizit auspacken
		const { id: _id, createdAt: _c, updatedAt: _u, status: _s, ...rest } = src;
		const [created] = await db
			.insert(jobs)
			.values({
				...rest,
				title: `${src.title} (Kopie)`,
				status: "draft",
			})
			.returning({ id: jobs.id });
		revalidatePath("/jobs");
		return { ok: true, jobId: created.id };
	} catch (err) {
		return {
			ok: false,
			error: err instanceof Error ? err.message : "fehlgeschlagen",
		};
	}
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

// Reads a job posting (PDF / image), extracts structured fields via AI.
// Caller pre-fills the JobForm with the result and lets the user review.
// Throws on unauthorized access or unsupported file type.
export async function parseJobPostingFromUpload(formData: FormData) {
	await requireEmployerSession();
	const file = formData.get("file");
	if (!(file instanceof File) || file.size === 0) {
		throw new Error("Bitte eine Datei hochladen.");
	}
	const mime = file.type || "application/octet-stream";
	const supported =
		mime === "application/pdf" ||
		mime === "image/jpeg" ||
		mime === "image/png" ||
		mime === "image/gif" ||
		mime === "image/webp";
	if (!supported) {
		throw new Error("Nur PDF- und Bild-Dateien werden unterstützt.");
	}
	const bytes = new Uint8Array(await file.arrayBuffer());
	return getAIProvider().extractJobPosting(bytes, mime);
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
