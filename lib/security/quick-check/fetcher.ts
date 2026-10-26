import { lookup as dnsLookup } from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import type { TLSSocket } from "node:tls";
import {
	type Resolver,
	resolvePublic,
	type TargetError,
	validateTargetUrl,
} from "./ssrf";

// Abruf für den Schnellcheck: verbindet sich ausschließlich mit der vorab
// geprüften Adresse (gepinnter Lookup, SNI/Host bleiben der Name), folgt
// Redirects nur nach erneuter Prüfung, hält ein Budget aus Anfragen, Zeit
// und Bytes ein. Zertifikatsfehler brechen nicht ab, sie werden Befunde.

export type TlsInfo = {
	protocol: string | null;
	validTo: string | null;
	issuer: string | null;
	authorized: boolean;
	authError: string | null;
};

export type FetchResult = {
	url: string;
	status: number;
	headers: Record<string, string | string[] | undefined>;
	body: string;
	truncated: boolean;
	tls: TlsInfo | null;
	redirects: string[];
};

export type FetchBudget = { requests: number; deadline: number };

export type FetchError =
	| TargetError
	| "budget"
	| "timeout"
	| "network"
	| "redirects";

export const QUICK_CHECK_UA =
	"Klick-Schnellcheck/1 (passiv; +https://raza.work/vertrauen)";

const defaultResolver: Resolver = (host) =>
	dnsLookup(host, { all: true, verbatim: true });

function once(
	url: URL,
	address: string,
	family: 4 | 6,
	opts: { method: "GET" | "HEAD"; maxBytes: number; timeoutMs: number },
): Promise<Omit<FetchResult, "redirects">> {
	const mod = url.protocol === "https:" ? https : http;
	return new Promise((resolve, reject) => {
		let tls: TlsInfo | null = null;
		// Gesamtfrist je Anfrage: `timeout` unten misst nur Pausen; ein Server,
		// der Byte für Byte tröpfelt, hielte sonst ewig fest (Selbstprüfung S6)
		let timedOut = false;
		const deadline = setTimeout(() => {
			timedOut = true;
			req.destroy(new Error("timeout"));
		}, opts.timeoutMs);
		const fail = (e: unknown) => {
			clearTimeout(deadline);
			reject(timedOut ? new Error("timeout") : e);
		};
		const req = mod.request(
			{
				protocol: url.protocol,
				hostname: url.hostname,
				port: url.port || (url.protocol === "https:" ? 443 : 80),
				path: `${url.pathname}${url.search}`,
				method: opts.method,
				headers: {
					"user-agent": QUICK_CHECK_UA,
					accept: "*/*",
					"accept-encoding": "identity",
				},
				// gepinnt: nie erneut auflösen
				lookup: ((
					_h: string,
					o: { all?: boolean },
					cb: (...a: unknown[]) => void,
				) =>
					o?.all
						? cb(null, [{ address, family }])
						: cb(null, address, family)) as never,
				servername: url.protocol === "https:" ? url.hostname : undefined,
				rejectUnauthorized: false,
				timeout: opts.timeoutMs,
				agent: false,
			},
			(res) => {
				const sock = res.socket as TLSSocket;
				if (
					url.protocol === "https:" &&
					typeof sock.getPeerCertificate === "function"
				) {
					const cert = sock.getPeerCertificate();
					tls = {
						protocol: sock.getProtocol?.() ?? null,
						validTo: cert?.valid_to ?? null,
						issuer: cert?.issuer
							? String(cert.issuer.O ?? cert.issuer.CN ?? "")
							: null,
						authorized: sock.authorized,
						authError: sock.authorizationError
							? String(sock.authorizationError)
							: null,
					};
				}
				const chunks: Buffer[] = [];
				let size = 0;
				let truncated = false;
				res.on("data", (c: Buffer) => {
					if (truncated) return;
					size += c.length;
					if (size > opts.maxBytes) {
						truncated = true;
						chunks.push(
							c.subarray(0, Math.max(0, c.length - (size - opts.maxBytes))),
						);
						res.destroy();
						return;
					}
					chunks.push(c);
				});
				const done = () => {
					clearTimeout(deadline);
					if (timedOut) return reject(new Error("timeout"));
					resolve({
						url: url.toString(),
						status: res.statusCode ?? 0,
						headers: res.headers,
						body: Buffer.concat(chunks).toString("utf8"),
						truncated,
						tls,
					});
				};
				res.on("end", done);
				res.on("close", done);
				res.on("error", (e) => (truncated ? done() : fail(e)));
			},
		);
		req.on("timeout", () => req.destroy(new Error("timeout")));
		req.on("error", fail);
		req.end();
	});
}

export async function safeFetch(
	raw: string,
	opts: {
		budget: FetchBudget;
		maxBytes?: number;
		method?: "GET" | "HEAD";
		resolve?: Resolver;
		maxRedirects?: number;
	},
): Promise<{ ok: true; res: FetchResult } | { ok: false; error: FetchError }> {
	const redirects: string[] = [];
	let current = raw;
	for (let hop = 0; hop <= (opts.maxRedirects ?? 5); hop++) {
		const left = opts.budget.deadline - Date.now();
		if (opts.budget.requests <= 0 || left <= 0)
			return { ok: false, error: "budget" };
		const v = validateTargetUrl(current);
		if (!v.ok) return v;
		const r = await resolvePublic(
			v.url.hostname,
			opts.resolve ?? defaultResolver,
		);
		if (!r.ok) return r;
		opts.budget.requests -= 1;
		let res: Omit<FetchResult, "redirects">;
		try {
			res = await once(v.url, r.address, r.family, {
				method: opts.method ?? "GET",
				maxBytes: opts.maxBytes ?? 2 * 1024 * 1024,
				timeoutMs: Math.min(10_000, left),
			});
		} catch (e) {
			return {
				ok: false,
				error:
					e instanceof Error && e.message === "timeout" ? "timeout" : "network",
			};
		}
		const loc = res.headers.location;
		if (
			[301, 302, 303, 307, 308].includes(res.status) &&
			typeof loc === "string"
		) {
			redirects.push(current);
			current = new URL(loc, v.url).toString();
			continue;
		}
		return { ok: true, res: { ...res, redirects } };
	}
	return { ok: false, error: "redirects" };
}
