import { eq } from "drizzle-orm";
import { orgSettings } from "@/db/schema";
import type { AuditInput } from "@/lib/audit";
import type { OrgTx } from "@/lib/db/with-org";
import { markStepDone, SETUP_FLAG, setupState } from "./steps";

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

// Gap-Analyse auf dem normalen Weg angelegt (/gap-analyse): der letzte
// Schritt der Einrichtung gilt dann als erledigt, sonst bliebe „Einrichtung
// fortsetzen“ stehen und ein zweiter Klick legte eine zweite Analyse an.
// Nur, solange die Einrichtung begonnen und offen ist.
export async function completeSetupGapStep(
	tx: OrgTx,
	orgId: string,
	now: Date,
): Promise<AuditInput | null> {
	const [s] = await tx
		.select({ flags: orgSettings.setupFlags })
		.from(orgSettings)
		.where(eq(orgSettings.organizationId, orgId))
		.limit(1);
	const flags = s?.flags ?? {};
	const state = setupState(flags);
	if (!state.started || state.completed) return null;
	const next = markStepDone(flags, "gap-analyse", now);
	await tx
		.update(orgSettings)
		.set({ setupFlags: next })
		.where(eq(orgSettings.organizationId, orgId));
	return {
		action: "org.setup_step",
		target: `organization:${orgId}`,
		after: { step: "gap-analyse", done: next[SETUP_FLAG.done] },
	};
}
