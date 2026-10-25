import { eq } from "drizzle-orm";
import { orgSettings } from "@/db/schema";
import type { OrgTx } from "@/lib/db/with-org";
import { setupState } from "./steps";

// Einrichtung noch offen? Bis zum Abschluss genügen die Rechte ohne
// Step-up; danach laufen Änderungen über Einstellungen mit Bestätigung.
export async function setupOpen(tx: OrgTx, orgId: string): Promise<boolean> {
	const [s] = await tx
		.select({ flags: orgSettings.setupFlags })
		.from(orgSettings)
		.where(eq(orgSettings.organizationId, orgId))
		.limit(1);
	return !setupState(s?.flags ?? {}).completed;
}
