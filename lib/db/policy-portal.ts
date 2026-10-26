import { and, eq, sql } from "drizzle-orm";
import { globalDb } from "@/db";
import { type PortalDomain, policyPortals } from "@/db/schema";
import { portalSlugValid } from "@/lib/policy-portal/rules";

// Richtlinien-Portal ohne Org-Kontext lesen: Die Policy
// policy_portals_public gibt nur eingeschaltete Portale frei, die
// Transaktion ist READ ONLY und setzt keinen Kontext (wie lib/db/trust.ts).

export type PublicPortal = {
	organizationId: string;
	slug: string;
	orgName: string;
	domains: PortalDomain[];
	sessionDays: number;
};

export async function publicPortal(slug: string): Promise<PublicPortal | null> {
	if (!portalSlugValid(slug)) return null;
	return globalDb.transaction(async (tx) => {
		await tx.execute(sql`set transaction read only`);
		const [r] = await tx
			.select({
				organizationId: policyPortals.organizationId,
				slug: policyPortals.slug,
				orgName: policyPortals.orgName,
				domains: policyPortals.domains,
				sessionDays: policyPortals.sessionDays,
			})
			.from(policyPortals)
			.where(and(eq(policyPortals.slug, slug), eq(policyPortals.enabled, true)))
			.limit(1);
		return r ?? null;
	});
}
