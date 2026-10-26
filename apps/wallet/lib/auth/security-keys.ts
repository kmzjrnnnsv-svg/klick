import { db } from "@wallet/db";
import { passkey } from "@wallet/db/auth-schema";
import {
	type CredentialFlags,
	onlyDeviceBound,
} from "@wallet/lib/orgs/access-policy";
import { eq, inArray } from "drizzle-orm";

// Passkeys einer Person für „nur Sicherheitsschlüssel“ (Härtung W). Die
// Flags (deviceType = BE, backedUp = BS) schreibt das Passkey-Plugin bei der
// Registrierung; BE ändert sich nie, BS nur bei BE = 1.

export async function passkeyFlags(userId: string): Promise<CredentialFlags[]> {
	return db
		.select({ deviceType: passkey.deviceType, backedUp: passkey.backedUp })
		.from(passkey)
		.where(eq(passkey.userId, userId));
}

export async function userOnlyDeviceBound(userId: string): Promise<boolean> {
	return onlyDeviceBound(await passkeyFlags(userId));
}

/** Eigentümer:in eines Passkeys (Anmeldung: nur die Credential-ID ist bekannt). */
export async function passkeyOwner(
	credentialId: string,
): Promise<{ userId: string } | null> {
	const [row] = await db
		.select({ userId: passkey.userId })
		.from(passkey)
		.where(eq(passkey.credentialID, credentialId))
		.limit(1);
	return row ?? null;
}

/** Je Person: nur gerätegebundene Schlüssel? (Einstellungen > Zugang) */
export async function deviceBoundByUser(
	userIds: readonly string[],
): Promise<Map<string, boolean>> {
	const out = new Map<string, boolean>();
	if (userIds.length === 0) return out;
	const rows = await db
		.select({
			userId: passkey.userId,
			deviceType: passkey.deviceType,
			backedUp: passkey.backedUp,
		})
		.from(passkey)
		.where(inArray(passkey.userId, [...userIds]));
	for (const id of userIds)
		out.set(id, onlyDeviceBound(rows.filter((r) => r.userId === id)));
	return out;
}
