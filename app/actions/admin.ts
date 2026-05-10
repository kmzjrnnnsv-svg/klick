"use server";

import { and, asc, desc, eq, gte, ilike, isNotNull, or, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { db } from "@/db";
import {
	type AuditLogEntry,
	agencyMembers,
	applications,
	applicationEvents,
	auditLog,
	candidateProfiles,
	diversityResponses,
	type Employer,
	employers,
	hiringProcessTemplates,
	interests,
	jobs,
	matches,
	notifications,
	offers,
	savedSearches,
	sessions,
	templateStages,
	tenants,
	type User,
	users,
	vaultItems,
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

		// Initialer Owner als agencyMembers-Row anlegen, sodass der Cap +
		// die Team-Verwaltung von Anfang an konsistent funktionieren. Bei
		// Konflikt (sehr selten — gleiche email existiert schon): no-op.
		await db
			.insert(agencyMembers)
			.values({
				employerId: employer.id,
				userId: owner.id,
				inviteEmail: email,
				role: "owner",
				joinedAt: new Date(),
				invitedByUserId: actorId,
			})
			.onConflictDoNothing();

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

	// Jobs + Application-Counts pro Job. Statt SQL-Subquery: zwei Queries +
	// In-Memory-Join — robuster gegen Drizzle-Tagged-Template-Subtleties.
	const jobRows = await db
		.select({
			id: jobs.id,
			title: jobs.title,
			status: jobs.status,
			createdAt: jobs.createdAt,
		})
		.from(jobs)
		.where(eq(jobs.employerId, employerId))
		.orderBy(desc(jobs.createdAt))
		.catch((e) => {
			console.warn("[admin] getCompanyDetail jobs", e);
			return [] as { id: string; title: string; status: string; createdAt: Date }[];
		});

	const jobIds = jobRows.map((j) => j.id);
	const appCountsByJob = new Map<string, number>();
	if (jobIds.length > 0) {
		try {
			const counts = await db
				.select({
					jobId: applications.jobId,
					n: sql<number>`count(*)::int`.as("n"),
				})
				.from(applications)
				.where(eq(applications.employerId, employerId))
				.groupBy(applications.jobId);
			for (const c of counts) appCountsByJob.set(c.jobId, Number(c.n));
		} catch (e) {
			console.warn("[admin] getCompanyDetail app-counts", e);
		}
	}

	const appsAgg = await db
		.select({ n: sql<number>`count(*)::int`.as("n") })
		.from(applications)
		.where(eq(applications.employerId, employerId))
		.catch(() => [] as { n: number }[]);

	const templatesAgg = await db
		.select({ n: sql<number>`count(*)::int`.as("n") })
		.from(hiringProcessTemplates)
		.where(eq(hiringProcessTemplates.employerId, employerId))
		.catch(() => [] as { n: number }[]);

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
			applicationCount: appCountsByJob.get(j.id) ?? 0,
		})),
		applicationsTotal: Number(appsAgg[0]?.n ?? 0),
		templatesCount: Number(templatesAgg[0]?.n ?? 0),
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
	// Top-Standorte (Kandidaten)
	topLocations: { location: string; n: number }[];
	// Top-Standorte (Jobs)
	topJobLocations: { location: string; n: number }[];
	// Top-Branchen (Kandidaten)
	topIndustries: { name: string; n: number }[];
	// Top-Sprachen (Kandidaten gesprochen)
	topLanguages: { name: string; n: number }[];
	// Top-Zertifikate (im CV erwähnt — nicht zwingend uploaded)
	topCertifications: { name: string; n: number }[];
	// Verifikations-Mix nach kind
	verifyMix: { kind: string; n: number }[];
	// Verifikations-Erfolgsquote nach kind: passed / failed / pending
	verifyResults: { kind: string; passed: number; failed: number; pending: number }[];
	// Histogramm: Berufsjahre der Kandidat:innen, in 5-Jahres-Buckets
	yearsExperienceHist: { bucket: string; n: number }[];
	// Histogramm: erforderliche Berufsjahre der Jobs
	yearsRequiredHist: { bucket: string; n: number }[];
	// Histogramm: Wunschgehalt der Kandidat:innen, in 10k-Buckets EUR
	salaryDesiredHist: { bucket: string; n: number }[];
	// Histogramm: Job-Salary-Mid (mid = (min+max)/2)
	jobSalaryHist: { bucket: string; n: number }[];
	// Histogramm: Match-Score-Verteilung
	matchScoreHist: { bucket: string; n: number }[];
	// Education-Typ-Verteilung (school / bachelor / master / phd …)
	degreeTypeMix: { type: string; n: number }[];
	// Remote-Policy Mix (jobs)
	remotePolicyMix: { policy: string; n: number }[];
	// Employment-Type Mix (jobs)
	employmentTypeMix: { type: string; n: number }[];
	// Job-Status Mix (draft / published / archived)
	jobStatusMix: { status: string; n: number }[];
	// Diversity-Aggregat — nur wenn Gesamt ≥ 5; sonst leer.
	// Echte Buckets respektieren die ≥5-Regel pro Bucket (k-Anonymität).
	diversity: {
		total: number;
		gender: { bucket: string; n: number }[];
		ageRange: { bucket: string; n: number }[];
		hasDisability: { bucket: string; n: number }[];
	};
	// Aktive Tenants (mind. 1 published Job)
	activeTenants: number;
	// Vault-Statistik: Anzahl Items + kind-Mix + URL-only-Anteil.
	vault: {
		totalItems: number;
		uniqueOwners: number;
		kindMix: { kind: string; n: number }[];
		urlOnly: number; // Items ohne storage_key (z.B. Credly-URL-Badges)
	};
	// Saved Searches: was suchen Kandidaten?
	savedSearches: {
		total: number;
		uniqueOwners: number;
		topSkills: { name: string; n: number }[];
		topLocations: { location: string; n: number }[];
		remoteMix: { policy: string; n: number }[];
		notifyChannelMix: { channel: string; n: number }[];
	};
	// Application-Drop-Off pro Status. Hilft den Funnel-Verlust pro Stufe
	// zu sehen.
	applicationStatusMix: { status: string; n: number }[];
	// Stage-Outcomes aus application_events: advance / reject / on_hold —
	// pro Stage-ID. Wir aggregieren plattformweit (eigentlich pro
	// Template, aber globale Sicht reicht für den Anfang).
	stageOutcomes: { outcome: string; n: number }[];
	// Reject-Reasons (top 5).
	rejectReasons: { reason: string; n: number }[];
	// Time-to-Fill in Tagen: jobs.createdAt → erste accepted Offer pro Job.
	timeToFill: {
		count: number; // Anzahl Jobs mit erfolgreichem Offer
		medianDays: number | null;
		p25Days: number | null;
		p75Days: number | null;
	};
	// Übersetzungs-Coverage: wie viele Profile haben translations gepflegt.
	translationsCoverage: {
		total: number;
		hasTranslations: number;
	};
	// Career-Analysis-Adoption: wie viele Profile haben sie generiert.
	careerAdoption: {
		totalCandidates: number;
		hasAnalysis: number;
	};
	// Notification-Engagement: wie viele werden gelesen?
	notificationEngagement: {
		total: number;
		read: number;
		unread: number;
		byKind: { kind: string; total: number; read: number }[];
	};
	// Aktive Sessions (Auth.js): Proxy für "wie viele User sind grad da".
	activeSessions: {
		total: number; // expires > now()
		uniqueUsers: number;
	};
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
		topJobLocations: [],
		topIndustries: [],
		topLanguages: [],
		topCertifications: [],
		verifyMix: [],
		verifyResults: [],
		yearsExperienceHist: [],
		yearsRequiredHist: [],
		salaryDesiredHist: [],
		jobSalaryHist: [],
		matchScoreHist: [],
		degreeTypeMix: [],
		remotePolicyMix: [],
		employmentTypeMix: [],
		jobStatusMix: [],
		diversity: { total: 0, gender: [], ageRange: [], hasDisability: [] },
		activeTenants: 0,
		vault: { totalItems: 0, uniqueOwners: 0, kindMix: [], urlOnly: 0 },
		savedSearches: {
			total: 0,
			uniqueOwners: 0,
			topSkills: [],
			topLocations: [],
			remoteMix: [],
			notifyChannelMix: [],
		},
		applicationStatusMix: [],
		stageOutcomes: [],
		rejectReasons: [],
		timeToFill: { count: 0, medianDays: null, p25Days: null, p75Days: null },
		translationsCoverage: { total: 0, hasTranslations: 0 },
		careerAdoption: { totalCandidates: 0, hasAnalysis: 0 },
		notificationEngagement: { total: 0, read: 0, unread: 0, byKind: [] },
		activeSessions: { total: 0, uniqueUsers: 0 },
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

		// biome-ignore lint/suspicious/noExplicitAny: drizzle builder ist thenable
		const cnt = async (query: PromiseLike<any[]>): Promise<number> => {
			const r = await query;
			return Number(r[0]?.n ?? 0);
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

		// Profile completeness + zusätzliche Auswertungen, die alle Profile
		// einmalig in den Speicher ziehen (Plattform-Skala-Annahme: passt).
		const allProfiles = await db
			.select({
				summary: candidateProfiles.summary,
				skills: candidateProfiles.skills,
				education: candidateProfiles.education,
				experience: candidateProfiles.experience,
				yearsExperience: candidateProfiles.yearsExperience,
				salaryDesired: candidateProfiles.salaryDesired,
				industries: candidateProfiles.industries,
				languages: candidateProfiles.languages,
				certificationsMentioned: candidateProfiles.certificationsMentioned,
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

		// Histogramm-Helper
		const histogram = (
			values: number[],
			buckets: { label: string; min: number; max: number }[],
		) => {
			return buckets.map((b) => ({
				bucket: b.label,
				n: values.filter((v) => v >= b.min && v < b.max).length,
			}));
		};

		// Berufsjahre: 0-2 / 3-5 / 6-10 / 11-15 / 16+
		const yearsExperienceHist = histogram(
			allProfiles
				.map((p) => p.yearsExperience)
				.filter((y): y is number => y !== null),
			[
				{ label: "0–2", min: 0, max: 3 },
				{ label: "3–5", min: 3, max: 6 },
				{ label: "6–10", min: 6, max: 11 },
				{ label: "11–15", min: 11, max: 16 },
				{ label: "16+", min: 16, max: 999 },
			],
		);

		// Wunschgehalt EUR in 10k-Schritten — wir kappen bei 200k (oben offen).
		const salaryDesiredHist = histogram(
			allProfiles
				.map((p) => p.salaryDesired)
				.filter((s): s is number => s !== null && s > 0),
			[
				{ label: "<40k", min: 0, max: 40_000 },
				{ label: "40–60k", min: 40_000, max: 60_000 },
				{ label: "60–80k", min: 60_000, max: 80_000 },
				{ label: "80–100k", min: 80_000, max: 100_000 },
				{ label: "100–130k", min: 100_000, max: 130_000 },
				{ label: "130k+", min: 130_000, max: 9_999_999 },
			],
		);

		// Industries
		const industriesCount = new Map<string, number>();
		for (const p of allProfiles) {
			for (const i of p.industries ?? []) {
				const k = i.trim();
				if (!k) continue;
				industriesCount.set(k, (industriesCount.get(k) ?? 0) + 1);
			}
		}
		const topIndustries = [...industriesCount.entries()]
			.sort((a, b) => b[1] - a[1])
			.slice(0, 10)
			.map(([name, n]) => ({ name, n }));

		// Languages — Format kann "de:c1" o.Ä. sein; nur Sprach-Code zählen.
		const langCount = new Map<string, number>();
		for (const p of allProfiles) {
			for (const l of p.languages ?? []) {
				const code = l.split(":")[0]?.trim();
				if (!code) continue;
				langCount.set(code, (langCount.get(code) ?? 0) + 1);
			}
		}
		const topLanguages = [...langCount.entries()]
			.sort((a, b) => b[1] - a[1])
			.slice(0, 10)
			.map(([name, n]) => ({ name, n }));

		// Certifications mentioned (offizielle Bezeichnung)
		const certCount = new Map<string, number>();
		for (const p of allProfiles) {
			for (const c of p.certificationsMentioned ?? []) {
				const k = c.name.trim();
				if (!k) continue;
				certCount.set(k, (certCount.get(k) ?? 0) + 1);
			}
		}
		const topCertifications = [...certCount.entries()]
			.sort((a, b) => b[1] - a[1])
			.slice(0, 10)
			.map(([name, n]) => ({ name, n }));

		// Education-Typ Mix
		const degreeCount = new Map<string, number>();
		for (const p of allProfiles) {
			for (const e of p.education ?? []) {
				const t = e.degreeType ?? "other";
				degreeCount.set(t, (degreeCount.get(t) ?? 0) + 1);
			}
		}
		const degreeTypeMix = [...degreeCount.entries()].map(([type, n]) => ({
			type,
			n,
		}));

		// Job-Daten: Salary, RemotePolicy, EmploymentType, Status, yearsRequired,
		// JobLocations
		const jobRows2 = await db
			.select({
				salaryMin: jobs.salaryMin,
				salaryMax: jobs.salaryMax,
				yearsExperienceMin: jobs.yearsExperienceMin,
				location: jobs.location,
				remotePolicy: jobs.remotePolicy,
				employmentType: jobs.employmentType,
				status: jobs.status,
			})
			.from(jobs);

		const jobSalaryMids = jobRows2
			.map((j) =>
				j.salaryMin && j.salaryMax
					? Math.round((j.salaryMin + j.salaryMax) / 2)
					: j.salaryMin ?? j.salaryMax ?? null,
			)
			.filter((x): x is number => x !== null && x > 0);
		const jobSalaryHist = histogram(jobSalaryMids, [
			{ label: "<40k", min: 0, max: 40_000 },
			{ label: "40–60k", min: 40_000, max: 60_000 },
			{ label: "60–80k", min: 60_000, max: 80_000 },
			{ label: "80–100k", min: 80_000, max: 100_000 },
			{ label: "100–130k", min: 100_000, max: 130_000 },
			{ label: "130k+", min: 130_000, max: 9_999_999 },
		]);

		const yearsRequiredHist = histogram(
			jobRows2
				.map((j) => j.yearsExperienceMin)
				.filter((y): y is number => y !== null && y >= 0),
			[
				{ label: "0–2", min: 0, max: 3 },
				{ label: "3–5", min: 3, max: 6 },
				{ label: "6–10", min: 6, max: 11 },
				{ label: "11+", min: 11, max: 999 },
			],
		);

		const remotePolicyCount = new Map<string, number>();
		for (const j of jobRows2) {
			remotePolicyCount.set(
				j.remotePolicy,
				(remotePolicyCount.get(j.remotePolicy) ?? 0) + 1,
			);
		}
		const remotePolicyMix = [...remotePolicyCount.entries()].map(
			([policy, n]) => ({ policy, n }),
		);

		const employmentTypeCount = new Map<string, number>();
		for (const j of jobRows2) {
			employmentTypeCount.set(
				j.employmentType,
				(employmentTypeCount.get(j.employmentType) ?? 0) + 1,
			);
		}
		const employmentTypeMix = [...employmentTypeCount.entries()].map(
			([type, n]) => ({ type, n }),
		);

		const jobStatusCount = new Map<string, number>();
		for (const j of jobRows2) {
			jobStatusCount.set(j.status, (jobStatusCount.get(j.status) ?? 0) + 1);
		}
		const jobStatusMix = [...jobStatusCount.entries()].map(([status, n]) => ({
			status,
			n,
		}));

		const jobLocationCount = new Map<string, number>();
		for (const j of jobRows2) {
			if (j.location) {
				jobLocationCount.set(
					j.location,
					(jobLocationCount.get(j.location) ?? 0) + 1,
				);
			}
		}
		const topJobLocations = [...jobLocationCount.entries()]
			.sort((a, b) => b[1] - a[1])
			.slice(0, 8)
			.map(([location, n]) => ({ location, n }));

		// Match-Score-Verteilung (hardScore + softScore / 2 grobe Schätzung).
		const matchScores = await db
			.select({ hard: matches.hardScore, soft: matches.softScore })
			.from(matches)
			.catch(() => []);
		const scoreVals = matchScores.map((m) =>
			Math.round((Number(m.hard) + Number(m.soft)) / 2),
		);
		const matchScoreHist = histogram(scoreVals, [
			{ label: "0–25", min: 0, max: 26 },
			{ label: "26–50", min: 26, max: 51 },
			{ label: "51–75", min: 51, max: 76 },
			{ label: "76–90", min: 76, max: 91 },
			{ label: "91–100", min: 91, max: 101 },
		]);

		// Verifikations-Erfolgsquote
		const verifyResultsRows = await db
			.select({
				kind: verifications.kind,
				status: verifications.status,
				n: sql<number>`count(*)::int`.as("n"),
			})
			.from(verifications)
			.groupBy(verifications.kind, verifications.status)
			.catch(() => []);
		const verifyByKind = new Map<
			string,
			{ passed: number; failed: number; pending: number }
		>();
		for (const r of verifyResultsRows) {
			const cur = verifyByKind.get(r.kind) ?? {
				passed: 0,
				failed: 0,
				pending: 0,
			};
			if (r.status === "passed") cur.passed = Number(r.n);
			if (r.status === "failed") cur.failed = Number(r.n);
			if (r.status === "pending") cur.pending = Number(r.n);
			verifyByKind.set(r.kind, cur);
		}
		const verifyResults = [...verifyByKind.entries()].map(([kind, v]) => ({
			kind,
			...v,
		}));

		// Diversity — k-Anonymität: Buckets unter 5 Personen werden zu "<5"
		// zusammengeführt, NICHT direkt ausgewiesen.
		const dRows = await db
			.select({
				gender: diversityResponses.genderIdentity,
				age: diversityResponses.ageRange,
				disability: diversityResponses.hasDisability,
			})
			.from(diversityResponses)
			.catch(() => []);
		const dTotal = dRows.length;
		const kAnon = (
			counts: Map<string, number>,
		): { bucket: string; n: number }[] => {
			let small = 0;
			const out: { bucket: string; n: number }[] = [];
			for (const [k, n] of counts.entries()) {
				if (n < 5) small += n;
				else out.push({ bucket: k, n });
			}
			if (small > 0) out.push({ bucket: "<5", n: small });
			return out.sort((a, b) => b.n - a.n);
		};
		const genderCount = new Map<string, number>();
		const ageCount = new Map<string, number>();
		const disCount = new Map<string, number>();
		for (const r of dRows) {
			if (r.gender) genderCount.set(r.gender, (genderCount.get(r.gender) ?? 0) + 1);
			if (r.age) ageCount.set(r.age, (ageCount.get(r.age) ?? 0) + 1);
			if (r.disability !== null) {
				const k = r.disability ? "yes" : "no";
				disCount.set(k, (disCount.get(k) ?? 0) + 1);
			}
		}
		const diversity = {
			total: dTotal,
			gender: dTotal >= 5 ? kAnon(genderCount) : [],
			ageRange: dTotal >= 5 ? kAnon(ageCount) : [],
			hasDisability: dTotal >= 5 ? kAnon(disCount) : [],
		};

		// Vault-Statistik
		const vaultRows = await db
			.select({
				userId: vaultItems.userId,
				kind: vaultItems.kind,
				storageKey: vaultItems.storageKey,
			})
			.from(vaultItems)
			.catch(() => []);
		const vaultKindCount = new Map<string, number>();
		const vaultOwners = new Set<string>();
		let vaultUrlOnly = 0;
		for (const v of vaultRows) {
			vaultKindCount.set(v.kind, (vaultKindCount.get(v.kind) ?? 0) + 1);
			vaultOwners.add(v.userId);
			if (!v.storageKey) vaultUrlOnly++;
		}
		const vaultStats = {
			totalItems: vaultRows.length,
			uniqueOwners: vaultOwners.size,
			kindMix: [...vaultKindCount.entries()].map(([kind, n]) => ({ kind, n })),
			urlOnly: vaultUrlOnly,
		};

		// Saved Searches: criteria-Analyse
		const ssRows = await db
			.select({
				userId: savedSearches.userId,
				criteria: savedSearches.criteria,
				notifyChannel: savedSearches.notifyChannel,
			})
			.from(savedSearches)
			.catch(() => []);
		const ssOwners = new Set<string>();
		const ssSkillCount = new Map<string, number>();
		const ssLocationCount = new Map<string, number>();
		const ssRemoteCount = new Map<string, number>();
		const ssChannelCount = new Map<string, number>();
		for (const r of ssRows) {
			ssOwners.add(r.userId);
			ssChannelCount.set(
				r.notifyChannel,
				(ssChannelCount.get(r.notifyChannel) ?? 0) + 1,
			);
			const c = r.criteria;
			if (c?.skills) {
				for (const s of c.skills) {
					const k = s.trim();
					if (!k) continue;
					ssSkillCount.set(k, (ssSkillCount.get(k) ?? 0) + 1);
				}
			}
			if (c?.location) {
				const k = c.location.trim();
				if (k) ssLocationCount.set(k, (ssLocationCount.get(k) ?? 0) + 1);
			}
			if (c?.remote) {
				ssRemoteCount.set(
					c.remote,
					(ssRemoteCount.get(c.remote) ?? 0) + 1,
				);
			}
		}
		const savedSearchStats = {
			total: ssRows.length,
			uniqueOwners: ssOwners.size,
			topSkills: [...ssSkillCount.entries()]
				.sort((a, b) => b[1] - a[1])
				.slice(0, 10)
				.map(([name, n]) => ({ name, n })),
			topLocations: [...ssLocationCount.entries()]
				.sort((a, b) => b[1] - a[1])
				.slice(0, 8)
				.map(([location, n]) => ({ location, n })),
			remoteMix: [...ssRemoteCount.entries()].map(([policy, n]) => ({
				policy,
				n,
			})),
			notifyChannelMix: [...ssChannelCount.entries()].map(([channel, n]) => ({
				channel,
				n,
			})),
		};

		// Application-Status-Mix
		const appStatusRows = await db
			.select({
				status: applications.status,
				n: sql<number>`count(*)::int`.as("n"),
			})
			.from(applications)
			.groupBy(applications.status)
			.catch(() => []);
		const applicationStatusMix = appStatusRows.map((r) => ({
			status: r.status,
			n: Number(r.n),
		}));

		// Stage-Outcomes aus application_events
		const outcomeRows = await db
			.select({
				outcome: applicationEvents.outcome,
				n: sql<number>`count(*)::int`.as("n"),
			})
			.from(applicationEvents)
			.where(sql`${applicationEvents.outcome} IS NOT NULL`)
			.groupBy(applicationEvents.outcome)
			.catch(() => []);
		const stageOutcomes = outcomeRows
			.filter((r) => r.outcome !== null)
			.map((r) => ({ outcome: r.outcome as string, n: Number(r.n) }));

		// Reject-Reasons
		const rejectRows = await db
			.select({
				reason: applicationEvents.rejectReason,
				n: sql<number>`count(*)::int`.as("n"),
			})
			.from(applicationEvents)
			.where(sql`${applicationEvents.rejectReason} IS NOT NULL`)
			.groupBy(applicationEvents.rejectReason)
			.orderBy(desc(sql<number>`count(*)`))
			.limit(8)
			.catch(() => []);
		const rejectReasons = rejectRows
			.filter((r) => r.reason !== null)
			.map((r) => ({ reason: r.reason as string, n: Number(r.n) }));

		// Time-to-Fill: jobs.createdAt → erste accepted offer.decidedAt pro Job.
		const filledRows = await db
			.select({
				jobCreated: jobs.createdAt,
				decidedAt: offers.decidedAt,
			})
			.from(offers)
			.innerJoin(jobs, eq(offers.jobId, jobs.id))
			.where(eq(offers.status, "accepted"))
			.catch(() => []);
		// Pro Job nur die früheste accepted Offer zählen.
		const earliestPerJob = new Map<number, number>();
		for (const r of filledRows) {
			if (!r.jobCreated || !r.decidedAt) continue;
			const days = (r.decidedAt.getTime() - r.jobCreated.getTime()) / 86400_000;
			const key = r.jobCreated.getTime();
			const cur = earliestPerJob.get(key);
			if (cur === undefined || days < cur) earliestPerJob.set(key, days);
		}
		const ttfDays = [...earliestPerJob.values()].sort((a, b) => a - b);
		const quantile = (xs: number[], q: number): number | null => {
			if (xs.length === 0) return null;
			const i = Math.min(xs.length - 1, Math.floor(xs.length * q));
			return Math.round(xs[i] * 10) / 10;
		};
		const timeToFill = {
			count: ttfDays.length,
			medianDays: quantile(ttfDays, 0.5),
			p25Days: quantile(ttfDays, 0.25),
			p75Days: quantile(ttfDays, 0.75),
		};

		// Translations-Coverage + Career-Analysis-Adoption (in einem Pass)
		const coverRows = await db
			.select({
				hasTrans: sql<number>`(${candidateProfiles.translations} IS NOT NULL)::int`.as(
					"has_trans",
				),
				hasAnalysis:
					sql<number>`(${candidateProfiles.careerAnalysis} IS NOT NULL)::int`.as(
						"has_analysis",
					),
			})
			.from(candidateProfiles);
		const translationsCoverage = {
			total: coverRows.length,
			hasTranslations: coverRows.reduce((a, r) => a + Number(r.hasTrans), 0),
		};
		const careerAdoption = {
			totalCandidates: coverRows.length,
			hasAnalysis: coverRows.reduce((a, r) => a + Number(r.hasAnalysis), 0),
		};

		// Notification-Engagement
		const notifRows = await db
			.select({
				kind: notifications.kind,
				readAt: notifications.readAt,
			})
			.from(notifications);
		const notifByKind = new Map<string, { total: number; read: number }>();
		let notifTotal = 0;
		let notifRead = 0;
		for (const n of notifRows) {
			notifTotal++;
			if (n.readAt) notifRead++;
			const cur = notifByKind.get(n.kind) ?? { total: 0, read: 0 };
			cur.total++;
			if (n.readAt) cur.read++;
			notifByKind.set(n.kind, cur);
		}
		const notificationEngagement = {
			total: notifTotal,
			read: notifRead,
			unread: notifTotal - notifRead,
			byKind: [...notifByKind.entries()].map(([kind, v]) => ({
				kind,
				total: v.total,
				read: v.read,
			})),
		};

		// Aktive Sessions (Auth.js)
		const sessionRows = await db
			.select({ userId: sessions.userId })
			.from(sessions)
			.where(gte(sessions.expires, new Date()));
		const sessionUsers = new Set<string>();
		for (const s of sessionRows) sessionUsers.add(s.userId);
		const activeSessions = {
			total: sessionRows.length,
			uniqueUsers: sessionUsers.size,
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
			topJobLocations,
			topIndustries,
			topLanguages,
			topCertifications,
			verifyMix,
			verifyResults,
			yearsExperienceHist,
			yearsRequiredHist,
			salaryDesiredHist,
			jobSalaryHist,
			matchScoreHist,
			degreeTypeMix,
			remotePolicyMix,
			employmentTypeMix,
			jobStatusMix,
			diversity,
			activeTenants,
			vault: vaultStats,
			savedSearches: savedSearchStats,
			applicationStatusMix,
			stageOutcomes,
			rejectReasons,
			timeToFill,
			translationsCoverage,
			careerAdoption,
			notificationEngagement,
			activeSessions,
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
					weight: (idx === 0 ? "must" : "nice") as "must" | "nice",
					minLevel: 3 as 1 | 2 | 3 | 4 | 5,
				})),
				status: "published",
				demoBatchId: batchId,
			})
			.returning({ id: jobs.id });
		jobIds.push(j.id);
		jobsCreated++;
	}

	// Applications: jeder Demo-Kandidat bewirbt sich auf 1-2 zufällige Demo-Jobs.
	// Wir bauen mini-Snapshots — echte Bewerbungen ziehen die aus dem Profil,
	// aber für die Demo reichen Platzhalter.
	let applicationsCreated = 0;
	if (jobIds.length > 0) {
		// Job-Daten + Kandidat-Profile einmal vorab holen für Snapshots.
		const demoJobsData = await db
			.select()
			.from(jobs)
			.where(eq(jobs.employerId, demoEmployer.id));
		const demoProfiles = await db
			.select()
			.from(candidateProfiles)
			.where(eq(candidateProfiles.userId, createdUserIds[0]));
		// Profile pro User indexieren
		const profilesByUser = new Map<string, (typeof demoProfiles)[number]>();
		const allProfiles = await db
			.select()
			.from(candidateProfiles);
		for (const p of allProfiles) profilesByUser.set(p.userId, p);

		for (const userId of createdUserIds) {
			const apps = 1 + Math.floor(rng() * 2);
			const seen = new Set<string>();
			for (let k = 0; k < apps; k++) {
				const jobId = pick(jobIds, rng);
				if (seen.has(jobId)) continue;
				seen.add(jobId);
				const job = demoJobsData.find((j) => j.id === jobId);
				const profile = profilesByUser.get(userId);
				if (!job || !profile) continue;
				try {
					await db.insert(applications).values({
						jobId,
						candidateUserId: userId,
						employerId: demoEmployer.id,
						status: pick(
							["submitted", "in_review", "shortlisted", "interview"] as const,
							rng,
						),
						coverLetter: `Demo-Anschreiben für die ausgeschriebene Stelle.`,
						profileSnapshot: {
							displayName: profile.displayName,
							headline: profile.headline,
							location: profile.location,
							yearsExperience: profile.yearsExperience,
							salaryDesired: profile.salaryDesired,
							skills: (profile.skills ?? undefined) as
								| { name: string; level?: number }[]
								| undefined,
							summary: profile.summary,
							industries: profile.industries,
						},
						jobSnapshot: {
							title: job.title,
							description: job.description,
							location: job.location,
							remotePolicy: job.remotePolicy,
							salaryMin: job.salaryMin,
							salaryMax: job.salaryMax,
							yearsExperienceMin: job.yearsExperienceMin,
							requirements: (job.requirements ?? undefined) as
								| {
										name: string;
										weight: "must" | "nice";
										minLevel?: number;
								  }[]
								| undefined,
							languages: job.languages,
						},
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

// ─── Owner / Team-Verwaltung pro Firma (Admin) ───────────────────────────
// Auch wenn der Begriff "Owner" auf eine 1:1-Beziehung hindeutet, modellieren
// wir Team-Mitgliedschaften über `agencyMembers`. employers.userId bleibt als
// Legacy-Pointer (alte Queries lesen ihn noch), wird aber automatisch
// synchron gehalten.

export type CompanyTeamRow = {
	memberId: string;
	userId: string | null;
	email: string;
	name: string | null;
	role: "owner" | "recruiter" | "viewer";
	invitedAt: Date;
	joinedAt: Date | null;
	isLegacyOwner: boolean;
};

export async function listCompanyTeam(
	employerId: string,
): Promise<CompanyTeamRow[]> {
	await requireAdmin();
	const rows = await db
		.select({
			memberId: agencyMembers.id,
			userId: agencyMembers.userId,
			email: agencyMembers.inviteEmail,
			role: agencyMembers.role,
			invitedAt: agencyMembers.invitedAt,
			joinedAt: agencyMembers.joinedAt,
			memberName: users.name,
		})
		.from(agencyMembers)
		.leftJoin(users, eq(users.id, agencyMembers.userId))
		.where(eq(agencyMembers.employerId, employerId))
		.orderBy(desc(agencyMembers.invitedAt));

	const [emp] = await db
		.select({ legacyOwnerId: employers.userId })
		.from(employers)
		.where(eq(employers.id, employerId))
		.limit(1);

	return rows.map((r) => ({
		memberId: r.memberId,
		userId: r.userId,
		email: r.email,
		name: r.memberName,
		role: r.role,
		invitedAt: r.invitedAt,
		joinedAt: r.joinedAt,
		isLegacyOwner: !!emp && r.userId === emp.legacyOwnerId,
	}));
}

export async function adminSetCompanyOwner(input: {
	employerId: string;
	email: string;
}): Promise<
	| { ok: true; userId: string | null; memberId: string; sentInvite: boolean }
	| { ok: false; error: string }
> {
	try {
		const adminId = await requireAdmin();
		const email = input.email.trim().toLowerCase();
		if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
			return { ok: false, error: "Bitte eine gültige E-Mail." };
		}
		const [emp] = await db
			.select()
			.from(employers)
			.where(eq(employers.id, input.employerId))
			.limit(1);
		if (!emp) return { ok: false, error: "Firma nicht gefunden." };

		// User existiert schon? Dann direkt promoten + employers.userId updaten.
		const [existingUser] = await db
			.select()
			.from(users)
			.where(eq(users.email, email))
			.limit(1);

		// Token nur generieren wenn wir einladen (User existiert nicht oder
		// joinedAt fehlt). Sonst kann der bestehende User sofort loslegen.
		const needsInvite = !existingUser;
		const token = needsInvite
			? Array.from(crypto.getRandomValues(new Uint8Array(24)))
					.map((b) => b.toString(16).padStart(2, "0"))
					.join("")
			: null;

		// Bestehenden Owner zu recruiter herabstufen (NICHT löschen).
		await db
			.update(agencyMembers)
			.set({ role: "recruiter" })
			.where(
				and(
					eq(agencyMembers.employerId, input.employerId),
					eq(agencyMembers.role, "owner"),
				),
			);

		// Upsert auf (employerId, inviteEmail).
		const [member] = await db
			.insert(agencyMembers)
			.values({
				employerId: input.employerId,
				inviteEmail: email,
				userId: existingUser?.id ?? null,
				inviteToken: token,
				role: "owner",
				joinedAt: existingUser ? new Date() : null,
				invitedByUserId: adminId,
			})
			.onConflictDoUpdate({
				target: [agencyMembers.employerId, agencyMembers.inviteEmail],
				set: {
					userId: existingUser?.id ?? null,
					inviteToken: token,
					role: "owner",
					joinedAt: existingUser ? new Date() : null,
					invitedByUserId: adminId,
				},
			})
			.returning({ id: agencyMembers.id });

		// employers.userId synchron halten (Single-Source bleibt agency_members,
		// aber Legacy-Code in vielen Actions liest direkt von employers.userId).
		if (existingUser) {
			await db
				.update(employers)
				.set({ userId: existingUser.id })
				.where(eq(employers.id, input.employerId));
		}

		// Audit-Log
		await db.insert(auditLog).values({
			tenantId: emp.tenantId,
			actorUserId: adminId,
			action: "employer.owner_change",
			target: input.employerId,
			payload: {
				oldOwnerUserId: emp.userId,
				newOwnerUserId: existingUser?.id ?? null,
				newOwnerEmail: email,
				sentInvite: needsInvite,
			},
		});

		// Mail nur senden wenn wir einladen. Reuse: dieselbe Logik wie
		// inviteAgent — aber wir wollen keine Zirkular-Imports von actions
		// auf actions, also bauen wir die Mail hier inline.
		if (needsInvite && token) {
			try {
				const { transactionalEmail } = await import("@/lib/mail/templates");
				const { sendTransactionalMail } = await import("@/lib/mail/send");
				const baseUrl = process.env.AUTH_URL ?? "https://raza.work";
				const inviteUrl = `${baseUrl}/agency/invites/${token}`;
				const tpl = transactionalEmail({
					subject: `${emp.companyName} braucht deine Bestätigung`,
					eyebrow: "Owner-Einladung",
					title: `Du wurdest als Owner von ${emp.companyName} eingetragen`,
					body: `<p>Der Klick-Admin hat dich als Owner für <strong>${emp.companyName}</strong> festgelegt. Folge dem Link um die Mitgliedschaft zu bestätigen — danach kannst du Stellen ausschreiben, Team-Mitglieder einladen und Bewerbungen verwalten.</p>`,
					cta: { label: "Einladung annehmen", url: inviteUrl },
					footnote:
						"Wenn du den Verdacht hast, das ist ein Versehen, ignoriere diese Mail einfach.",
				});
				await sendTransactionalMail({
					to: email,
					subject: tpl.subject,
					text: tpl.text,
					html: tpl.html,
				});
			} catch (e) {
				console.warn("[admin] owner-invite mail failed (non-fatal)", e);
			}
		}

		revalidatePath("/admin/companies");
		revalidatePath(`/admin/companies/${input.employerId}`);
		revalidatePath(`/admin/companies/${input.employerId}/owner`);

		return {
			ok: true,
			userId: existingUser?.id ?? null,
			memberId: member.id,
			sentInvite: needsInvite,
		};
	} catch (e) {
		console.error("[admin] adminSetCompanyOwner", e);
		return {
			ok: false,
			error: e instanceof Error ? e.message : "fehlgeschlagen",
		};
	}
}

export async function adminRemoveCompanyMember(
	memberId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
	try {
		const adminId = await requireAdmin();
		const [m] = await db
			.select()
			.from(agencyMembers)
			.where(eq(agencyMembers.id, memberId))
			.limit(1);
		if (!m) return { ok: false, error: "Member nicht gefunden." };
		// Owner darf nicht entfernt werden — Admin muss erst Owner ändern.
		if (m.role === "owner") {
			return {
				ok: false,
				error: "Owner kann nicht direkt entfernt werden — erst neuen Owner setzen.",
			};
		}
		await db.delete(agencyMembers).where(eq(agencyMembers.id, memberId));
		await db.insert(auditLog).values({
			actorUserId: adminId,
			action: "employer.member_remove",
			target: m.employerId,
			payload: { memberId, email: m.inviteEmail, role: m.role },
		});
		revalidatePath(`/admin/companies/${m.employerId}/owner`);
		return { ok: true };
	} catch (e) {
		return {
			ok: false,
			error: e instanceof Error ? e.message : "fehlgeschlagen",
		};
	}
}
