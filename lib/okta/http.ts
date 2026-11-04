import { pinnedHttpsRequest } from "@/lib/net/pinned-https";
import type { Resolver } from "@/lib/security/quick-check/ssrf";

// Ausgehende Anfragen an Okta (Identität, Teil D I4): nur an die eingetragene
// Okta-Domain der Kundin, und nur, wenn sie zu Okta gehört (*.okta.com,
// *.oktapreview.com, *.okta-emea.com — keine eigenen Domains, sonst wäre der
// Abruf ein Weg ins interne Netz). https auf 443, TLS-Prüfung an, keine
// Weiterleitung, Adresse beim Auflösen geprüft und angeheftet. Das Token
// steht nur in der Kopfzeile, nie in Fehlern.

const OKTA_DOMAIN =
	/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.(?:okta|oktapreview|okta-emea)\.com$/;

export function oktaDomainValid(domain: string): boolean {
	return OKTA_DOMAIN.test(domain);
}

// „https://firma.okta.com/“, „firma.okta.com“ oder ein OIDC-Issuer
// („https://firma.okta.com/oauth2/default“) → „firma.okta.com“
export function oktaDomainOf(input: string): string | null {
	const raw = input.trim().toLowerCase();
	if (!raw) return null;
	let host = raw;
	if (raw.includes("://")) {
		try {
			const u = new URL(raw);
			if (u.protocol !== "https:" || u.port || u.username || u.password)
				return null;
			host = u.hostname;
		} catch {
			return null;
		}
	} else host = raw.replace(/\/.*$/, "");
	return oktaDomainValid(host) ? host : null;
}

export type OktaHttpError =
	| "host_not_allowed"
	| "blocked_address"
	| "dns"
	| "timeout"
	| "network"
	| "too_large";

export type OktaHttpRequest = {
	url: string;
	headers: Record<string, string>;
};

export type OktaHttpResponse = {
	status: number;
	body: string;
	headers?: Record<string, string>;
};

export type OktaTransport = (
	req: OktaHttpRequest,
) => Promise<
	{ ok: true; res: OktaHttpResponse } | { ok: false; error: OktaHttpError }
>;

// Nur GET an genau diese Okta-Domain
export function oktaUrlAllowed(raw: string, domain: string): URL | null {
	if (!oktaDomainValid(domain)) return null;
	let url: URL;
	try {
		url = new URL(raw);
	} catch {
		return null;
	}
	if (url.protocol !== "https:" || url.port !== "") return null;
	if (url.username || url.password) return null;
	return url.hostname === domain ? url : null;
}

// Seiten mit bis zu 200 Konten: 60 s, 16 MB je Seite
export function oktaHttpsTransport(
	domain: string,
	opts: { resolve?: Resolver; timeoutMs?: number; maxBytes?: number } = {},
): OktaTransport {
	return async (req) => {
		const url = oktaUrlAllowed(req.url, domain);
		if (!url) return { ok: false, error: "host_not_allowed" };
		return pinnedHttpsRequest(
			url,
			{
				method: "GET",
				headers: { ...req.headers, accept: "application/json" },
			},
			{
				resolve: opts.resolve,
				timeoutMs: opts.timeoutMs ?? 60_000,
				maxBytes: opts.maxBytes ?? 16 * 1024 * 1024,
			},
		);
	};
}
