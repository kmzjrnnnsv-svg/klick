import { lookup as dnsLookup } from "node:dns/promises";
import https from "node:https";
import { isIP } from "node:net";
import type { AiProvider } from "@/db/schema/enums";
import {
	type Resolver,
	resolvePublic,
	validateTargetUrl,
} from "@/lib/security/quick-check/ssrf";

// Ausgehende Anfragen an KI-Anbieter (ADR-032), ohne SDK: nur POST mit JSON
// über node:https, TLS-Prüfung an, keine Weiterleitungen, Adresse beim
// Auflösen geprüft und angeheftet (kein zweites DNS), Gesamtfrist und
// Größenlimit. Der Server kann ausgehend alles erreichen — die Liste der
// Ziele steht deshalb hier: feste Hosts je Anbieter, Azure nur unter den
// Azure-Domains, „OpenAI-kompatibel“ nur https auf 443 mit öffentlicher
// Adresse. Fehler sind Codes; Kopfzeilen (Schlüssel) tauchen nie darin auf.

export const FIXED_HOSTS = {
	anthropic: "api.anthropic.com",
	gemini: "generativelanguage.googleapis.com",
	openai: "api.openai.com",
	mistral: "api.mistral.ai",
} as const satisfies Partial<Record<AiProvider, string>>;

// Ressourcen-Host von Azure OpenAI bzw. Azure AI Foundry
const AZURE_HOST =
	/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.(?:openai\.azure\.com|cognitiveservices\.azure\.com|services\.ai\.azure\.com)$/;

export type AiHttpError =
	| "invalid_url"
	| "host_not_allowed"
	| "blocked_address"
	| "dns"
	| "timeout"
	| "network"
	| "too_large";

export type AiHttpRequest = {
	url: string;
	headers: Record<string, string>;
	body: unknown;
};

export type AiHttpResponse = { status: number; body: string };

export type AiTransport = (
	provider: AiProvider,
	req: AiHttpRequest,
) => Promise<
	{ ok: true; res: AiHttpResponse } | { ok: false; error: AiHttpError }
>;

// Darf diese Adresse für den Anbieter angefragt werden? (ohne DNS)
export function aiTargetAllowed(
	provider: AiProvider,
	raw: string,
):
	| { ok: true; url: URL }
	| { ok: false; error: "invalid_url" | "host_not_allowed" } {
	const v = validateTargetUrl(raw);
	if (!v.ok)
		return {
			ok: false,
			error: v.error === "invalid_url" ? "invalid_url" : "host_not_allowed",
		};
	const url = v.url;
	if (url.protocol !== "https:" || (url.port && url.port !== "443"))
		return { ok: false, error: "host_not_allowed" };
	const host = url.hostname.toLowerCase();
	if (provider === "azure_openai")
		return AZURE_HOST.test(host)
			? { ok: true, url }
			: { ok: false, error: "host_not_allowed" };
	if (provider === "openai_compatible")
		// eigene Adresse: Form prüft validateTargetUrl, die Adresse resolvePublic
		return isIP(host) || host.includes(".")
			? { ok: true, url }
			: { ok: false, error: "host_not_allowed" };
	return host === FIXED_HOSTS[provider]
		? { ok: true, url }
		: { ok: false, error: "host_not_allowed" };
}

const MAX_BYTES = 2 * 1024 * 1024;
const TIMEOUT_MS = 60_000;

const defaultResolver: Resolver = (host) =>
	dnsLookup(host, { all: true, verbatim: true });

export function httpsTransport(
	opts: {
		resolve?: Resolver;
		// nur Tests: eigene Zertifizierungsstelle, Frist, Größe
		ca?: string | Buffer;
		timeoutMs?: number;
		maxBytes?: number;
		// nur Tests: Adresse und Port des Stub-Servers statt DNS und 443
		pinForTests?: { address: string; family: 4 | 6; port: number };
	} = {},
): AiTransport {
	const timeoutMs = opts.timeoutMs ?? TIMEOUT_MS;
	const maxBytes = opts.maxBytes ?? MAX_BYTES;
	return async (provider, req) => {
		const t = aiTargetAllowed(provider, req.url);
		if (!t.ok) return t;
		const pinned = opts.pinForTests
			? ({ ok: true, ...opts.pinForTests } as const)
			: await resolvePublic(t.url.hostname, opts.resolve ?? defaultResolver);
		if (!pinned.ok)
			return {
				ok: false,
				error: pinned.error === "dns" ? "dns" : "blocked_address",
			};
		const payload = Buffer.from(JSON.stringify(req.body), "utf8");
		return new Promise((resolve) => {
			let settled = false;
			const finish = (
				r:
					| { ok: true; res: AiHttpResponse }
					| { ok: false; error: AiHttpError },
			) => {
				if (settled) return;
				settled = true;
				clearTimeout(deadline);
				resolve(r);
			};
			const request = https.request(
				{
					protocol: "https:",
					hostname: t.url.hostname,
					port: opts.pinForTests?.port ?? 443,
					path: `${t.url.pathname}${t.url.search}`,
					method: "POST",
					headers: {
						...req.headers,
						"content-type": "application/json",
						"content-length": String(payload.length),
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
					servername: isIP(t.url.hostname) ? undefined : t.url.hostname,
					rejectUnauthorized: true,
					...(opts.ca ? { ca: opts.ca } : {}),
					agent: false,
				},
				(res) => {
					const chunks: Buffer[] = [];
					let size = 0;
					res.on("data", (c: Buffer) => {
						size += c.length;
						if (size > maxBytes) {
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
			request.end(payload);
		});
	};
}
