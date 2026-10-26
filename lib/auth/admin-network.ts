// Admin-Netz (Härtung A2): /admin, Plattform-Aktionen und die Admin-Endpunkte
// von Better Auth nur aus ADMIN_NETWORKS (WireGuard wg-admin) bzw. den
// Adressen in ADMIN_IP_ALLOWLIST. Ohne beides gilt keine Einschränkung — in
// Produktion verhindert die Start-Prüfung das (lib/env-checks.ts).
// Die Client-IP kommt aus X-Real-IP (nginx, $remote_addr); die App lauscht
// nur auf localhost, der Header ist also nicht fälschbar.

import { env } from "@/lib/env";
import { type IpRange, ipInRanges, parseRanges } from "@/lib/net/ip";

let cache: { key: string; ranges: IpRange[] } | null = null;

export function adminRanges(): IpRange[] {
	const e = env();
	const key = `${e.ADMIN_NETWORKS.join(",")}|${e.ADMIN_IP_ALLOWLIST.join(",")}`;
	if (cache?.key !== key)
		cache = {
			key,
			ranges: parseRanges([...e.ADMIN_NETWORKS, ...e.ADMIN_IP_ALLOWLIST])
				.ranges,
		};
	return cache.ranges;
}

/** Darf diese Adresse Plattform-Verwaltung? Ohne Netz-Liste: ja. */
export function adminNetworkAllows(ip: string | null | undefined): boolean {
	const ranges = adminRanges();
	if (ranges.length === 0) return true;
	return ipInRanges(ip, ranges);
}
