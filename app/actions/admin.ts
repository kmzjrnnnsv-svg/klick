"use server";

import { and, asc, desc, eq, gte, ilike, or, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { db } from "@/db";
import {
	type AuditLogEntry,
	applications,
	auditLog,
	type Employer,
	employers,
	hiringProcessTemplates,
	jobs,
	templateStages,
	tenants,
	type User,
	users,
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
