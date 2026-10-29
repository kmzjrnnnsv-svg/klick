import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { logger } from "@/lib/log";
import { orgNetworkAllows } from "@/lib/net/org-network";
import { orgSuspended } from "@/lib/org/suspension";
import { clientIp } from "@/lib/security/ingest";
import { cookieValue } from "@/lib/trust/access";
import { portalCookieName } from "./rules";
import {
	type PortalReader,
	type PublicPortal,
	publicPortal,
	resolvePortalReader,
} from "./service";

// Gemeinsames für die Routen unter /portal/<slug>/…: nur JSON von der
// eigenen Herkunft, Portal aus dem Slug, Leser:in aus dem Cookie.

export const noStore = { "cache-control": "no-store" };

export const json = (status: number, body: unknown) =>
	NextResponse.json(body, { status, headers: noStore });

export function sameOriginJson(req: Request): boolean {
	const origin = req.headers.get("origin");
	return Boolean(
		req.headers.get("content-type")?.startsWith("application/json") &&
			origin === new URL(env().BETTER_AUTH_URL).origin,
	);
}

export async function portalAndReader(
	req: Request,
	slug: string,
): Promise<{ portal: PublicPortal; reader: PortalReader | null } | null> {
	const portal = await publicPortal(slug);
	if (!portal) return null;
	const reader = await resolvePortalReader(
		portal,
		cookieValue(req, portalCookieName(slug)),
	);
	return { portal, reader };
}

// Unerwartete Fehler: JSON mit Referenz statt HTML-500 (wie ingestRoute,
// aber mit den Segmenten der Route).
export function portalRoute<P extends { slug: string }>(
	name: string,
	handler: (req: Request, params: P) => Promise<Response>,
): (req: Request, ctx: { params: Promise<P> }) => Promise<Response> {
	return async (req, ctx) => {
		try {
			const params = await ctx.params;
			// IP-Liste der Organisation (Härtung A5), außer das Portal ist
			// ausgenommen
			const portal = await publicPortal(params.slug);
			if (
				portal &&
				!(await orgNetworkAllows(
					portal.organizationId,
					"policyPortal",
					clientIp(req),
				))
			)
				return json(403, { error: "network_denied" });
			if (portal && (await orgSuspended(portal.organizationId)))
				return json(404, { error: "not_found" });
			return await handler(req, params);
		} catch (err) {
			const ref = randomUUID().slice(0, 8);
			logger.error({ err, route: name, ref }, "policy portal route failed");
			return json(500, { error: "internal", ref });
		}
	};
}
