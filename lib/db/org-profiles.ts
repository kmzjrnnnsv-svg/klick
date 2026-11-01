import { count } from "drizzle-orm";
import { orgSettings, sites } from "@/db/schema";
import {
	type CompanyClassification,
	classifyCompany,
	type Sector,
} from "@/lib/compliance/company-profile";
import type { OrgTx } from "./with-org";

// Admin → Organisationen (D6): Größe, Einstufung und Standorte je Org aus
// der Einrichtung. Läuft im Plattform-Kontext (withPlatform, auditiert).
export async function orgProfilesForAdmin(tx: OrgTx): Promise<
	Map<
		string,
		{
			sector: Sector;
			employees: number | null;
			sites: number;
			classification: CompanyClassification;
		}
	>
> {
	const [settings, siteCounts] = await Promise.all([
		tx
			.select({
				orgId: orgSettings.organizationId,
				sector: orgSettings.sector,
				entity: orgSettings.entityProfile,
			})
			.from(orgSettings),
		tx
			.select({ orgId: sites.organizationId, n: count() })
			.from(sites)
			.groupBy(sites.organizationId),
	]);
	const bySite = new Map(siteCounts.map((r) => [r.orgId, Number(r.n)]));
	return new Map(
		settings.map((s) => [
			s.orgId,
			{
				sector: s.sector,
				employees: s.entity.employees ?? null,
				sites: bySite.get(s.orgId) ?? 0,
				classification: classifyCompany(s.entity, s.sector),
			},
		]),
	);
}
