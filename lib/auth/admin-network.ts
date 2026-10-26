// Admin-Netz (Härtung A2): /admin, Plattform-Aktionen und die Admin-Endpunkte
// von Better Auth nur aus ADMIN_NETWORKS (WireGuard wg-admin) bzw. den
// Adressen in ADMIN_IP_ALLOWLIST. Ohne beides gilt keine Einschränkung — in
// Produktion verhindert die Start-Prüfung das (lib/env-checks.ts).
// Die Client-IP kommt aus X-Real-IP (nginx, $remote_addr); die App lauscht
// nur auf localhost, der Header ist also nicht fälschbar.

import { env } from "@/lib/env";
import { type IpRange, ipInRanges, parseRanges } from "@/lib/net/ip";

let cache: { key: string; ranges: IpRange[]; configured: boolean } | null =
	null;

function adminConfig(): { ranges: IpRange[]; configured: boolean } {
	const e = env();
	const list = [...e.ADMIN_NETWORKS, ...e.ADMIN_IP_ALLOWLIST];
	const key = list.join(",");
	if (cache?.key !== key)
		cache = {
			key,
			ranges: parseRanges(list).ranges,
			configured: list.some((x) => x.trim() !== ""),
		};
	return cache;
}

export function adminRanges(): IpRange[] {
	return adminConfig().ranges;
}

/**
 * Darf diese Adresse Plattform-Verwaltung? Ohne Netz-Liste: ja. Eine Liste
 * ohne gültiges Netz sperrt alles (fail closed, Selbstprüfung K6) — die
 * Env-Prüfung lehnt das beim Start schon ab.
 */
export function adminNetworkAllows(ip: string | null | undefined): boolean {
	const { ranges, configured } = adminConfig();
	if (!configured) return true;
	return ipInRanges(ip, ranges);
}
