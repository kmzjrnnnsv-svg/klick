import {
	MS_HOSTS,
	type MsHttpError,
	type MsHttpRequest,
	type MsHttpResponse,
	type MsTransport,
	msHttpsTransport,
	msUrlAllowed,
} from "@/lib/microsoft/http";
import type { Resolver } from "@/lib/security/quick-check/ssrf";

// Ausgehende Anfragen an Microsoft für Teams (T5): gemeinsamer Transport in
// lib/microsoft/http.ts (nur login.microsoftonline.com und
// graph.microsoft.com, https/443, angeheftete Adresse, keine Weiterleitung),
// hier mit den Grenzen für Teams: Frist 20 s, Antwort ≤ 1 MB.

export const TEAMS_HOSTS = MS_HOSTS;
export type TeamsHttpError = MsHttpError;
export type TeamsHttpRequest = MsHttpRequest;
export type TeamsHttpResponse = MsHttpResponse;
export type TeamsTransport = MsTransport;
export const teamsUrlAllowed = msUrlAllowed;

export function teamsHttpsTransport(
	opts: { resolve?: Resolver; timeoutMs?: number } = {},
): TeamsTransport {
	return msHttpsTransport({
		resolve: opts.resolve,
		timeoutMs: opts.timeoutMs ?? 20_000,
		maxBytes: 1024 * 1024,
	});
}
