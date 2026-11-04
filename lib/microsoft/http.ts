import { pinnedHttpsRequest } from "@/lib/net/pinned-https";
import type { Resolver } from "@/lib/security/quick-check/ssrf";

// Ausgehende Anfragen an Microsoft (Teams, Identität): nur
// login.microsoftonline.com und graph.microsoft.com, https auf 443,
// TLS-Prüfung an, keine Weiterleitung, Adresse beim Auflösen geprüft und
// angeheftet. Fehler sind Codes; Kopfzeilen (Token) tauchen nie darin auf.

export const MS_HOSTS = [
	"login.microsoftonline.com",
	"graph.microsoft.com",
] as const;

export type MsHttpError =
	| "host_not_allowed"
	| "blocked_address"
	| "dns"
	| "timeout"
	| "network"
	| "too_large";

export type MsHttpRequest = {
	method: "GET" | "POST";
	url: string;
	headers: Record<string, string>;
	// fertiger Rumpf (JSON oder Formular), Content-Type in headers
	body?: string;
};

export type MsHttpResponse = {
	status: number;
	body: string;
	// nur Retry-After und Link (lib/net/pinned-https.ts)
	headers?: Record<string, string>;
};

export type MsTransport = (
	req: MsHttpRequest,
) => Promise<
	{ ok: true; res: MsHttpResponse } | { ok: false; error: MsHttpError }
>;

export function msUrlAllowed(raw: string): URL | null {
	let url: URL;
	try {
		url = new URL(raw);
	} catch {
		return null;
	}
	if (url.protocol !== "https:" || url.port !== "") return null;
	if (url.username || url.password) return null;
	return (MS_HOSTS as readonly string[]).includes(url.hostname) ? url : null;
}

// Teams: 20 s, 1 MB. Identität liest Seiten mit bis zu 999 Konten: 60 s,
// 16 MB je Seite.
export function msHttpsTransport(
	opts: { resolve?: Resolver; timeoutMs?: number; maxBytes?: number } = {},
): MsTransport {
	return async (req) => {
		const url = msUrlAllowed(req.url);
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
				timeoutMs: opts.timeoutMs ?? 20_000,
				maxBytes: opts.maxBytes ?? 1024 * 1024,
			},
		);
	};
}
