"use server";

import { APIError } from "better-auth/api";
import { inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { frameworks, orgFrameworks, orgSettings } from "@/db/schema";
import { audit } from "@/lib/audit";
import {
	AuthError,
	checkSessionRules,
	getSessionCtx,
	membershipCount,
} from "@/lib/auth/guards";
import { auth } from "@/lib/auth/server";
import { initializeOrg } from "@/lib/compliance/initialize-org";
import { generateDek, wrapDek } from "@/lib/crypto/envelope";
import { listFrameworkOptions } from "@/lib/db/global";
import { withOrg } from "@/lib/db/with-org";
import { type ActionResult, fromZod } from "@/lib/validation/common";
import { createOrganizationSchema } from "@/lib/validation/org";

// Onboarding: Organisation anlegen → Better Auth (organization + owner-member)
// → Org-Settings mit frischem DEK → Rechtskataster (org_frameworks)
// → initializeOrg (Anwendbarkeit, Control-Arbeitsvorrat, Baseline) → Audit.
export async function createOrganizationAction(
	input: unknown,
): Promise<ActionResult<{ orgId: string; slug: string }>> {
	const ctx = await getSessionCtx();
	if (!ctx) throw new AuthError("unauthenticated");
	checkSessionRules(ctx);
	if ((await membershipCount(ctx.user.id)) > 0) {
		return { ok: false, error: "alreadyMember" };
	}
	const parsed = createOrganizationSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const data = parsed.data;
	const h = await headers();

	let org: { id: string; slug: string };
	try {
		const created = await auth.api.createOrganization({
			body: { name: data.name, slug: data.slug },
			headers: h,
		});
		if (!created) return { ok: false, error: "createFailed" };
		org = { id: created.id, slug: created.slug };
	} catch (e) {
		if (e instanceof APIError && /slug/i.test(e.message)) {
			return {
				ok: false,
				error: "slugTaken",
				fieldErrors: { slug: ["slugTaken"] },
			};
		}
		throw e;
	}

	await auth.api.setActiveOrganization({
		body: { organizationId: org.id },
		headers: h,
	});

	const dek = await generateDek();
	const wrapped = await wrapDek(dek);

	await withOrg(
		{
			orgId: org.id,
			userId: ctx.user.id,
			ip: ctx.ip,
			userAgent: ctx.userAgent,
		},
		async (tx) => {
			await tx.insert(orgSettings).values({
				organizationId: org.id,
				encryptedDek: wrapped.wrapped,
				keyVersion: wrapped.keyVersion,
				sector: data.sector,
				licenceStage: data.licenceStage,
				caspServices: data.caspServices,
				applyBaseline: data.applyBaseline && ctx.user.role === "admin",
				onboardingCompletedAt: new Date(),
			});
			const fws = await tx
				.select({ id: frameworks.id, slug: frameworks.slug })
				.from(frameworks)
				.where(inArray(frameworks.slug, data.frameworks));
			if (fws.length > 0) {
				await tx.insert(orgFrameworks).values(
					fws.map((f) => ({
						organizationId: org.id,
						frameworkId: f.id,
						ownerUserId: ctx.user.id,
					})),
				);
			}
			// Baseline nur für Plattform-Admins (Betreiber-Org).
			const applyBaseline = data.applyBaseline && ctx.user.role === "admin";
			const init = await initializeOrg(tx, {
				orgId: org.id,
				userId: ctx.user.id,
				frameworks: fws.map((f) => f.slug),
				sector: data.sector,
				licenceStage: data.licenceStage,
				caspServices: data.caspServices,
				applyBaseline,
			});
			await audit(
				tx,
				{ userId: ctx.user.id, ip: ctx.ip, userAgent: ctx.userAgent },
				{
					organizationId: org.id,
					action: "org.onboarded",
					target: `organization:${org.id}`,
					after: {
						sector: data.sector,
						licenceStage: data.licenceStage,
						caspServices: data.caspServices,
						frameworks: fws.map((f) => f.slug),
						keyVersion: wrapped.keyVersion,
						applyBaseline,
						init,
					},
				},
			);
		},
	);

	revalidatePath("/", "layout");
	return { ok: true, data: { orgId: org.id, slug: org.slug } };
}

export async function checkSlugAvailable(slug: string): Promise<boolean> {
	const ctx = await getSessionCtx();
	if (!ctx) return false;
	const h = await headers();
	try {
		const res = await auth.api.checkOrganizationSlug({
			body: { slug },
			headers: h,
		});
		return Boolean(res?.status);
	} catch {
		return false;
	}
}

export async function frameworkOptions() {
	const ctx = await getSessionCtx();
	if (!ctx) throw new AuthError("unauthenticated");
	return listFrameworkOptions();
}
