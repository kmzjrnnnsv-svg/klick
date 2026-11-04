import type { ProviderResult } from "@/lib/identity/types";
import { MAX_RETRY_WAIT_MS } from "@/lib/microsoft/graph-client";
import { type OktaTransport, oktaUrlAllowed } from "./http";

// Lesender Zugriff auf die Okta Management API (Teil D I4) mit einem
// API-Token einer Person mit Leserechten („Read-only Administrator“). Nur
// GET an die eingetragene Okta-Domain, Weiterblättern über den Link-Header
// nur auf demselben Host. Bei 429 einmal warten (bis X-Rate-Limit-Reset bzw.
// Retry-After, höchstens 60 s), sonst „throttled“. 401 = Token ungültig oder
// abgelaufen, 403 = Recht fehlt. Das Token steht nie in Fehlern.

export type OktaResponse = {
	status: number;
	body: string;
	next: string | null;
};
export type OktaGet = (
	pathOrUrl: string,
) => Promise<ProviderResult<OktaResponse>>;

// Nächste Seite aus dem Link-Header (rel="next"), nur gleicher Host
export function nextLinkOf(
	link: string | undefined,
	domain: string,
): string | null {
	if (!link) return null;
	for (const part of link.split(",")) {
		const m = /<([^>]+)>\s*;\s*rel="?next"?/i.exec(part.trim());
		if (m?.[1]) return oktaUrlAllowed(m[1], domain) ? m[1] : null;
	}
	return null;
}

// Wartezeit nach 429: X-Rate-Limit-Reset (Epoche in Sekunden) oder
// Retry-After (Sekunden); unbekannt = 10 s
export function oktaWaitMs(
	headers: Record<string, string> | undefined,
	nowMs: number,
): number {
	const reset = headers?.["x-rate-limit-reset"]?.trim();
	if (reset && /^\d{9,11}$/.test(reset))
		return Math.max(0, Number(reset) * 1000 - nowMs) + 1000;
	const after = headers?.["retry-after"]?.trim();
	if (after && /^\d{1,5}$/.test(after)) return Number(after) * 1000;
	return 10_000;
}

export function createOktaGet(
	domain: string,
	token: string,
	transport: OktaTransport,
	opts: {
		now?: () => number;
		sleep?: (ms: number) => Promise<void>;
	} = {},
): OktaGet {
	const now = opts.now ?? Date.now;
	const sleep =
		opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
	const origin = `https://${domain}`;
	return async (pathOrUrl) => {
		const url = pathOrUrl.startsWith("/") ? `${origin}${pathOrUrl}` : pathOrUrl;
		if (!oktaUrlAllowed(url, domain))
			return { ok: false, error: "host_not_allowed" };
		for (let attempt = 0; attempt < 2; attempt += 1) {
			const r = await transport({
				url,
				headers: { authorization: `SSWS ${token}` },
			});
			if (!r.ok) return r;
			if (r.res.status === 401) return { ok: false, error: "consent_missing" };
			if (r.res.status !== 429)
				return {
					ok: true,
					value: {
						status: r.res.status,
						body: r.res.body,
						next: nextLinkOf(r.res.headers?.link, domain),
					},
				};
			const wait = oktaWaitMs(r.res.headers, now());
			if (attempt > 0 || wait > MAX_RETRY_WAIT_MS) break;
			await sleep(wait);
		}
		return { ok: false, error: "throttled" };
	};
}
