import { orgSettings } from "@wallet/db/schema";
import { type OrgTx, readOrg } from "@wallet/lib/db/with-org";
import { eq } from "drizzle-orm";
import {
	accessPolicyOf,
	OPEN_ACCESS_POLICY,
	type WalletAccessPolicy,
} from "./access-policy";
import { listMemberships } from "./memberships";

// Zugangsregeln je Org lesen (Härtung W). Guards fragen bei jedem Aufruf —
// deshalb 30 s im Prozess zwischengespeichert, beim Speichern sofort
// ungültig (invalidateAccessPolicy). Ohne Zeile gilt: alles offen.

const TTL_MS = 30_000;
const cache = new Map<string, { at: number; policy: WalletAccessPolicy }>();

const COLUMNS = {
	networkPolicy: orgSettings.networkPolicy,
	securityKeysOnly: orgSettings.securityKeysOnly,
	allowedAssets: orgSettings.allowedAssets,
	mandatesRequired: orgSettings.mandatesRequired,
};

/** Ohne Zwischenspeicher, in der laufenden Transaktion (Actions). */
export async function accessPolicyTx(
	tx: OrgTx,
	orgId: string,
): Promise<WalletAccessPolicy> {
	const [row] = await tx
		.select(COLUMNS)
		.from(orgSettings)
		.where(eq(orgSettings.organizationId, orgId))
		.limit(1);
	return row ? accessPolicyOf(row) : OPEN_ACCESS_POLICY;
}

/** Frisch aus der Datenbank (Actions, die Geld oder Konten betreffen). */
export function currentAccessPolicy(
	orgId: string,
): Promise<WalletAccessPolicy> {
	return readOrg({ orgId, userId: null }, (tx) => accessPolicyTx(tx, orgId));
}

export async function orgAccessPolicy(
	orgId: string,
): Promise<WalletAccessPolicy> {
	const hit = cache.get(orgId);
	if (hit && Date.now() - hit.at < TTL_MS) return hit.policy;
	const policy = await readOrg({ orgId, userId: null }, (tx) =>
		accessPolicyTx(tx, orgId),
	);
	cache.set(orgId, { at: Date.now(), policy });
	return policy;
}

export function invalidateAccessPolicy(orgId: string): void {
	cache.delete(orgId);
}

/** Verlangt eine Org dieser Person Sicherheitsschlüssel? (strengste gewinnt) */
export async function userRequiresSecurityKey(
	userId: string,
): Promise<boolean> {
	for (const m of await listMemberships(userId))
		if ((await orgAccessPolicy(m.orgId)).securityKeysOnly) return true;
	return false;
}
