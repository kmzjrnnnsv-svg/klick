import { eq } from "drizzle-orm";
import { orgSettings } from "@/db/schema";
import { readOrg } from "@/lib/db/with-org";
import {
	type NetworkPolicy,
	type NetworkSurface,
	networkAllows,
	networkPolicyOf,
} from "./network-policy";

// IP-Liste je Org (Härtung A5) für die Durchsetzung: gelesen im Org-Kontext,
// 30 s im Prozess zwischengespeichert (eine Abfrage je Anfrage wäre zu teuer
// für Portale und Ingest). Wirkt eine Änderung (lib/security-changes), wird
// der Eintrag sofort verworfen; ein Server, ein Prozess (wie das Rate-Limit).

const TTL_MS = 30_000;
const cache = new Map<string, { at: number; policy: NetworkPolicy }>();

export async function orgNetworkPolicy(orgId: string): Promise<NetworkPolicy> {
	const hit = cache.get(orgId);
	if (hit && Date.now() - hit.at < TTL_MS) return hit.policy;
	const [row] = await readOrg({ orgId, userId: null }, (tx) =>
		tx
			.select({ networkPolicy: orgSettings.networkPolicy })
			.from(orgSettings)
			.where(eq(orgSettings.organizationId, orgId))
			.limit(1),
	);
	const policy = networkPolicyOf(row?.networkPolicy);
	cache.set(orgId, { at: Date.now(), policy });
	return policy;
}

export function invalidateNetworkPolicy(orgId: string): void {
	cache.delete(orgId);
}

export async function orgNetworkAllows(
	orgId: string,
	surface: NetworkSurface,
	ip: string | null | undefined,
	opts: { external?: boolean } = {},
): Promise<boolean> {
	return networkAllows(await orgNetworkPolicy(orgId), surface, ip, opts);
}
