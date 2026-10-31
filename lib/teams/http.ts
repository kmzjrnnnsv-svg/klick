import { lookup as dnsLookup } from "node:dns/promises";
import https from "node:https";
import { type Resolver, resolvePublic } from "@/lib/security/quick-check/ssrf";

// Ausgehende Anfragen an Microsoft (T5): nur login.microsoftonline.com und
// graph.microsoft.com, https auf 443, TLS-Prüfung an, keine Weiterleitung,
// Adresse beim Auflösen geprüft und angeheftet, Frist 20 s, Antwort ≤ 1 MB.
// Fehler sind Codes; Kopfzeilen (Token) tauchen nie darin auf.

export const TEAMS_HOSTS = [
	"login.microsoftonline.com",
	"graph.microsoft.com",
] as const;

export type TeamsHttpError =
	| "host_not_allowed"
	| "blocked_address"
	| "dns"
	| "timeout"
	| "network"
	| "too_large";

export type TeamsHttpRequest = {
	method: "GET" | "POST";
	url: string;
	headers: Record<string, string>;
	// fertiger Rumpf (JSON oder Formular), Content-Type in headers
	body?: string;
};

export type TeamsHttpResponse = { status: number; body: string };

export type TeamsTransport = (
	req: TeamsHttpRequest,
) => Promise<
	{ ok: true; res: TeamsHttpResponse } | { ok: false; error: TeamsHttpError }
>;

export function teamsUrlAllowed(raw: string): URL | null {
	let url: URL;
	try {
		url = new URL(raw);
	} catch {
		return null;
	}
	if (url.protocol !== "https:" || url.port !== "") return null;
	if (url.username || url.password) return null;
	return (TEAMS_HOSTS as readonly string[]).includes(url.hostname) ? url : null;
}

const MAX_BYTES = 1024 * 1024;
const TIMEOUT_MS = 20_000;

const defaultResolver: Resolver = (host) =>
	dnsLookup(host, { all: true, verbatim: true });

export function teamsHttpsTransport(
	opts: { resolve?: Resolver; timeoutMs?: number } = {},
): TeamsTransport {
	const timeoutMs = opts.timeoutMs ?? TIMEOUT_MS;
	return async (req) => {
		const url = teamsUrlAllowed(req.url);
		if (!url) return { ok: false, error: "host_not_allowed" };
		const pinned = await resolvePublic(
			url.hostname,
			opts.resolve ?? defaultResolver,
		);
		if (!pinned.ok)
			return {
				ok: false,
				error: pinned.error === "dns" ? "dns" : "blocked_address",
			};
		const payload = req.body ? Buffer.from(req.body, "utf8") : null;
		return new Promise((resolve) => {
			let settled = false;
			const finish = (
				r:
					| { ok: true; res: TeamsHttpResponse }
					| { ok: false; error: TeamsHttpError },
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
						accept: "application/json",
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
						if (size > MAX_BYTES) {
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
			}, timeoutMs);
			request.on("error", () => finish({ ok: false, error: "network" }));
			request.end(payload ?? undefined);
		});
	};
}
