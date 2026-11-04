import type { ProviderResult } from "@/lib/identity/types";
import { MAX_RETRY_WAIT_MS, retryAfterMs } from "@/lib/microsoft/graph-client";
import type { GoogleHttpRequest, GoogleTransport } from "./http";
import { type GoogleServiceAccount, googleTokenRequest } from "./token";

// Lesender Zugriff auf die Google Directory API (Teil D I3): Token je
// Admin-Adresse (domänenweite Delegierung), nur GET auf
// https://admin.googleapis.com, bei 429 einmal warten (höchstens 60 s),
// sonst „throttled“. Andere Statuscodes gehen an den Aufrufer. Token
// stehen nie in Fehlern oder Protokollen.

const ADMIN_ORIGIN = "https://admin.googleapis.com";

export type GoogleResponse = { status: number; body: string };
export type GoogleGet = (
	subject: string,
	pathOrUrl: string,
) => Promise<ProviderResult<GoogleResponse>>;

export function adminUrl(pathOrUrl: string): string | null {
	if (pathOrUrl.startsWith("/")) return `${ADMIN_ORIGIN}${pathOrUrl}`;
	try {
		const u = new URL(pathOrUrl);
		if (u.origin !== ADMIN_ORIGIN || u.username || u.password) return null;
		return u.toString();
	} catch {
		return null;
	}
}

// Fehler des Token-Endpunkts: Delegierung fehlt bzw. Bereiche fehlen
// (unauthorized_client, access_denied) oder die Admin-Adresse taugt nicht
// (invalid_grant: unbekannt, kein Admin, gesperrt)
export function tokenErrorOf(
	body: string,
): "consent_missing" | "forbidden" | "token_failed" {
	if (/"(unauthorized_client|access_denied)"/.test(body))
		return "consent_missing";
	if (/"invalid_grant"/.test(body)) return "forbidden";
	return "token_failed";
}

export function createGoogleGet(
	sa: GoogleServiceAccount,
	transport: GoogleTransport,
	opts: {
		now?: () => number;
		sleep?: (ms: number) => Promise<void>;
	} = {},
): GoogleGet {
	const now = opts.now ?? Date.now;
	const sleep =
		opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
	const tokens = new Map<string, { token: string; exp: number }>();

	async function token(subject: string): Promise<ProviderResult<string>> {
		const hit = tokens.get(subject);
		if (hit && hit.exp - 60_000 > now()) return { ok: true, value: hit.token };
		let req: GoogleHttpRequest;
		try {
			req = googleTokenRequest(sa, subject, now());
		} catch {
			return { ok: false, error: "token_failed" };
		}
		const r = await transport(req);
		if (!r.ok) return r;
		if (r.res.status !== 200)
			return { ok: false, error: tokenErrorOf(r.res.body) };
		try {
			const j = JSON.parse(r.res.body) as {
				access_token?: unknown;
				expires_in?: unknown;
			};
			if (typeof j.access_token !== "string")
				return { ok: false, error: "token_failed" };
			const ttl = typeof j.expires_in === "number" ? j.expires_in : 3600;
			tokens.set(subject, { token: j.access_token, exp: now() + ttl * 1000 });
			return { ok: true, value: j.access_token };
		} catch {
			return { ok: false, error: "token_failed" };
		}
	}

	return async (subject, pathOrUrl) => {
		const url = adminUrl(pathOrUrl);
		if (!url) return { ok: false, error: "host_not_allowed" };
		for (let attempt = 0; attempt < 2; attempt += 1) {
			const t = await token(subject);
			if (!t.ok) return t;
			const r = await transport({
				method: "GET",
				url,
				headers: { authorization: `Bearer ${t.value}` },
			});
			if (!r.ok) return r;
			if (r.res.status === 401) tokens.delete(subject);
			if (r.res.status !== 429) {
				return { ok: true, value: { status: r.res.status, body: r.res.body } };
			}
			const wait = retryAfterMs(r.res.headers?.["retry-after"]);
			if (attempt > 0 || wait > MAX_RETRY_WAIT_MS) break;
			await sleep(wait);
		}
		return { ok: false, error: "throttled" };
	};
}
