import { count, desc, eq, sql } from "drizzle-orm";
import { globalDb } from "@/db";
import { member, organization, user } from "@/db/auth-schema";
import { cmsPages, frameworks } from "@/db/schema";

// Globale (nicht mandantenbezogene) Lesezugriffe: CMS-Rechtstexte,
// Plattform-Admin-Listen. Keine Org-Daten.

export async function getCmsPageBySlug(slug: string) {
	const [p] = await globalDb
		.select()
		.from(cmsPages)
		.where(eq(cmsPages.slug, slug))
		.limit(1);
	return p ?? null;
}

export async function listCmsPages() {
	return globalDb.select().from(cmsPages).orderBy(cmsPages.slug);
}

export async function upsertCmsPage(input: {
	slug: string;
	title: string;
	body: string;
	userId: string;
}) {
	const [row] = await globalDb
		.insert(cmsPages)
		.values({
			slug: input.slug,
			title: input.title,
			body: input.body,
			updatedByUserId: input.userId,
		})
		.onConflictDoUpdate({
			target: cmsPages.slug,
			set: {
				title: input.title,
				body: input.body,
				updatedByUserId: input.userId,
				updatedAt: new Date(),
			},
		})
		.returning();
	return row;
}

export async function deleteCmsPage(slug: string) {
	await globalDb.delete(cmsPages).where(eq(cmsPages.slug, slug));
}

export async function listOrganizationsWithCounts() {
	return globalDb
		.select({
			id: organization.id,
			name: organization.name,
			slug: organization.slug,
			createdAt: organization.createdAt,
			members: sql<number>`(select count(*) from ${member} m where m.organization_id = ${organization.id})`,
		})
		.from(organization)
		.orderBy(desc(organization.createdAt));
}

export async function listUsers(limit = 200) {
	return globalDb
		.select({
			id: user.id,
			name: user.name,
			email: user.email,
			role: user.role,
			banned: user.banned,
			banReason: user.banReason,
			twoFactorEnabled: user.twoFactorEnabled,
			createdAt: user.createdAt,
		})
		.from(user)
		.orderBy(desc(user.createdAt))
		.limit(limit);
}

export async function platformCounts() {
	const [orgs] = await globalDb.select({ n: count() }).from(organization);
	const [users] = await globalDb.select({ n: count() }).from(user);
	return { organizations: Number(orgs?.n ?? 0), users: Number(users?.n ?? 0) };
}

export async function listFrameworkOptions() {
	return globalDb
		.select({
			slug: frameworks.slug,
			name: frameworks.name,
			description: frameworks.description,
		})
		.from(frameworks)
		.orderBy(frameworks.sortOrder);
}
