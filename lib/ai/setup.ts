import { eq } from "drizzle-orm";
import { orgSettings } from "@/db/schema";
import type { OrgTx } from "@/lib/db/with-org";
import { type AiClassLevel, aiPolicyOf } from "./policy";

// Frage in der geführten Einrichtung (Schritt „IT, Dienstleister & Daten“):
// welche Inhalte eine KI lesen darf. Wirkt nur, solange die KI aus ist —
// danach ändert sich die Regel nur unter Einstellungen > KI (Vier-Augen).
export async function setupAiClass(
	tx: OrgTx,
	orgId: string,
	maxClass: AiClassLevel,
): Promise<{ before: AiClassLevel; after: AiClassLevel } | null> {
	const [row] = await tx
		.select({ aiPolicy: orgSettings.aiPolicy })
		.from(orgSettings)
		.where(eq(orgSettings.organizationId, orgId))
		.limit(1);
	const current = aiPolicyOf(row?.aiPolicy);
	if (current.enabled || current.maxClass === maxClass) return null;
	await tx
		.update(orgSettings)
		.set({ aiPolicy: { ...current, maxClass } })
		.where(eq(orgSettings.organizationId, orgId));
	return { before: current.maxClass, after: maxClass };
}
