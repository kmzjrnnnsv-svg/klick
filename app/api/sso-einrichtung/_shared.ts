import { createHmac } from "node:crypto";
import {
	type ResolvedSetup,
	resolveSetupLink,
	SETUP_COOKIE,
} from "@/lib/auth/sso-setup-link";
import { env } from "@/lib/env";
import { orgNetworkAllows } from "@/lib/net/org-network";
import { orgSuspended } from "@/lib/org/suspension";
import { SlidingWindowLimiter } from "@/lib/rate-limit";
import { clientIp } from "@/lib/security/ingest";
import { cookieValue } from "@/lib/trust/access";

// Gemeinsam für den Einrichtungslink der IT (AP10d): Token aus dem Cookie
// auflösen, IP-Liste der Org (wie Externe) und Sperre prüfen, Grenzen je IP.

export const perIp = new SlidingWindowLimiter(30, 60_000);

export function sameOriginJson(req: Request): boolean {
	const origin = req.headers.get("origin");
	return Boolean(
		req.headers.get("content-type")?.startsWith("application/json") &&
			(!origin || origin === new URL(env().BETTER_AUTH_URL).origin),
	);
}

export function ipHash(ip: string): string {
	return createHmac("sha256", env().BETTER_AUTH_SECRET)
		.update(`sso-setup:${ip}`)
		.digest("hex")
		.slice(0, 32);
}

export async function setupFrom(
	req: Request,
	raw: string | null,
): Promise<
	| { ok: true; setup: ResolvedSetup }
	| { ok: false; status: number; error: string }
> {
	if (!raw) return { ok: false, status: 401, error: "none" };
	const r = await resolveSetupLink(raw);
	if (!r.ok) return { ok: false, status: 401, error: r.error };
	if (
		!(await orgNetworkAllows(r.setup.orgId, "app", clientIp(req), {
			external: true,
		}))
	)
		return { ok: false, status: 403, error: "network_denied" };
	if (await orgSuspended(r.setup.orgId))
		return { ok: false, status: 404, error: "not_found" };
	return r;
}

export const cookieToken = (req: Request) => cookieValue(req, SETUP_COOKIE);
