import { lookup as dnsLookup } from "node:dns/promises";
import https from "node:https";
import { type Resolver, resolvePublic } from "@/lib/security/quick-check/ssrf";

// Eine HTTPS-Anfrage an eine schon geprüfte Adresse (Host steht auf einer
// Liste des Aufrufers): Adresse beim Auflösen geprüft und angeheftet,
// Port 443, TLS-Prüfung an, keine Weiterleitung, Frist und Größengrenze.
// Fehler sind Codes; Kopfzeilen (Token, Schlüssel) tauchen nie darin auf.
// Genutzt von Teams (lib/teams/http.ts) und Web Push (lib/push/http.ts).

export type PinnedError =
	| "blocked_address"
	| "dns"
	| "timeout"
	| "network"
	| "too_large";

export type PinnedResponse = { status: number; body: string };

const defaultResolver: Resolver = (host) =>
	dnsLookup(host, { all: true, verbatim: true });

export async function pinnedHttpsRequest(
	url: URL,
	req: {
		method: "GET" | "POST";
		headers: Record<string, string>;
		body?: string | Buffer;
	},
	opts: { resolve?: Resolver; timeoutMs: number; maxBytes: number },
): Promise<
	{ ok: true; res: PinnedResponse } | { ok: false; error: PinnedError }
> {
	const pinned = await resolvePublic(
		url.hostname,
		opts.resolve ?? defaultResolver,
	);
	if (!pinned.ok)
		return {
			ok: false,
			error: pinned.error === "dns" ? "dns" : "blocked_address",
		};
	const payload =
		req.body === undefined
			? null
			: typeof req.body === "string"
				? Buffer.from(req.body, "utf8")
				: req.body;
	return new Promise((resolve) => {
		let settled = false;
		const finish = (
			r: { ok: true; res: PinnedResponse } | { ok: false; error: PinnedError },
		) => {
			if (settled) return;
			settled = true;
			clearTimeout(deadline);
			resolve(r);
		};
		const request = https.request(
			{
				protocol: "https:",
				hostname: url.hostname,
				port: 443,
				path: `${url.pathname}${url.search}`,
				method: req.method,
				headers: {
					...req.headers,
					...(payload ? { "content-length": String(payload.length) } : {}),
					"accept-encoding": "identity",
				},
				lookup: ((
					_h: string,
					o: { all?: boolean },
					cb: (...a: unknown[]) => void,
				) =>
					o?.all
						? cb(null, [{ address: pinned.address, family: pinned.family }])
						: cb(null, pinned.address, pinned.family)) as never,
				servername: url.hostname,
				rejectUnauthorized: true,
				agent: false,
			},
			(res) => {
				const chunks: Buffer[] = [];
				let size = 0;
				res.on("data", (c: Buffer) => {
					size += c.length;
					if (size > opts.maxBytes) {
						res.destroy();
						finish({ ok: false, error: "too_large" });
						return;
					}
					chunks.push(c);
				});
				res.on("end", () =>
					finish({
						ok: true,
						res: {
							status: res.statusCode ?? 0,
							body: Buffer.concat(chunks).toString("utf8"),
						},
					}),
				);
				res.on("error", () => finish({ ok: false, error: "network" }));
			},
		);
		const deadline = setTimeout(() => {
			request.destroy();
			finish({ ok: false, error: "timeout" });
		}, opts.timeoutMs);
		request.on("error", () => finish({ ok: false, error: "network" }));
		request.end(payload ?? undefined);
	});
}
