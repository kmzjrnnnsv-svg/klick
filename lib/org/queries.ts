import { and, eq, inArray } from "drizzle-orm";
import { audits, frameworks, orgFrameworks, orgSettings } from "@/db/schema";
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

// Früher aktive, entfernte Rahmenwerke (status "retired") — zum Reaktivieren.
export async function listRetiredFrameworkSlugs(
	tx: OrgTx,
	orgId: string,
): Promise<string[]> {
	const rows = await tx
		.select({ slug: frameworks.slug })
		.from(orgFrameworks)
		.innerJoin(frameworks, eq(frameworks.id, orgFrameworks.frameworkId))
		.where(
			and(
				eq(orgFrameworks.organizationId, orgId),
				eq(orgFrameworks.status, "retired"),
			),
		);
	return rows.map((r) => r.slug);
}

// Geplante/laufende Audits mit ihren Rahmenwerken (Sperre beim Entfernen).
export async function listOpenAuditScopes(tx: OrgTx, orgId: string) {
	return tx
		.select({
			id: audits.id,
			title: audits.title,
			frameworkIds: audits.frameworkIds,
		})
		.from(audits)
		.where(
			and(
				eq(audits.organizationId, orgId),
				inArray(audits.status, ["planned", "in_progress"]),
			),
		);
}
