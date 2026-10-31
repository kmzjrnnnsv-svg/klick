import { loadCustomFrameworks } from "@/lib/custom-frameworks/service";
import type { OrgTx } from "@/lib/db/with-org";
import { buildOrgCatalog, type OrgCatalog } from "./org-catalog";

// Katalog je Organisation laden (R4): statischer Katalog + eigene
// Rahmenwerke (aktiv und Entwurf; zurückgezogene bleiben außen vor).
export async function loadOrgCatalog(
	tx: OrgTx,
	orgId: string,
): Promise<OrgCatalog> {
	const custom = await loadCustomFrameworks(tx, orgId, {
		statuses: ["active", "draft"],
	});
	return buildOrgCatalog(custom);
}
