"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { db } from "@/db";
import { type CmsPage, cmsPages, tenants, users } from "@/db/schema";

const DEFAULT_TENANT_SLUG = process.env.DEFAULT_TENANT_SLUG ?? "default";

async function defaultTenantId(): Promise<string | null> {
	const [t] = await db
		.select({ id: tenants.id })
		.from(tenants)
		.where(eq(tenants.slug, DEFAULT_TENANT_SLUG))
		.limit(1);
	return t?.id ?? null;
}

async function requireAdminTenant(): Promise<{
	userId: string;
	tenantId: string;
}> {
	const session = await auth();
	if (!session?.user?.id) throw new Error("unauthenticated");
	const [user] = await db
		.select({ role: users.role, tenantId: users.tenantId })
		.from(users)
		.where(eq(users.id, session.user.id))
		.limit(1);
	if (user?.role !== "admin") throw new Error("forbidden");
	if (!user.tenantId) throw new Error("user not assigned to a tenant");
	return { userId: session.user.id, tenantId: user.tenantId };
}

export async function listCmsPages(): Promise<CmsPage[]> {
	await requireAdminTenant();
	const tenantId = await defaultTenantId();
	if (!tenantId) return [];
	return db.select().from(cmsPages).where(eq(cmsPages.tenantId, tenantId));
}

export async function getCmsPageBySlug(slug: string): Promise<CmsPage | null> {
	const tenantId = await defaultTenantId();
	if (!tenantId) return null;
	const [p] = await db
		.select()
		.from(cmsPages)
		.where(and(eq(cmsPages.tenantId, tenantId), eq(cmsPages.slug, slug)))
		.limit(1);
	return p ?? null;
}

export async function saveCmsPage(formData: FormData): Promise<void> {
	const { userId, tenantId } = await requireAdminTenant();
	const slug = String(formData.get("slug") ?? "")
		.trim()
		.toLowerCase();
	const title = String(formData.get("title") ?? "").trim();
	const body = String(formData.get("body") ?? "");
	if (!slug || !title) throw new Error("Slug und Titel sind Pflicht.");
	if (!/^[a-z0-9-]+$/.test(slug)) {
		throw new Error("Slug nur Kleinbuchstaben, Zahlen, Bindestriche.");
	}

	await db
		.insert(cmsPages)
		.values({
			tenantId,
			slug,
			title,
			body,
			updatedAt: new Date(),
			updatedByUserId: userId,
		})
		.onConflictDoUpdate({
			target: [cmsPages.tenantId, cmsPages.slug],
			set: { title, body, updatedAt: new Date(), updatedByUserId: userId },
		});

	revalidatePath("/admin/cms");
	revalidatePath(`/${slug}`);
}

export async function deleteCmsPage(slug: string): Promise<void> {
	const { tenantId } = await requireAdminTenant();
	await db
		.delete(cmsPages)
		.where(and(eq(cmsPages.tenantId, tenantId), eq(cmsPages.slug, slug)));
	revalidatePath("/admin/cms");
	revalidatePath(`/${slug}`);
}
