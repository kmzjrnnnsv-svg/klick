import { orgSettings, orgs } from "@wallet/db/schema";
import type { OrgTx } from "@wallet/lib/db/with-org";
import { eq } from "drizzle-orm";
import { emitEvent } from "./emit";

// org.updated: Name, Kurzname, Verwahrmodus — Klick legt bei einem Wechsel
// des Verwahrmodus eine Aufgabe an (Plan both.money, C1)
export async function emitOrgUpdated(
	tx: OrgTx,
	orgId: string,
	opts: { linkId?: string | null } = {},
): Promise<void> {
	const [o] = await tx
		.select({
			id: orgs.id,
			name: orgs.name,
			slug: orgs.slug,
			custodyMode: orgSettings.custodyMode,
			isOperator: orgSettings.isOperator,
			caspLicenceRef: orgSettings.caspLicenceRef,
		})
		.from(orgs)
		.innerJoin(orgSettings, eq(orgSettings.organizationId, orgs.id))
		.where(eq(orgs.id, orgId))
		.limit(1);
	if (!o) return;
	await emitEvent(
		tx,
		orgId,
		"org.updated",
		(rev) => ({
			org: { id: o.id, name: o.name, slug: o.slug },
			custodyMode: o.custodyMode,
			isOperator: o.isOperator,
			caspLicenceRef: o.caspLicenceRef,
			rev,
		}),
		{ linkId: opts.linkId ?? null },
	);
}
