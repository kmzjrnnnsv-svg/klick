import type { ProviderResult } from "@/lib/identity/types";
import type { MsHttpRequest, MsTransport } from "./http";
import { type MsAppConfig, msTokenRequest } from "./token";
import type { MsGet, MsResponse } from "./types";

// Lesender Graph-Zugriff je Tenant für die Identität (Teil D): Token aus
// Client-Credentials (Zertifikat bevorzugt), nur GET auf
// https://graph.microsoft.com (auch nextLink), bei 429 einmal warten
// (Retry-After, höchstens 60 s), sonst „throttled“. Andere Statuscodes gehen
// an den Aufrufer. Token stehen nie in Fehlern oder Protokollen.

const GRAPH_ORIGIN = "https://graph.microsoft.com";
const GRAPH = `${GRAPH_ORIGIN}/v1.0`;
export const MAX_RETRY_WAIT_MS = 60_000;

export function graphUrl(pathOrUrl: string): string | null {
	if (pathOrUrl.startsWith("/")) return `${GRAPH}${pathOrUrl}`;
	try {
		const u = new URL(pathOrUrl);
		if (u.origin !== GRAPH_ORIGIN || u.username || u.password) return null;
		return u.toString();
	} catch {
		return null;
	}
}

// Retry-After in Sekunden (Graph sendet Ganzzahlen); sonst 10 s
export function retryAfterMs(header: string | undefined): number {
	const n = header && /^\d{1,5}$/.test(header.trim()) ? Number(header) : 10;
	return n * 1000;
}

export function createMsGet(
	config: MsAppConfig,
	transport: MsTransport,
	opts: {
		now?: () => number;
		sleep?: (ms: number) => Promise<void>;
	} = {},
): MsGet {
	const now = opts.now ?? Date.now;
	const sleep =
		opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
	const tokens = new Map<string, { token: string; exp: number }>();

	async function token(tenantId: string): Promise<ProviderResult<string>> {
		const hit = tokens.get(tenantId);
		if (hit && hit.exp - 60_000 > now()) return { ok: true, value: hit.token };
		let req: MsHttpRequest;
		try {
			req = msTokenRequest(config, tenantId, now());
		} catch {
			return { ok: false, error: "token_failed" };
		}
		const r = await transport(req);
		if (!r.ok) return r;
		if (r.res.status !== 200)
			return {
				ok: false,
				// AADSTS65001/7000229/700016: im Tenant nicht freigegeben
				error: /AADSTS(65001|7000229|700016)/.test(r.res.body)
					? "consent_missing"
					: "token_failed",
			};
		try {
			const j = JSON.parse(r.res.body) as {
				access_token?: unknown;
				expires_in?: unknown;
			};
			if (typeof j.access_token !== "string")
				return { ok: false, error: "token_failed" };
			const ttl = typeof j.expires_in === "number" ? j.expires_in : 3600;
			tokens.set(tenantId, { token: j.access_token, exp: now() + ttl * 1000 });
			return { ok: true, value: j.access_token };
		} catch {
			return { ok: false, error: "token_failed" };
		}
	}

	return async (tenantId, pathOrUrl) => {
		const url = graphUrl(pathOrUrl);
		if (!url) return { ok: false, error: "host_not_allowed" };
		for (let attempt = 0; attempt < 2; attempt += 1) {
			const t = await token(tenantId);
			if (!t.ok) return t;
			const r = await transport({
				method: "GET",
				url,
				headers: { authorization: `Bearer ${t.value}` },
			});
			if (!r.ok) return r;
			if (r.res.status === 401) tokens.delete(tenantId);
			if (r.res.status !== 429) {
				const res: MsResponse = { status: r.res.status, body: r.res.body };
				return { ok: true, value: res };
			}
			const wait = retryAfterMs(r.res.headers?.["retry-after"]);
			if (attempt > 0 || wait > MAX_RETRY_WAIT_MS) break;
			await sleep(wait);
		}
		return { ok: false, error: "throttled" };
	};
}
