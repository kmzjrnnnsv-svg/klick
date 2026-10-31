import { pinnedHttpsRequest } from "@/lib/net/pinned-https";
import type { Resolver } from "@/lib/security/quick-check/ssrf";

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

export function teamsHttpsTransport(
	opts: { resolve?: Resolver; timeoutMs?: number } = {},
): TeamsTransport {
	return async (req) => {
		const url = teamsUrlAllowed(req.url);
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
				timeoutMs: opts.timeoutMs ?? TIMEOUT_MS,
				maxBytes: MAX_BYTES,
			},
		);
	};
}
