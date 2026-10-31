import { and, desc, eq, isNull } from "drizzle-orm";
import { siteTunnels } from "@/db/schema";

import { getOrgSummary } from "@/lib/auth/org";
import { decryptJson } from "@/lib/crypto/org-dek";
import {
	insertSiteLink,
	SITE_LINK_SCOPE,
	type SiteSecret,
	secretAad,
} from "@/lib/db/site-tunnels";
import { mutateOrg, type OrgCtx, readOrg } from "@/lib/db/with-org";
import { resolveToken } from "@/lib/db/with-token";
import { siteConfig } from "./agent-client";
import { type TunnelValues, tunnelValues, wireguardConfig } from "./config";
import { type TunnelState, tunnelState } from "./rules";
import { isSiteVendor, type SiteVendor } from "./vendors";

// Standort-Tunnel aus Sicht der Org (ADR-033): Liste unter Einstellungen >
// Netzwerk, Link für die IT durch Inhaber:innen, Auflösen des Links für die
// IT-Seite /standort (ADR-017: Fragment → Cookie, nur lesen). Anlegen und
// Abbauen nur durch den Klick-Betrieb (lib/db/site-tunnels.ts).

export type TunnelView = {
	id: string;
	name: string;
	vendor: SiteVendor;
	tech: "ipsec" | "wireguard";
	peerIp: string;
	customerNets: string[];
	transferNet: string | null;
	state: TunnelState;
	connectedAt: string | null;
	lastHandshakeAt: string | null;
	lastError: string | null;
	createdAt: string;
};

export function toView(
	row: typeof siteTunnels.$inferSelect,
	now: Date,
): TunnelView {
	return {
		id: row.id,
		name: row.name,
		vendor: isSiteVendor(row.vendor) ? row.vendor : "other",
		tech: row.tech,
		peerIp: row.peerIp,
		customerNets: row.customerNets,
		transferNet: row.transferNet,
		state: tunnelState(row, now),
		connectedAt: row.connectedAt?.toISOString() ?? null,
		lastHandshakeAt: row.lastHandshakeAt?.toISOString() ?? null,
		lastError: row.lastError,
		createdAt: row.createdAt.toISOString(),
	};
}

/** Aktive Tunnel der Org (ohne Geheimnisse). */
export async function siteTunnelsForOrg(
	ctx: OrgCtx,
	now = new Date(),
): Promise<TunnelView[]> {
	const rows = await readOrg(ctx, (tx) =>
		tx
			.select()
			.from(siteTunnels)
			.where(
				and(
					eq(siteTunnels.organizationId, ctx.orgId),
					isNull(siteTunnels.removedAt),
				),
			)
			.orderBy(desc(siteTunnels.createdAt)),
	);
	return rows.map((r) => toView(r, now));
}

/** Link für die IT durch eine Inhaber:in (Action prüft Recht und Step-up). */
export async function issueSiteLinkAsOwner(
	ctx: OrgCtx & { userId: string },
	id: string,
) {
	return mutateOrg(ctx, async (tx) => {
		const link = await insertSiteLink(tx, ctx.orgId, id, ctx.userId);
		if (!link) return { result: null, audit: [] };
		return {
			result: link,
			audit: {
				action: "site_tunnel.link_issued",
				target: `site_tunnel:${id}`,
				after: { via: "owner", expiresAt: link.expiresAt.toISOString() },
			},
		};
	});
}

export type SiteSetupView = {
	orgName: string;
	tunnel: TunnelView;
	values: TunnelValues;
	expiresAt: string;
};

export type ResolvedSite = {
	orgId: string;
	tokenId: string;
	tunnelId: string;
	view: SiteSetupView;
};

/** Link bzw. Cookie auflösen: nur gültige Links aktiver Tunnel. */
export async function resolveSiteLink(
	raw: string,
	now = new Date(),
): Promise<{ ok: true; site: ResolvedSite } | { ok: false; error: string }> {
	const r = await resolveToken(raw, "site_setup", now);
	if (!r.ok) return { ok: false, error: r.error };
	const t = r.token;
	if (
		t.subjectType !== "site_tunnel" ||
		!t.subjectId ||
		!t.scopes.includes(SITE_LINK_SCOPE)
	)
		return { ok: false, error: "invalid" };
	const tunnelId = t.subjectId;
	const [row] = await readOrg({ orgId: t.organizationId, userId: null }, (tx) =>
		tx
			.select()
			.from(siteTunnels)
			.where(
				and(
					eq(siteTunnels.organizationId, t.organizationId),
					eq(siteTunnels.id, tunnelId),
				),
			)
			.limit(1),
	);
	if (!row || row.removedAt) return { ok: false, error: "revoked" };
	const cfg = siteConfig();
	if (!cfg.publicIp) return { ok: false, error: "not_configured" };
	const org = await getOrgSummary(t.organizationId);
	return {
		ok: true,
		site: {
			orgId: t.organizationId,
			tokenId: t.id,
			tunnelId,
			view: {
				orgName: org?.name ?? "",
				tunnel: toView(row, now),
				values: tunnelValues(row, {
					publicIp: cfg.publicIp,
					wgPublicKey: cfg.wgPublicKey,
					host: cfg.host,
				}),
				expiresAt: t.expiresAt.toISOString(),
			},
		},
	};
}

/**
 * Geheimnis für die IT (Schlüssel zeigen, WireGuard-Datei). Jeder Abruf steht
 * in der Kette der Org (`site_tunnel.secret_viewed`, via: site_link).
 */
export async function revealSiteSecret(
	site: ResolvedSite,
	meta: { ip: string | null; userAgent: string | null },
): Promise<
	| { tech: "ipsec"; psk: string }
	| { tech: "wireguard"; config: string; publicKey: string }
	| null
> {
	return mutateOrg(
		{ orgId: site.orgId, userId: null, ip: meta.ip, userAgent: meta.userAgent },
		async (tx) => {
			const [row] = await tx
				.select({
					secretEnc: siteTunnels.secretEnc,
					removedAt: siteTunnels.removedAt,
				})
				.from(siteTunnels)
				.where(
					and(
						eq(siteTunnels.organizationId, site.orgId),
						eq(siteTunnels.id, site.tunnelId),
					),
				);
			if (!row || row.removedAt) return { result: null, audit: [] };
			const secret = await decryptJson<SiteSecret>(
				tx,
				site.orgId,
				row.secretEnc,
				secretAad(site.tunnelId),
			);
			if (!secret) return { result: null, audit: [] };
			const result =
				"psk" in secret
					? { tech: "ipsec" as const, psk: secret.psk }
					: {
							tech: "wireguard" as const,
							publicKey: secret.publicKey,
							config: wireguardConfig(site.view.values, secret),
						};
			return {
				result,
				audit: {
					action: "site_tunnel.secret_viewed",
					target: `site_tunnel:${site.tunnelId}`,
					after: { via: "site_link", tokenId: site.tokenId },
				},
			};
		},
	);
}
