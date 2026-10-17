import { eq } from "drizzle-orm";
import { orgSettings } from "@/db/schema";
import type { OrgTx } from "@/lib/db/with-org";
import { DEFAULT_LAND, isLand, type Land } from "@/lib/time/holidays";

// Bundesland des Sitzes aus den Stammdaten (Feiertage für Werktagsfristen).
export async function orgLand(tx: OrgTx, orgId: string): Promise<Land> {
	const [row] = await tx
		.select({ profile: orgSettings.entityProfile })
		.from(orgSettings)
		.where(eq(orgSettings.organizationId, orgId))
		.limit(1);
	const land = row?.profile?.land;
	return isLand(land) ? land : DEFAULT_LAND;
}
