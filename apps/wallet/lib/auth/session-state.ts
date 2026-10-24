import { db } from "@wallet/db";
import { session as sessionTable } from "@wallet/db/auth-schema";
import { eq } from "drizzle-orm";

// Zustand der laufenden Sitzung ändern (aktive Org, Entsperrung) — der
// einzige Weg außerhalb von Better Auth, damit Fachcode nie selbst auf
// die Auth-Tabellen schreibt.

// Org wechseln: Entsperrung und Step-up gelten nur in der Org, in der sie
// bestätigt wurden
export async function switchSessionOrg(
	sessionId: string,
	orgId: string,
): Promise<void> {
	await db
		.update(sessionTable)
		.set({
			activeOrgId: orgId,
			unlockedAt: null,
			unlockOrgId: null,
			stepUpAt: new Date(0),
		})
		.where(eq(sessionTable.id, sessionId));
}

// Nach dem Beitritt: neue Org aktiv; entsperrt nur, wenn der Passkey gerade
// erst bestätigt wurde — die 15 min laufen ab dieser Bestätigung
export async function joinSessionOrg(
	sessionId: string,
	orgId: string,
	verifiedAt: Date | null,
): Promise<void> {
	await db
		.update(sessionTable)
		.set({
			activeOrgId: orgId,
			unlockedAt: verifiedAt,
			unlockOrgId: verifiedAt ? orgId : null,
		})
		.where(eq(sessionTable.id, sessionId));
}
