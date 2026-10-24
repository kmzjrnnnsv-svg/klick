import { CONTRACT, CONTRACT_VERSION } from "@/lib/wallet-link/contract";

// Transport zu Klick: JSON per POST mit Bearer-Token an eine erlaubte
// Herkunft (WALLET_KLICK_ORIGINS). Keine Weiterleitungen, feste Zeitgrenze,
// Antwort höchstens 1 MB; das Token erscheint in keiner Meldung.

export const PATHS = {
	hello: "/api/ingest/wallet/hello",
	batch: "/api/ingest/wallet",
} as const;

export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

export type PostResult =
	| { ok: true; status: number; json: unknown }
	| { ok: false; status: 0; error: string };

export async function postJson(
	origin: string,
	path: string,
	token: string,
	body: unknown,
	opts: { timeoutMs?: number; fetchImpl?: FetchLike } = {},
): Promise<PostResult> {
	const f = opts.fetchImpl ?? fetch;
	try {
		const res = await f(`${origin}${path}`, {
			method: "POST",
			redirect: "error",
			headers: {
				authorization: `Bearer ${token}`,
				"content-type": "application/json",
				"x-wallet-link": `${CONTRACT}/${CONTRACT_VERSION}`,
			},
			body: JSON.stringify(body),
			signal: AbortSignal.timeout(opts.timeoutMs ?? 20_000),
		});
		const text = (await res.text()).slice(0, 1_000_000);
		let json: unknown = null;
		try {
			json = text ? JSON.parse(text) : null;
		} catch {
			json = null;
		}
		return { ok: true, status: res.status, json };
	} catch (e) {
		const msg = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
		return {
			ok: false,
			status: 0,
			error: msg.replaceAll(token, "…").slice(0, 200),
		};
	}
}

export const allowedOrigin = (origin: string, allowed: readonly string[]) =>
	allowed.includes(origin);
