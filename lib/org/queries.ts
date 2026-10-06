import { and, eq } from "drizzle-orm";
import { frameworks, orgFrameworks, orgSettings } from "@/db/schema";
import type { OrgTx } from "@/lib/db/with-org";

// Org-gescopte Lesezugriffe (RLS) — immer innerhalb von readOrg/withOrg.

export async function getOrgSettings(tx: OrgTx, orgId: string) {
	const [s] = await tx
		.select()
		.from(orgSettings)
		.where(eq(orgSettings.organizationId, orgId))
		.limit(1);
	return s ?? null;
}

export async function listOrgFrameworks(tx: OrgTx, orgId: string) {
	return tx
		.select({
			id: frameworks.id,
			slug: frameworks.slug,
			name: frameworks.name,
			status: orgFrameworks.status,
			ownerUserId: orgFrameworks.ownerUserId,
			enabledAt: orgFrameworks.enabledAt,
		})
		.from(orgFrameworks)
		.innerJoin(frameworks, eq(frameworks.id, orgFrameworks.frameworkId))
		.where(
			and(
				eq(orgFrameworks.organizationId, orgId),
				eq(orgFrameworks.status, "active"),
			),
		)
		.orderBy(frameworks.sortOrder);
}
