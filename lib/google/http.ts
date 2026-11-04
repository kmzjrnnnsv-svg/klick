import { pinnedHttpsRequest } from "@/lib/net/pinned-https";
import type { Resolver } from "@/lib/security/quick-check/ssrf";

// Ausgehende Anfragen an Google (Identität, Teil D I3): nur
// oauth2.googleapis.com (Token) und admin.googleapis.com (Directory API),
// https auf 443, TLS-Prüfung an, keine Weiterleitung, Adresse beim Auflösen
// geprüft und angeheftet. Fehler sind Codes; Token tauchen nie darin auf.

export const GOOGLE_HOSTS = [
	"oauth2.googleapis.com",
	"admin.googleapis.com",
] as const;

export type GoogleHttpError =
	| "host_not_allowed"
	| "blocked_address"
	| "dns"
	| "timeout"
	| "network"
	| "too_large";

export type GoogleHttpRequest = {
	method: "GET" | "POST";
	url: string;
	headers: Record<string, string>;
	body?: string;
};

export type GoogleHttpResponse = {
	status: number;
	body: string;
	headers?: Record<string, string>;
};

export type GoogleTransport = (
	req: GoogleHttpRequest,
) => Promise<
	{ ok: true; res: GoogleHttpResponse } | { ok: false; error: GoogleHttpError }
>;

export function googleUrlAllowed(raw: string): URL | null {
	let url: URL;
	try {
		url = new URL(raw);
	} catch {
		return null;
	}
	if (url.protocol !== "https:" || url.port !== "") return null;
	if (url.username || url.password) return null;
	return (GOOGLE_HOSTS as readonly string[]).includes(url.hostname)
		? url
		: null;
}

// Seiten mit bis zu 500 Konten: 60 s, 16 MB je Seite
export function googleHttpsTransport(
	opts: { resolve?: Resolver; timeoutMs?: number; maxBytes?: number } = {},
): GoogleTransport {
	return async (req) => {
		const url = googleUrlAllowed(req.url);
		if (!url) return { ok: false, error: "host_not_allowed" };
		return pinnedHttpsRequest(
			url,
			{
				method: req.method,
				headers: { ...req.headers, accept: "application/json" },
				body: req.body,
			},
			{
				resolve: opts.resolve,
				timeoutMs: opts.timeoutMs ?? 60_000,
				maxBytes: opts.maxBytes ?? 16 * 1024 * 1024,
			},
		);
	};
}
