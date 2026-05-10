"use server";

import { and, asc, desc, eq, gte, ilike, isNotNull, or, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { db } from "@/db";
import {
	type AuditLogEntry,
	applications,
	auditLog,
	candidateProfiles,
	type Employer,
	employers,
	hiringProcessTemplates,
	interests,
	jobs,
	matches,
	offers,
	templateStages,
	tenants,
	type User,
	users,
	verifications,
} from "@/db/schema";

async function requireAdmin() {
	const session = await auth();
	if (!session?.user?.id) throw new Error("unauthenticated");
	const [user] = await db
		.select({ role: users.role })
		.from(users)
		.where(eq(users.id, session.user.id))
		.limit(1);
	if (user?.role !== "admin") throw new Error("forbidden");
	return session.user.id;
}

export type AuditFilters = {
	action?: string;
	q?: string; // free-text over target
	since?: "1h" | "24h" | "7d" | "30d";
};

export async function listAuditEntries(
	filters: AuditFilters = {},
	limit = 200,
): Promise<AuditLogEntry[]> {
	await requireAdmin();
	const conds = [];
	if (filters.action) conds.push(eq(auditLog.action, filters.action));
	if (filters.q) conds.push(ilike(auditLog.target, `%${filters.q}%`));
	if (filters.since) {
		const ms: Record<string, number> = {
			"1h": 60 * 60 * 1000,
			"24h": 24 * 60 * 60 * 1000,
			"7d": 7 * 24 * 60 * 60 * 1000,
			"30d": 30 * 24 * 60 * 60 * 1000,
		};
		conds.push(gte(auditLog.at, new Date(Date.now() - ms[filters.since])));
	}
	return db
		.select()
		.from(auditLog)
		.where(conds.length > 0 ? and(...conds) : undefined)
		.orderBy(desc(auditLog.at))
		.limit(limit);
}

export async function listAuditActions(): Promise<string[]> {
	await requireAdmin();
	const rows = await db
		.select({ action: auditLog.action, n: sql<number>`count(*)`.as("n") })
		.from(auditLog)
		.groupBy(auditLog.action)
		.orderBy(desc(sql<number>`count(*)`));
	return rows.map((r) => r.action);
}

// ─── Plattform-Stats ─────────────────────────────────────────────────────
export type PlatformStats = {
	users: {
		total: number;
		candidates: number;
		employers: number;
		admins: number;
	};
	companies: number;
	jobs: { total: number; published: number };
	applications: { total: number; open: number };
	tenants: number;
};

export async function getPlatformStats(): Promise<PlatformStats> {
	await requireAdmin();
	const empty: PlatformStats = {
		users: { total: 0, candidates: 0, employers: 0, admins: 0 },
		companies: 0,
		jobs: { total: 0, published: 0 },
		applications: { total: 0, open: 0 },
		tenants: 0,
	};
	try {
		const userRows = await db
			.select({
				role: users.role,
				n: sql<number>`count(*)::int`.as("n"),
			})
			.from(users)
			.groupBy(users.role);
		const userStats = userRows.reduce(
			(acc, r) => {
				const n = Number(r.n);
				acc.total += n;
				if (r.role === "candidate") acc.candidates = n;
				if (r.role === "employer") acc.employers = n;
				if (r.role === "admin") acc.admins = n;
				return acc;
			},
			{ total: 0, candidates: 0, employers: 0, admins: 0 },
		);

		const [{ n: companies }] = await db
			.select({ n: sql<number>`count(*)::int`.as("n") })
			.from(employers);

		const jobRows = await db
			.select({
				status: jobs.status,
				n: sql<number>`count(*)::int`.as("n"),
			})
			.from(jobs)
			.groupBy(jobs.status);
		const jobStats = jobRows.reduce(
			(acc, r) => {
				const n = Number(r.n);
				acc.total += n;
				if (r.status === "published") acc.published = n;
				return acc;
			},
			{ total: 0, published: 0 },
		);

		const [{ n: appsTotal }] = await db
			.select({ n: sql<number>`count(*)::int`.as("n") })
			.from(applications)
			.catch(() => [{ n: 0 }]);
		const [{ n: appsOpen }] = await db
			.select({ n: sql<number>`count(*)::int`.as("n") })
			.from(applications)
			.where(sql`status NOT IN ('declined','withdrawn','archived','offer')`)
			.catch(() => [{ n: 0 }]);

		const [{ n: tenantCount }] = await db
			.select({ n: sql<number>`count(*)::int`.as("n") })
			.from(tenants);

		return {
			users: userStats,
			companies: Number(companies ?? 0),
			jobs: jobStats,
			applications: {
				total: Number(appsTotal ?? 0),
				open: Number(appsOpen ?? 0),
			},
			tenants: Number(tenantCount ?? 0),
		};
	} catch (e) {
		console.warn("[admin] getPlatformStats", e);
		return empty;
	}
}

// ─── User-Verwaltung ─────────────────────────────────────────────────────
export type AdminUserRow = User & { tenantSlug: string | null };

export async function listAllUsers(input: {
	role?: "candidate" | "employer" | "admin";
	q?: string;
	limit?: number;
}): Promise<AdminUserRow[]> {
	await requireAdmin();
	const conds = [];
	if (input.role) conds.push(eq(users.role, input.role));
	if (input.q && input.q.trim().length > 0) {
		const like = `%${input.q.trim()}%`;
		conds.push(or(ilike(users.email, like), ilike(users.name, like)));
	}
	const rows = await db
		.select({
			user: users,
			tenantSlug: tenants.slug,
		})
		.from(users)
		.leftJoin(tenants, eq(tenants.id, users.tenantId))
		.where(conds.length > 0 ? and(...conds) : undefined)
		.orderBy(desc(users.createdAt))
		.limit(input.limit ?? 100);
	return rows.map((r) => ({ ...r.user, tenantSlug: r.tenantSlug }));
}

export async function createUserAsAdmin(input: {
	email: string;
	role: "candidate" | "employer" | "admin";
	name?: string;
	locale?: "de" | "en";
	tenantSlug?: string;
}): Promise<{ ok: true; userId: string } | { ok: false; error: string }> {
	try {
		const actorId = await requireAdmin();
		const email = input.email.trim().toLowerCase();
		if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
			return { ok: false, error: "Bitte eine gültige E-Mail-Adresse." };
		}
		const [existing] = await db
			.select({ id: users.id })
			.from(users)
			.where(eq(users.email, email))
			.limit(1);
		if (existing) {
			return { ok: false, error: "User mit dieser E-Mail existiert bereits." };
		}

		const tenantSlug = input.tenantSlug?.trim() || "default";
		const [tenant] = await db
			.select({ id: tenants.id })
			.from(tenants)
			.where(eq(tenants.slug, tenantSlug))
			.limit(1);
		if (!tenant) {
			return {
				ok: false,
				error: `Tenant "${tenantSlug}" nicht gefunden. Lege ihn unter /admin an.`,
			};
		}

		const [created] = await db
			.insert(users)
			.values({
				email,
				name: input.name?.trim() || null,
				role: input.role,
				locale: input.locale ?? "de",
				tenantId: tenant.id,
			})
			.returning({ id: users.id });

		await db.insert(auditLog).values({
			tenantId: tenant.id,
			actorUserId: actorId,
			action: "admin.create_user",
			target: created.id,
			payload: { email, role: input.role },
		});

		revalidatePath("/admin/users");
		return { ok: true, userId: created.id };
	} catch (e) {
		console.error("[admin] createUserAsAdmin", e);
		return {
			ok: false,
			error: e instanceof Error ? e.message : "fehlgeschlagen",
		};
	}
}

export async function setUserRoleAsAdmin(input: {
	userId: string;
	role: "candidate" | "employer" | "admin";
}): Promise<{ ok: boolean; error?: string }> {
	try {
		const actorId = await requireAdmin();
		if (input.userId === actorId) {
			return {
				ok: false,
				error: "Eigene Rolle kannst du nicht ändern (Sicherheits-Lock).",
			};
		}
		const [target] = await db
			.select({ id: users.id, tenantId: users.tenantId })
			.from(users)
			.where(eq(users.id, input.userId))
			.limit(1);
		if (!target) return { ok: false, error: "User nicht gefunden." };

		await db
			.update(users)
			.set({ role: input.role })
			.where(eq(users.id, input.userId));
		await db.insert(auditLog).values({
			tenantId: target.tenantId,
			actorUserId: actorId,
			action: "admin.set_role",
			target: input.userId,
			payload: { role: input.role },
		});
		revalidatePath("/admin/users");
		return { ok: true };
	} catch (e) {
		return {
			ok: false,
			error: e instanceof Error ? e.message : "fehlgeschlagen",
		};
	}
}

// ─── Unternehmens-Verwaltung ─────────────────────────────────────────────
export type AdminCompanyRow = Employer & {
	ownerEmail: string | null;
	ownerName: string | null;
	tenantSlug: string | null;
	jobCount: number;
	publishedCount: number;
};

export async function listAllCompanies(input: {
	q?: string;
}): Promise<AdminCompanyRow[]> {
	await requireAdmin();
	const conds = [];
	if (input.q && input.q.trim().length > 0) {
		const like = `%${input.q.trim()}%`;
		conds.push(
			or(
				ilike(employers.companyName, like),
				ilike(users.email, like),
				ilike(users.name, like),
			),
		);
	}
	const rows = await db
		.select({
			employer: employers,
			ownerEmail: users.email,
			ownerName: users.name,
			tenantSlug: tenants.slug,
			jobCount: sql<number>`(
				SELECT COUNT(*)::int FROM jobs WHERE jobs.employer_id = ${employers.id}
			)`.as("job_count"),
			publishedCount: sql<number>`(
				SELECT COUNT(*)::int FROM jobs
				WHERE jobs.employer_id = ${employers.id}
				AND jobs.status = 'published'
			)`.as("published_count"),
		})
		.from(employers)
		.leftJoin(users, eq(users.id, employers.userId))
		.leftJoin(tenants, eq(tenants.id, employers.tenantId))
		.where(conds.length > 0 ? and(...conds) : undefined)
		.orderBy(desc(employers.createdAt));
	return rows.map((r) => ({
		...r.employer,
		ownerEmail: r.ownerEmail,
		ownerName: r.ownerName,
		tenantSlug: r.tenantSlug,
		jobCount: Number(r.jobCount ?? 0),
		publishedCount: Number(r.publishedCount ?? 0),
	}));
}

export async function createCompanyAsAdmin(input: {
	companyName: string;
	ownerEmail: string;
	ownerName?: string;
	website?: string;
	description?: string;
	isAgency?: boolean;
	tenantSlug?: string;
}): Promise<{ ok: true; employerId: string } | { ok: false; error: string }> {
	try {
		const actorId = await requireAdmin();
		const companyName = input.companyName.trim();
		if (!companyName) return { ok: false, error: "Bitte einen Firmennamen." };
		const email = input.ownerEmail.trim().toLowerCase();
		if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
			return { ok: false, error: "Bitte eine gültige E-Mail-Adresse." };
		}

		let website: string | null = null;
		if (input.website?.trim()) {
			try {
				const u = new URL(
					input.website.startsWith("http")
						? input.website
						: `https://${input.website}`,
				);
				website = u.toString().replace(/\/$/, "");
			} catch {
				return { ok: false, error: "Website ist keine gültige URL." };
			}
		}

		const tenantSlug = input.tenantSlug?.trim() || "default";
		const [tenant] = await db
			.select({ id: tenants.id })
			.from(tenants)
			.where(eq(tenants.slug, tenantSlug))
			.limit(1);
		if (!tenant) {
			return {
				ok: false,
				error: `Tenant "${tenantSlug}" nicht gefunden.`,
			};
		}

		// Owner-User: existieren oder neu anlegen.
		let [owner] = await db
			.select({
				id: users.id,
				role: users.role,
				tenantId: users.tenantId,
			})
			.from(users)
			.where(eq(users.email, email))
			.limit(1);
		if (!owner) {
			const [created] = await db
				.insert(users)
				.values({
					email,
					name: input.ownerName?.trim() || null,
					role: "employer",
					tenantId: tenant.id,
					locale: "de",
				})
				.returning({
					id: users.id,
					role: users.role,
					tenantId: users.tenantId,
				});
			owner = created;
		} else if (owner.role === "candidate") {
			// Bestehenden Kandidat:in zum Employer machen — Audit-trail dazu.
			await db
				.update(users)
				.set({ role: "employer" })
				.where(eq(users.id, owner.id));
			owner.role = "employer";
		}

		// Wenn der User schon eine andere Firma hat, blockieren wir.
		const [existingEmployer] = await db
			.select({ id: employers.id })
			.from(employers)
			.where(eq(employers.userId, owner.id))
			.limit(1);
		if (existingEmployer) {
			return {
				ok: false,
				error: "User hat bereits ein Unternehmen. Bearbeiten statt anlegen.",
			};
		}

		const [employer] = await db
			.insert(employers)
			.values({
				userId: owner.id,
				tenantId: tenant.id,
				companyName,
				website,
				description: input.description?.trim() || null,
				isAgency: input.isAgency ?? false,
			})
			.returning({ id: employers.id });

		await db.insert(auditLog).values({
			tenantId: tenant.id,
			actorUserId: actorId,
			action: "admin.create_company",
			target: employer.id,
			payload: { companyName, ownerEmail: email },
		});

		revalidatePath("/admin/companies");
		return { ok: true, employerId: employer.id };
	} catch (e) {
		console.error("[admin] createCompanyAsAdmin", e);
		return {
			ok: false,
			error: e instanceof Error ? e.message : "fehlgeschlagen",
		};
	}
}

export async function updateCompanyAsAdmin(input: {
	employerId: string;
	companyName?: string;
	website?: string | null;
	description?: string | null;
	isAgency?: boolean;
}): Promise<{ ok: boolean; error?: string }> {
	try {
		const actorId = await requireAdmin();
		const [emp] = await db
			.select()
			.from(employers)
			.where(eq(employers.id, input.employerId))
			.limit(1);
		if (!emp) return { ok: false, error: "Unternehmen nicht gefunden." };

		let website: string | null | undefined = input.website;
		if (typeof input.website === "string" && input.website.trim()) {
			try {
				const u = new URL(
					input.website.startsWith("http")
						? input.website
						: `https://${input.website}`,
				);
				website = u.toString().replace(/\/$/, "");
			} catch {
				return { ok: false, error: "Website ist keine gültige URL." };
			}
		} else if (input.website === "") {
			website = null;
		}

		await db
			.update(employers)
			.set({
				companyName: input.companyName?.trim() || emp.companyName,
				website: website ?? emp.website,
				description:
					input.description !== undefined ? input.description : emp.description,
				isAgency: input.isAgency ?? emp.isAgency,
			})
			.where(eq(employers.id, input.employerId));

		await db.insert(auditLog).values({
			tenantId: emp.tenantId,
			actorUserId: actorId,
			action: "admin.update_company",
			target: input.employerId,
			payload: input,
		});
		revalidatePath(`/admin/companies/${input.employerId}`);
		revalidatePath("/admin/companies");
		return { ok: true };
	} catch (e) {
		return {
			ok: false,
			error: e instanceof Error ? e.message : "fehlgeschlagen",
		};
	}
}

export type AdminCompanyDetail = {
	employer: Employer;
	owner: { email: string; name: string | null; userId: string } | null;
	tenantSlug: string | null;
	jobs: Array<{
		id: string;
		title: string;
		status: string;
		createdAt: Date;
		applicationCount: number;
	}>;
	applicationsTotal: number;
	templatesCount: number;
};

export async function getCompanyDetail(
	employerId: string,
): Promise<AdminCompanyDetail | null> {
	await requireAdmin();
	const [row] = await db
		.select({
			employer: employers,
			ownerEmail: users.email,
			ownerName: users.name,
			ownerId: users.id,
			tenantSlug: tenants.slug,
		})
		.from(employers)
		.leftJoin(users, eq(users.id, employers.userId))
		.leftJoin(tenants, eq(tenants.id, employers.tenantId))
		.where(eq(employers.id, employerId))
		.limit(1);
	if (!row) return null;

	const jobRows = await db
		.select({
			id: jobs.id,
			title: jobs.title,
			status: jobs.status,
			createdAt: jobs.createdAt,
			applicationCount: sql<number>`(
				SELECT COUNT(*)::int FROM applications WHERE applications.job_id = ${jobs.id}
			)`.as("application_count"),
		})
		.from(jobs)
		.where(eq(jobs.employerId, employerId))
		.orderBy(desc(jobs.createdAt));

	const [appsAgg] = await db
		.select({ n: sql<number>`count(*)::int`.as("n") })
		.from(applications)
		.where(eq(applications.employerId, employerId))
		.catch(() => [{ n: 0 }]);

	const [templatesAgg] = await db
		.select({ n: sql<number>`count(*)::int`.as("n") })
		.from(hiringProcessTemplates)
		.where(eq(hiringProcessTemplates.employerId, employerId))
		.catch(() => [{ n: 0 }]);

	return {
		employer: row.employer,
		owner:
			row.ownerId && row.ownerEmail
				? { email: row.ownerEmail, name: row.ownerName, userId: row.ownerId }
				: null,
		tenantSlug: row.tenantSlug,
		jobs: jobRows.map((j) => ({
			id: j.id,
			title: j.title,
			status: j.status,
			createdAt: j.createdAt,
			applicationCount: Number(j.applicationCount ?? 0),
		})),
		applicationsTotal: Number(appsAgg?.n ?? 0),
		templatesCount: Number(templatesAgg?.n ?? 0),
	};
}

// ─── Plattform-weite Templates ───────────────────────────────────────────
export type AdminTemplateRow = {
	template: typeof hiringProcessTemplates.$inferSelect;
	employerId: string;
	companyName: string;
	stagesCount: number;
};

export async function listAllTemplates(): Promise<AdminTemplateRow[]> {
	await requireAdmin();
	try {
		const rows = await db
			.select({
				template: hiringProcessTemplates,
				companyName: employers.companyName,
				employerId: employers.id,
				stagesCount: sql<number>`(
					SELECT COUNT(*)::int FROM template_stages
					WHERE template_stages.template_id = ${hiringProcessTemplates.id}
				)`.as("stages_count"),
			})
			.from(hiringProcessTemplates)
			.leftJoin(employers, eq(employers.id, hiringProcessTemplates.employerId))
			.orderBy(asc(employers.companyName), asc(hiringProcessTemplates.name));
		return rows.map((r) => ({
			template: r.template,
			employerId: r.employerId ?? "",
			companyName: r.companyName ?? "(unbekannt)",
			stagesCount: Number(r.stagesCount ?? 0),
		}));
	} catch (e) {
		console.warn("[admin] listAllTemplates", e);
		return [];
	}
}

export async function getTemplateAsAdmin(templateId: string) {
	await requireAdmin();
	const [t] = await db
		.select({
			template: hiringProcessTemplates,
			companyName: employers.companyName,
		})
		.from(hiringProcessTemplates)
		.leftJoin(employers, eq(employers.id, hiringProcessTemplates.employerId))
		.where(eq(hiringProcessTemplates.id, templateId))
		.limit(1);
	if (!t) return null;
	const stages = await db
		.select()
		.from(templateStages)
		.where(eq(templateStages.templateId, templateId))
		.orderBy(asc(templateStages.position));
	return {
		template: t.template,
		companyName: t.companyName ?? "(unbekannt)",
		stages,
	};
}

// ─── Tenant-Liste (für Drop-Downs) ────────────────────────────────────────
export async function listTenants() {
	await requireAdmin();
	return db.select().from(tenants).orderBy(asc(tenants.slug));
}

// ─── Plattform-Analytics ─────────────────────────────────────────────────
// Zentrale Stelle für Tracking. Wird auf /admin/stats gerendert.
export type AdminAnalytics = {
	// Wachstum: 7d / 30d-Vergleich
	growth: {
		users7d: number;
		users30d: number;
		jobs7d: number;
		jobs30d: number;
		matches7d: number;
		matches30d: number;
	};
	// Funnel: Match → Interest → Approval → Offer → Acceptance
	funnel: {
		matches: number;
		interests: number;
		interestsApproved: number;
		interestsRejected: number;
		offers: number;
		offersAccepted: number;
		offersDeclined: number;
		offersPending: number;
	};
	// Konversions-Raten (Prozent)
	conversion: {
		matchToInterest: number;
		interestToApproval: number;
		approvalToOffer: number;
		offerToAccept: number;
	};
	// Antwort-Verhalten Arbeitnehmer (Kandidat:in entscheidet ein Interest)
	candidateResponse: {
		decided: number;
		pending: number;
		median_hours: number | null; // Median Zeit bis Entscheidung
	};
	// Antwort-Verhalten Arbeitgeber (Offer-Status nach 14 Tagen)
	employerResponse: {
		offersTotal: number;
		offersDecided: number;
		offersPending: number;
		median_hours: number | null;
	};
	// Top-Skills auf der Plattform (häufigste Kandidaten-Skills)
	topCandidateSkills: { name: string; n: number }[];
	// Top-Skills in Job-Anforderungen
	topJobSkills: { name: string; n: number }[];
	// Top-Standorte
	topLocations: { location: string; n: number }[];
	// Verifikations-Mix
	verifyMix: { kind: string; n: number }[];
	// Aktive Tenants (mind. 1 published Job)
	activeTenants: number;
	// Profil-Vollständigkeit (Anteil mit summary, skills, education, experience)
	profileCompleteness: {
		hasSummary: number;
		hasSkills: number;
		hasEducation: number;
		hasExperience: number;
		total: number;
	};
};

function pct(n: number, d: number): number {
	if (!d) return 0;
	return Math.round((n / d) * 1000) / 10;
}

// Median über positive number-Liste, oder null bei leer.
function medianHours(rows: { dt: number | null }[]): number | null {
	const xs = rows
		.map((r) => r.dt)
		.filter((x): x is number => x !== null && Number.isFinite(x))
		.sort((a, b) => a - b);
	if (xs.length === 0) return null;
	const mid = Math.floor(xs.length / 2);
	const m = xs.length % 2 === 0 ? (xs[mid - 1] + xs[mid]) / 2 : xs[mid];
	return Math.round(m * 10) / 10;
}

export async function getAdminAnalytics(): Promise<AdminAnalytics> {
	await requireAdmin();
	const empty: AdminAnalytics = {
		growth: {
			users7d: 0,
			users30d: 0,
			jobs7d: 0,
			jobs30d: 0,
			matches7d: 0,
			matches30d: 0,
		},
		funnel: {
			matches: 0,
			interests: 0,
			interestsApproved: 0,
			interestsRejected: 0,
			offers: 0,
			offersAccepted: 0,
			offersDeclined: 0,
			offersPending: 0,
		},
		conversion: {
			matchToInterest: 0,
			interestToApproval: 0,
			approvalToOffer: 0,
			offerToAccept: 0,
		},
		candidateResponse: { decided: 0, pending: 0, median_hours: null },
		employerResponse: {
			offersTotal: 0,
			offersDecided: 0,
			offersPending: 0,
			median_hours: null,
		},
		topCandidateSkills: [],
		topJobSkills: [],
		topLocations: [],
		verifyMix: [],
		activeTenants: 0,
		profileCompleteness: {
			hasSummary: 0,
			hasSkills: 0,
			hasEducation: 0,
			hasExperience: 0,
			total: 0,
		},
	};
	try {
		const now = Date.now();
		const since7 = new Date(now - 7 * 86400_000);
		const since30 = new Date(now - 30 * 86400_000);

		const cnt = async (
			query: ReturnType<typeof db.select>,
		): Promise<number> => {
			const r = await query;
			// biome-ignore lint/suspicious/noExplicitAny: dynamic count select
			return Number((r as any[])[0]?.n ?? 0);
		};

		const [users7d, users30d] = await Promise.all([
			cnt(
				db
					.select({ n: sql<number>`count(*)::int`.as("n") })
					.from(users)
					.where(gte(users.createdAt, since7)),
			),
			cnt(
				db
					.select({ n: sql<number>`count(*)::int`.as("n") })
					.from(users)
					.where(gte(users.createdAt, since30)),
			),
		]);
		const [jobs7d, jobs30d] = await Promise.all([
			cnt(
				db
					.select({ n: sql<number>`count(*)::int`.as("n") })
					.from(jobs)
					.where(gte(jobs.createdAt, since7)),
			),
			cnt(
				db
					.select({ n: sql<number>`count(*)::int`.as("n") })
					.from(jobs)
					.where(gte(jobs.createdAt, since30)),
			),
		]);
		const [matches7d, matches30d] = await Promise.all([
			cnt(
				db
					.select({ n: sql<number>`count(*)::int`.as("n") })
					.from(matches)
					.where(gte(matches.computedAt, since7)),
			),
			cnt(
				db
					.select({ n: sql<number>`count(*)::int`.as("n") })
					.from(matches)
					.where(gte(matches.computedAt, since30)),
			),
		]);

		const [matchesTotal, interestRows, offerRows] = await Promise.all([
			db
				.select({ n: sql<number>`count(*)::int`.as("n") })
				.from(matches)
				.then((rs) => Number(rs[0]?.n ?? 0)),
			db
				.select({
					status: interests.status,
					n: sql<number>`count(*)::int`.as("n"),
				})
				.from(interests)
				.groupBy(interests.status),
			db
				.select({
					status: offers.status,
					n: sql<number>`count(*)::int`.as("n"),
				})
				.from(offers)
				.groupBy(offers.status),
		]);

		const interestsByStatus = new Map(
			interestRows.map((r) => [r.status, Number(r.n)]),
		);
		const interestsTotal = interestRows.reduce(
			(a, r) => a + Number(r.n),
			0,
		);
		const offersByStatus = new Map(offerRows.map((r) => [r.status, Number(r.n)]));
		const offersTotal = offerRows.reduce((a, r) => a + Number(r.n), 0);

		const interestsApproved = interestsByStatus.get("approved") ?? 0;
		const interestsRejected = interestsByStatus.get("rejected") ?? 0;
		const offersAccepted = offersByStatus.get("accepted") ?? 0;
		const offersDeclined = offersByStatus.get("declined") ?? 0;
		const offersPending = offersByStatus.get("pending") ?? 0;

		const funnel = {
			matches: matchesTotal,
			interests: interestsTotal,
			interestsApproved,
			interestsRejected,
			offers: offersTotal,
			offersAccepted,
			offersDeclined,
			offersPending,
		};

		const conversion = {
			matchToInterest: pct(interestsTotal, matchesTotal),
			interestToApproval: pct(interestsApproved, interestsTotal),
			approvalToOffer: pct(offersTotal, interestsApproved),
			offerToAccept: pct(offersAccepted, offersTotal),
		};

		// Median candidate response time (interest.createdAt → decidedAt)
		const decidedInterests = await db
			.select({
				createdAt: interests.createdAt,
				decidedAt: interests.decidedAt,
			})
			.from(interests)
			.where(sql`${interests.decidedAt} IS NOT NULL`);
		const candidateResponse = {
			decided: decidedInterests.length,
			pending: interestsTotal - decidedInterests.length,
			median_hours: medianHours(
				decidedInterests.map((r) => ({
					dt:
						r.createdAt && r.decidedAt
							? (r.decidedAt.getTime() - r.createdAt.getTime()) / 3600_000
							: null,
				})),
			),
		};

		// Median employer response time (offer.createdAt → decidedAt)
		const decidedOffers = await db
			.select({
				createdAt: offers.createdAt,
				decidedAt: offers.decidedAt,
			})
			.from(offers)
			.where(sql`${offers.decidedAt} IS NOT NULL`)
			.catch(() => []);
		const employerResponse = {
			offersTotal,
			offersDecided: decidedOffers.length,
			offersPending: offersPending,
			median_hours: medianHours(
				decidedOffers.map((r) => ({
					dt:
						r.createdAt && r.decidedAt
							? (r.decidedAt.getTime() - r.createdAt.getTime()) / 3600_000
							: null,
				})),
			),
		};

		// Top candidate skills
		const candProfiles = await db
			.select({ skills: candidateProfiles.skills })
			.from(candidateProfiles);
		const candSkillCount = new Map<string, number>();
		for (const p of candProfiles) {
			for (const s of p.skills ?? []) {
				const key = s.name.trim();
				if (!key) continue;
				candSkillCount.set(key, (candSkillCount.get(key) ?? 0) + 1);
			}
		}
		const topCandidateSkills = [...candSkillCount.entries()]
			.sort((a, b) => b[1] - a[1])
			.slice(0, 12)
			.map(([name, n]) => ({ name, n }));

		// Top job skills
		const jobReqs = await db
			.select({ requirements: jobs.requirements })
			.from(jobs);
		const jobSkillCount = new Map<string, number>();
		for (const j of jobReqs) {
			for (const r of j.requirements ?? []) {
				const key = r.name.trim();
				if (!key) continue;
				jobSkillCount.set(key, (jobSkillCount.get(key) ?? 0) + 1);
			}
		}
		const topJobSkills = [...jobSkillCount.entries()]
			.sort((a, b) => b[1] - a[1])
			.slice(0, 12)
			.map(([name, n]) => ({ name, n }));

		// Top locations
		const locationsRaw = await db
			.select({
				location: candidateProfiles.location,
				n: sql<number>`count(*)::int`.as("n"),
			})
			.from(candidateProfiles)
			.where(sql`${candidateProfiles.location} IS NOT NULL`)
			.groupBy(candidateProfiles.location)
			.orderBy(desc(sql<number>`count(*)`))
			.limit(8);
		const topLocations = locationsRaw
			.filter((r) => !!r.location)
			.map((r) => ({ location: r.location as string, n: Number(r.n) }));

		// Verification mix
		const verifyRows = await db
			.select({
				kind: verifications.kind,
				n: sql<number>`count(*)::int`.as("n"),
			})
			.from(verifications)
			.groupBy(verifications.kind)
			.orderBy(desc(sql<number>`count(*)`))
			.catch(() => []);
		const verifyMix = verifyRows.map((r) => ({
			kind: r.kind,
			n: Number(r.n),
		}));

		// Active tenants — mindestens 1 published Job (via employers join)
		const activeRows = await db
			.select({ tenantId: employers.tenantId })
			.from(jobs)
			.innerJoin(employers, eq(employers.id, jobs.employerId))
			.where(eq(jobs.status, "published"))
			.groupBy(employers.tenantId);
		const activeTenants = activeRows.length;

		// Profile completeness
		const allProfiles = await db
			.select({
				summary: candidateProfiles.summary,
				skills: candidateProfiles.skills,
				education: candidateProfiles.education,
				experience: candidateProfiles.experience,
			})
			.from(candidateProfiles);
		const completeness = {
			hasSummary: allProfiles.filter(
				(p) => p.summary && p.summary.trim().length > 0,
			).length,
			hasSkills: allProfiles.filter((p) => (p.skills ?? []).length > 0).length,
			hasEducation: allProfiles.filter((p) => (p.education ?? []).length > 0)
				.length,
			hasExperience: allProfiles.filter((p) => (p.experience ?? []).length > 0)
				.length,
			total: allProfiles.length,
		};

		return {
			growth: {
				users7d,
				users30d,
				jobs7d,
				jobs30d,
				matches7d,
				matches30d,
			},
			funnel,
			conversion,
			candidateResponse,
			employerResponse,
			topCandidateSkills,
			topJobSkills,
			topLocations,
			verifyMix,
			activeTenants,
			profileCompleteness: completeness,
		};
	} catch (e) {
		console.warn("[admin] getAdminAnalytics", e);
		return empty;
	}
}

// ─── Block / Unblock / Delete ─────────────────────────────────────────────
// Sperren ist reversibel (blockedAt + Reason). Löschen ist irreversibel und
// cascadiert via FK-onDelete. Beides nur für Admins.

export async function blockUser(input: {
	userId: string;
	reason?: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
	const adminId = await requireAdmin();
	if (input.userId === adminId) {
		return { ok: false, error: "Du kannst dich nicht selbst sperren." };
	}
	await db
		.update(users)
		.set({ blockedAt: new Date(), blockedReason: input.reason ?? null })
		.where(eq(users.id, input.userId));
	await db.insert(auditLog).values({
		actorUserId: adminId,
		action: "user.block",
		target: input.userId,
		payload: { reason: input.reason ?? null },
	});
	revalidatePath("/admin/users");
	return { ok: true };
}

export async function unblockUser(
	userId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
	const adminId = await requireAdmin();
	await db
		.update(users)
		.set({ blockedAt: null, blockedReason: null })
		.where(eq(users.id, userId));
	await db.insert(auditLog).values({
		actorUserId: adminId,
		action: "user.unblock",
		target: userId,
	});
	revalidatePath("/admin/users");
	return { ok: true };
}

export async function deleteUser(
	userId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
	const adminId = await requireAdmin();
	if (userId === adminId) {
		return { ok: false, error: "Du kannst dich nicht selbst löschen." };
	}
	const [target] = await db
		.select({ email: users.email, role: users.role })
		.from(users)
		.where(eq(users.id, userId))
		.limit(1);
	if (!target) return { ok: false, error: "User nicht gefunden." };
	// FK-Cascade kümmert sich um candidateProfiles, employers, applications,
	// matches, interests, offers, etc. — alle hängen mit onDelete:'cascade'
	// am users.id. Audit-Log NICHT cascadiert (actorUserId hat kein onDelete).
	await db.delete(users).where(eq(users.id, userId));
	await db.insert(auditLog).values({
		actorUserId: adminId,
		action: "user.delete",
		target: userId,
		payload: { email: target.email, role: target.role },
	});
	revalidatePath("/admin/users");
	return { ok: true };
}

export async function blockEmployer(input: {
	employerId: string;
	reason?: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
	const adminId = await requireAdmin();
	await db
		.update(employers)
		.set({ blockedAt: new Date(), blockedReason: input.reason ?? null })
		.where(eq(employers.id, input.employerId));
	await db.insert(auditLog).values({
		actorUserId: adminId,
		action: "employer.block",
		target: input.employerId,
		payload: { reason: input.reason ?? null },
	});
	revalidatePath("/admin/companies");
	return { ok: true };
}

export async function unblockEmployer(
	employerId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
	const adminId = await requireAdmin();
	await db
		.update(employers)
		.set({ blockedAt: null, blockedReason: null })
		.where(eq(employers.id, employerId));
	await db.insert(auditLog).values({
		actorUserId: adminId,
		action: "employer.unblock",
		target: employerId,
	});
	revalidatePath("/admin/companies");
	return { ok: true };
}

export async function deleteEmployer(
	employerId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
	const adminId = await requireAdmin();
	const [target] = await db
		.select({ name: employers.companyName })
		.from(employers)
		.where(eq(employers.id, employerId))
		.limit(1);
	if (!target) return { ok: false, error: "Unternehmen nicht gefunden." };
	await db.delete(employers).where(eq(employers.id, employerId));
	await db.insert(auditLog).values({
		actorUserId: adminId,
		action: "employer.delete",
		target: employerId,
		payload: { companyName: target.name },
	});
	revalidatePath("/admin/companies");
	return { ok: true };
}

// ─── Demo-Daten-Generator + Purge ────────────────────────────────────────
// Erstellt eine Charge an Demo-Profilen und legt für jeden eine Bewerbung
// an. Alles bekommt eine demoBatchId — ein Admin-Klick reicht zum
// vollständigen Aufräumen.

const DEMO_FIRST = [
	"Anna",
	"Lukas",
	"Marie",
	"Felix",
	"Sophia",
	"Jonas",
	"Lena",
	"Tobias",
	"Hannah",
	"Julian",
	"Mia",
	"Niklas",
	"Emma",
	"Paul",
];
const DEMO_LAST = [
	"Müller",
	"Schmidt",
	"Becker",
	"Wagner",
	"Hoffmann",
	"Schulz",
	"Krause",
	"Werner",
	"Klein",
	"Wolf",
	"Neumann",
	"Schwarz",
];
const DEMO_HEADLINES = [
	"Senior Frontend Engineer",
	"Backend Engineer (Node.js)",
	"Product Designer",
	"Engineering Manager",
	"Data Engineer",
	"DevOps Engineer",
	"Mobile Engineer",
	"Growth Marketing Manager",
];
const DEMO_SKILLS = [
	"TypeScript",
	"React",
	"Next.js",
	"Node.js",
	"PostgreSQL",
	"Python",
	"AWS",
	"Kubernetes",
	"Tailwind CSS",
	"Figma",
	"GraphQL",
	"Go",
];
const DEMO_LOCATIONS = [
	"Berlin",
	"Hamburg",
	"München",
	"Köln",
	"Frankfurt",
	"Leipzig",
	"Wien",
	"Zürich",
];
const DEMO_INDUSTRIES = ["Fintech", "SaaS", "E-Commerce", "HealthTech", "Mobility"];

function pick<T>(arr: readonly T[], rng: () => number): T {
	return arr[Math.floor(rng() * arr.length)];
}

// Deterministisches RNG damit re-runs reproduzierbar sind (gleicher Seed
// = gleiche Demo-User, falls jemand in einem Loop testet).
function makeRng(seed: string): () => number {
	let h = 0;
	for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
	return () => {
		h = (h * 1103515245 + 12345) & 0x7fffffff;
		return h / 0x7fffffff;
	};
}

export type DemoGenResult = {
	ok: true;
	batchId: string;
	candidatesCreated: number;
	companyCreated: boolean;
	jobsCreated: number;
	applicationsCreated: number;
};

export async function generateDemoData(input: {
	candidates?: number;
	jobs?: number;
}): Promise<DemoGenResult | { ok: false; error: string }> {
	const adminId = await requireAdmin();
	const candidateCount = Math.min(Math.max(input.candidates ?? 8, 1), 50);
	const jobCount = Math.min(Math.max(input.jobs ?? 4, 0), 20);
	const batchId = `demo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
	const rng = makeRng(batchId);

	const [tenant] = await db
		.select({ id: tenants.id })
		.from(tenants)
		.where(eq(tenants.slug, "default"))
		.limit(1);
	if (!tenant) return { ok: false, error: "Default-Tenant nicht gefunden." };

	let candidatesCreated = 0;
	const createdUserIds: string[] = [];
	for (let i = 0; i < candidateCount; i++) {
		const first = pick(DEMO_FIRST, rng);
		const last = pick(DEMO_LAST, rng);
		const headline = pick(DEMO_HEADLINES, rng);
		const location = pick(DEMO_LOCATIONS, rng);
		const skills = Array.from(new Set([
			pick(DEMO_SKILLS, rng),
			pick(DEMO_SKILLS, rng),
			pick(DEMO_SKILLS, rng),
			pick(DEMO_SKILLS, rng),
		])).map((name) => ({ name, level: 3 + Math.floor(rng() * 3) as 3 | 4 | 5 }));
		const industries = [pick(DEMO_INDUSTRIES, rng)];
		const years = 2 + Math.floor(rng() * 12);
		const email = `demo-${batchId.slice(5, 13)}-${i}@klick.demo`;

		const [u] = await db
			.insert(users)
			.values({
				email,
				name: `${first} ${last}`,
				role: "candidate",
				tenantId: tenant.id,
				emailVerified: new Date(),
				demoBatchId: batchId,
			})
			.returning({ id: users.id });
		await db.insert(candidateProfiles).values({
			userId: u.id,
			displayName: `${first} ${last}`,
			headline,
			location,
			yearsExperience: years,
			languages: ["Deutsch", "Englisch"],
			skills,
			industries,
			summary: `Demo-Kandidat:in mit Fokus auf ${headline.split(" ").slice(-2).join(" ")} und ${skills[0]?.name ?? "TypeScript"}. Generiert für Demo-Zwecke.`,
			experience: [
				{
					company: pick(["Demo GmbH", "Beispiel AG", "Mock Studios"], rng),
					role: headline,
					start: `${2026 - Math.min(years, 5)}-01`,
					description: `Aktuelle Rolle als ${headline}.`,
					employmentType: "employee",
				},
			],
			salaryMin: 50000 + years * 5000,
			salaryDesired: 65000 + years * 6000,
			onboardingCompletedAt: new Date(),
			visibility: "matches_only",
		});
		createdUserIds.push(u.id);
		candidatesCreated++;
	}

	// Demo-Company + Jobs
	const companyEmail = `demo-${batchId.slice(5, 13)}-company@klick.demo`;
	const [companyUser] = await db
		.insert(users)
		.values({
			email: companyEmail,
			name: "Demo Company",
			role: "employer",
			tenantId: tenant.id,
			emailVerified: new Date(),
			demoBatchId: batchId,
		})
		.returning({ id: users.id });
	const [demoEmployer] = await db
		.insert(employers)
		.values({
			userId: companyUser.id,
			tenantId: tenant.id,
			companyName: `Demo Studios ${batchId.slice(5, 11)}`,
			description: "Generiertes Demo-Unternehmen für Showcase-Zwecke.",
			demoBatchId: batchId,
		})
		.returning({ id: employers.id });

	const jobIds: string[] = [];
	let jobsCreated = 0;
	for (let i = 0; i < jobCount; i++) {
		const headline = pick(DEMO_HEADLINES, rng);
		const requiredSkills = Array.from(
			new Set([pick(DEMO_SKILLS, rng), pick(DEMO_SKILLS, rng), pick(DEMO_SKILLS, rng)]),
		);
		const [j] = await db
			.insert(jobs)
			.values({
				employerId: demoEmployer.id,
				title: `${headline} (Demo)`,
				description: `Demo-Stelle für ${headline}. Diese Stelle wurde generiert um die Plattform-Funktionen zu zeigen.`,
				location: pick(DEMO_LOCATIONS, rng),
				remotePolicy: "hybrid",
				employmentType: "fulltime",
				salaryMin: 60000,
				salaryMax: 95000,
				yearsExperienceMin: 3,
				languages: ["Deutsch", "Englisch"],
				requirements: requiredSkills.map((name, idx) => ({
					name,
					weight: idx === 0 ? "must" : "nice",
					minLevel: 3,
				})) as { name: string; weight: "must" | "nice"; minLevel?: number }[],
				status: "published",
				demoBatchId: batchId,
			})
			.returning({ id: jobs.id });
		jobIds.push(j.id);
		jobsCreated++;
	}

	// Applications: jeder Demo-Kandidat bewirbt sich auf 1-2 zufällige Demo-Jobs.
	let applicationsCreated = 0;
	if (jobIds.length > 0) {
		for (const userId of createdUserIds) {
			const apps = 1 + Math.floor(rng() * 2);
			const seen = new Set<string>();
			for (let k = 0; k < apps; k++) {
				const jobId = pick(jobIds, rng);
				if (seen.has(jobId)) continue;
				seen.add(jobId);
				try {
					await db.insert(applications).values({
						jobId,
						candidateUserId: userId,
						status: pick(
							["submitted", "in_review", "shortlist", "interview"],
							rng,
						) as "submitted",
						coverLetter: `Demo-Anschreiben für die ausgeschriebene Stelle.`,
					});
					applicationsCreated++;
				} catch {
					// duplicate / FK race — ignorieren
				}
			}
		}
	}

	await db.insert(auditLog).values({
		actorUserId: adminId,
		action: "demo.generate",
		target: batchId,
		payload: {
			candidatesCreated,
			jobsCreated,
			applicationsCreated,
		},
	});
	revalidatePath("/admin");
	revalidatePath("/admin/users");
	revalidatePath("/admin/companies");
	revalidatePath("/admin/stats");

	return {
		ok: true,
		batchId,
		candidatesCreated,
		companyCreated: true,
		jobsCreated,
		applicationsCreated,
	};
}

export async function purgeDemoData(): Promise<{
	ok: true;
	deletedUsers: number;
	deletedEmployers: number;
	deletedJobs: number;
}> {
	const adminId = await requireAdmin();

	// Reihenfolge wegen FK-cascading: Jobs (mit demoBatchId), dann Employers
	// (mit demoBatchId), dann Users (mit demoBatchId). Cascade entsorgt den
	// Rest (applications, matches, interests, offers, candidate_profiles).
	const deletedJobs = await db
		.delete(jobs)
		.where(isNotNull(jobs.demoBatchId))
		.returning({ id: jobs.id });
	const deletedEmployers = await db
		.delete(employers)
		.where(isNotNull(employers.demoBatchId))
		.returning({ id: employers.id });
	const deletedUsers = await db
		.delete(users)
		.where(isNotNull(users.demoBatchId))
		.returning({ id: users.id });

	await db.insert(auditLog).values({
		actorUserId: adminId,
		action: "demo.purge",
		payload: {
			jobs: deletedJobs.length,
			employers: deletedEmployers.length,
			users: deletedUsers.length,
		},
	});
	revalidatePath("/admin");
	revalidatePath("/admin/users");
	revalidatePath("/admin/companies");
	revalidatePath("/admin/stats");

	return {
		ok: true,
		deletedUsers: deletedUsers.length,
		deletedEmployers: deletedEmployers.length,
		deletedJobs: deletedJobs.length,
	};
}
