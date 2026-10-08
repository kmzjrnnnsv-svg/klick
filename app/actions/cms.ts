"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { safeAction } from "@/lib/actions/safe";
import { auditPlatform } from "@/lib/audit";
import { requirePlatformAdmin } from "@/lib/auth/guards";
import * as g from "@/lib/db/global";
import { type ActionResult, fromZod, slug } from "@/lib/validation/common";

async function getCmsPageBySlugImpl(s: string) {
	return g.getCmsPageBySlug(s);
}

const cmsSchema = z.object({
	slug,
	title: z.string().trim().min(1).max(200),
	body: z.string().max(200_000),
});

async function saveCmsPageImpl(
	input: unknown,
): Promise<ActionResult<{ slug: string }>> {
	const admin = await requirePlatformAdmin();
	const parsed = cmsSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const before = await g.getCmsPageBySlug(parsed.data.slug);
	const row = await g.upsertCmsPage({ ...parsed.data, userId: admin.userId });
	await auditPlatform(
		{ userId: admin.userId, ip: admin.ip, userAgent: admin.userAgent },
		{
			action: before ? "cms.page_updated" : "cms.page_created",
			target: `cms_page:${row.id}`,
			before: before ? { title: before.title, body: before.body } : null,
			after: { title: row.title, body: row.body },
		},
	);
	revalidatePath(`/${row.slug}`);
	revalidatePath("/admin/cms");
	return { ok: true, data: { slug: row.slug } };
}

async function deleteCmsPageImpl(s: string): Promise<ActionResult> {
	const admin = await requirePlatformAdmin();
	const before = await g.getCmsPageBySlug(s);
	if (!before) return { ok: false, error: "Seite nicht gefunden" };
	await g.deleteCmsPage(s);
	await auditPlatform(
		{ userId: admin.userId, ip: admin.ip, userAgent: admin.userAgent },
		{
			action: "cms.page_deleted",
			target: `cms_page:${before.id}`,
			before: { title: before.title },
		},
	);
	revalidatePath("/admin/cms");
	return { ok: true, data: undefined };
}

// Sicherheitsnetz: unerwartete Ausnahmen → { ok: false, error, ref } + Log
// statt Error-Boundary (lib/actions/safe.ts).
export const getCmsPageBySlug = safeAction(
	"getCmsPageBySlug",
	getCmsPageBySlugImpl,
);
export const saveCmsPage = safeAction("saveCmsPage", saveCmsPageImpl);
export const deleteCmsPage = safeAction("deleteCmsPage", deleteCmsPageImpl);
