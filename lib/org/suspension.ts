import { orgSuspensionRow } from "@/lib/db/org-accounts";

// Sperre einer Organisation (Admin-Portal, Teil 2) für die Durchsetzung:
// jede Fläche der Org (App, Token, Portale, Trust Center) prüft sie neben
// der IP-Liste (Test org-suspension-wired). 30 s im Prozess zwischen-
// gespeichert wie die IP-Liste (lib/net/org-network.ts); Sperren und
// Entsperren verwerfen den Eintrag sofort.

const TTL_MS = 30_000;
const SETTLE_MS = 5_000;
type State = { suspended: boolean; reason: string | null };
const cache = new Map<string, { at: number; state: State }>();
const settling = new Map<string, number>();

export async function orgSuspension(orgId: string): Promise<State> {
	const hit = cache.get(orgId);
	if (hit && Date.now() - hit.at < TTL_MS) return hit.state;
	const row = await orgSuspensionRow(orgId);
	const state = {
		suspended: Boolean(row.suspendedAt),
		reason: row.suspendedReason,
	};
	if (Date.now() >= (settling.get(orgId) ?? 0)) {
		settling.delete(orgId);
		cache.set(orgId, { at: Date.now(), state });
	}
	return state;
}

export async function orgSuspended(orgId: string): Promise<boolean> {
	return (await orgSuspension(orgId)).suspended;
}

export function invalidateSuspension(orgId: string): void {
	cache.delete(orgId);
	settling.set(orgId, Date.now() + SETTLE_MS);
}
