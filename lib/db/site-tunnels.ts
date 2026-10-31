import { randomUUID } from "node:crypto";
import { and, eq, isNotNull, isNull, or, sql } from "drizzle-orm";
import { type DbTx, globalDb } from "@/db";
import {
	accessTokens,
	orgSettings,
	type SiteTunnel,
	siteTunnels,
} from "@/db/schema";
import { type Actor, audit } from "@/lib/audit";
import { decryptJson, encryptJson, fieldAad } from "@/lib/crypto/org-dek";
import { parseCidr } from "@/lib/net/ip";
import { networkPolicyOf } from "@/lib/net/network-policy";
import { notify } from "@/lib/notifications/notify";
import { orgOwnerIds } from "@/lib/org/queries";
import { newToken } from "@/lib/security/tokens";
import {
	type IpsecSecret,
	newIpsecSecret,
	newWireguardSecret,
	type WireguardSecret,
} from "@/lib/site-tunnels/keys";
import {
	checkCustomerNets,
	checkPeerIp,
	effectiveNets,
	MAX_TUNNELS_PER_ORG,
	type NetConflict,
	rangesOverlap,
	type SiteTech,
	transferFor,
} from "@/lib/site-tunnels/rules";
import type { SiteVendor } from "@/lib/site-tunnels/vendors";

// Standort-Tunnel auf Plattform-Seite (ADR-033): anlegen, abbauen, Link für
// die IT, Abgleich mit dem Netz-Agenten. Plattform-Kontext, weil sich Netze
// und Gegenstellen über alle Orgs nicht überschneiden dürfen; jede Änderung
// steht zusätzlich in der Kette der Org (via: platform). Geheimnisse nur
// feldverschlüsselt mit dem DEK der Org.

const LOCK_SITE_TUNNELS = 7270064;
export const SITE_LINK_DAYS = 14;
export const SITE_LINK_SCOPE = "site:read";

async function platformTx<T>(fn: (tx: DbTx) => Promise<T>): Promise<T> {
	return globalDb.transaction(async (tx) => {
		await tx.execute(sql`select set_config('app.scope', 'platform', true)`);
		return fn(tx);
	});
}

export const secretAad = (id: string) =>
	fieldAad("site_tunnels", id, "secret_enc");

export type SiteSecret = IpsecSecret | WireguardSecret;

export type PlanInput = {
	orgId: string;
	tech: SiteTech;
	peerIp: string;
	customerNets: string[];
};

export type PlanResult =
	| {
			ok: true;
			peerIp: string;
			nets: string[];
			transferNet: string | null;
			conflicts: NetConflict[];
	  }
	| {
			ok: false;
			error: string;
			net?: string;
			conflicts?: NetConflict[];
	  };

async function activeTunnels(tx: DbTx) {
	return tx
		.select({
			id: siteTunnels.id,
			organizationId: siteTunnels.organizationId,
			peerIp: siteTunnels.peerIp,
			customerNets: siteTunnels.customerNets,
			transferNet: siteTunnels.transferNet,
		})
		.from(siteTunnels)
		.where(isNull(siteTunnels.removedAt));
}

function planWith(
	all: Awaited<ReturnType<typeof activeTunnels>>,
	input: PlanInput,
	server: { publicIp: string | null; wgPublicKey: string | null },
): PlanResult {
	if (!server.publicIp) return { ok: false, error: "site_not_configured" };
	if (input.tech === "wireguard" && !server.wgPublicKey)
		return { ok: false, error: "wireguard_unavailable" };
	if (
		all.filter((t) => t.organizationId === input.orgId).length >=
		MAX_TUNNELS_PER_ORG
	)
		return { ok: false, error: "too_many_tunnels" };
	const peer = checkPeerIp(input.peerIp);
	if (!peer.ok) return { ok: false, error: peer.error };
	if (peer.ip === server.publicIp)
		return { ok: false, error: "peer_is_server" };
	if (all.some((t) => t.peerIp === peer.ip))
		return { ok: false, error: "peer_taken" };
	const taken = all.flatMap(effectiveNets);
	const nets = checkCustomerNets(input.customerNets, taken);
	if (!nets.ok) return { ok: false, error: nets.error, net: nets.net };
	if (nets.conflicts.length === 0)
		return {
			ok: true,
			peerIp: peer.ip,
			nets: nets.nets,
			transferNet: null,
			conflicts: [],
		};
	const transferNet = transferFor(nets.nets, taken);
	if (!transferNet)
		return { ok: false, error: "net_conflict", conflicts: nets.conflicts };
	return {
		ok: true,
		peerIp: peer.ip,
		nets: nets.nets,
		transferNet,
		conflicts: nets.conflicts,
	};
}

/** Vorschau im Assistenten (Schritt 3): Netze prüfen, Übergabenetz vorschlagen. */
export function planSiteTunnel(
	input: PlanInput,
	server: { publicIp: string | null; wgPublicKey: string | null },
): Promise<PlanResult> {
	return platformTx(async (tx) =>
		planWith(await activeTunnels(tx), input, server),
	);
}

export async function createSiteTunnel(
	actor: Actor & { userId: string },
	input: PlanInput & { name: string; vendor: SiteVendor },
	server: { publicIp: string | null; wgPublicKey: string | null },
): Promise<PlanResult & { id?: string }> {
	return platformTx(async (tx) => {
		// Prüfen und Anlegen nacheinander, sonst überschneiden sich zwei
		// gleichzeitig angelegte Standorte
		await tx.execute(sql`select pg_advisory_xact_lock(${LOCK_SITE_TUNNELS})`);
		const plan = planWith(await activeTunnels(tx), input, server);
		if (!plan.ok) return plan;
		const id = randomUUID();
		const secret: SiteSecret =
			input.tech === "ipsec" ? newIpsecSecret() : newWireguardSecret();
		const secretEnc = await encryptJson(tx, input.orgId, secret, secretAad(id));
		await tx.insert(siteTunnels).values({
			id,
			organizationId: input.orgId,
			name: input.name,
			vendor: input.vendor,
			tech: input.tech,
			peerIp: plan.peerIp,
			customerNets: plan.nets,
			transferNet: plan.transferNet,
			wgPublicKey: "publicKey" in secret ? secret.publicKey : null,
			secretEnc,
			createdBy: actor.userId,
		});
		const after = {
			name: input.name,
			vendor: input.vendor,
			tech: input.tech,
			peerIp: plan.peerIp,
			nets: plan.nets,
			transferNet: plan.transferNet,
		};
		await audit(tx, actor, {
			action: "site_tunnel.created",
			organizationId: input.orgId,
			target: `site_tunnel:${id}`,
			after: { ...after, via: "platform" },
		});
		await audit(tx, actor, {
			action: "site_tunnel.created",
			target: `site_tunnel:${id}`,
			after: { ...after, orgId: input.orgId },
		});
		await notify(tx, {
			orgId: input.orgId,
			recipients: await orgOwnerIds(tx, input.orgId),
			actorUserId: actor.userId,
			kind: "security_change",
			title: `Standort-Tunnel „${input.name}“ eingerichtet`,
			body: "Klick hat einen Tunnel für euer Büro vorbereitet. Den Stand und den Link für die IT findest du unter Einstellungen > Netzwerk.",
			link: "/einstellungen?tab=netzwerk",
			payload: { dedupeKey: `site-tunnel:${id}:created` },
		});
		return { ...plan, id };
	});
}

/** Tunnel abbauen: Geheimnis weg, Links gesperrt, der Job baut beim Agenten ab. */
export async function removeSiteTunnel(
	actor: Actor & { userId: string },
	orgId: string,
	id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
	return platformTx(async (tx) => {
		const [row] = await tx
			.select()
			.from(siteTunnels)
			.where(
				and(
					eq(siteTunnels.organizationId, orgId),
					eq(siteTunnels.id, id),
					isNull(siteTunnels.removedAt),
				),
			)
			.for("update");
		if (!row) return { ok: false as const, error: "not_found" };
		// Steht ein Netz dieses Standorts in der IP-Liste der Org, sperrte der
		// Abbau sie aus: erst die Liste ändern (Vier-Augen) oder Notweg
		const [s] = await tx
			.select({ networkPolicy: orgSettings.networkPolicy })
			.from(orgSettings)
			.where(eq(orgSettings.organizationId, orgId));
		const policy = networkPolicyOf(s?.networkPolicy);
		const nets = effectiveNets(row).map(parseCidr);
		const listed = [...policy.members, ...(policy.externals ?? [])].some(
			(e) => {
				const r = parseCidr(e.cidr);
				return r && nets.some((n) => n && rangesOverlap(n, r));
			},
		);
		if (listed) return { ok: false as const, error: "tunnel_in_policy" };
		const now = new Date();
		await tx
			.update(siteTunnels)
			.set({
				removedAt: now,
				removedBy: actor.userId,
				secretEnc: null,
				updatedAt: now,
			})
			.where(eq(siteTunnels.id, id));
		await revokeLinks(tx, orgId, id, actor.userId, now);
		await audit(tx, actor, {
			action: "site_tunnel.removed",
			organizationId: orgId,
			target: `site_tunnel:${id}`,
			before: { name: row.name, peerIp: row.peerIp },
			after: { via: "platform" },
		});
		await audit(tx, actor, {
			action: "site_tunnel.removed",
			target: `site_tunnel:${id}`,
			after: { orgId, name: row.name },
		});
		await notify(tx, {
			orgId,
			recipients: await orgOwnerIds(tx, orgId),
			actorUserId: actor.userId,
			kind: "security_change",
			title: `Standort-Tunnel „${row.name}“ abgebaut`,
			link: "/einstellungen?tab=netzwerk",
			payload: { dedupeKey: `site-tunnel:${id}:removed` },
		});
		return { ok: true as const };
	});
}

async function revokeLinks(
	tx: DbTx,
	orgId: string,
	id: string,
	byUserId: string | null,
	now: Date,
) {
	await tx
		.update(accessTokens)
		.set({ revokedAt: now, revokedByUserId: byUserId })
		.where(
			and(
				eq(accessTokens.organizationId, orgId),
				eq(accessTokens.subjectType, "site_tunnel"),
				eq(accessTokens.subjectId, id),
				isNull(accessTokens.revokedAt),
			),
		);
}

/**
 * Link für die IT (klk_site_, 14 Tage, nur lesen). Ein Link je Tunnel: ein
 * neuer sperrt den alten. Aufrufer auditiert (Plattform bzw. Inhaber:in).
 */
export async function insertSiteLink(
	tx: DbTx,
	orgId: string,
	id: string,
	userId: string,
	now = new Date(),
): Promise<{ token: string; expiresAt: Date } | null> {
	const [row] = await tx
		.select({ name: siteTunnels.name })
		.from(siteTunnels)
		.where(
			and(
				eq(siteTunnels.organizationId, orgId),
				eq(siteTunnels.id, id),
				isNull(siteTunnels.removedAt),
			),
		);
	if (!row) return null;
	await revokeLinks(tx, orgId, id, userId, now);
	const expiresAt = new Date(now.getTime() + SITE_LINK_DAYS * 86_400_000);
	const t = newToken("site_setup");
	await tx.insert(accessTokens).values({
		organizationId: orgId,
		kind: "site_setup",
		name: `Standort-Tunnel ${row.name}`,
		prefix: t.prefix,
		tokenHash: t.hash,
		scopes: [SITE_LINK_SCOPE],
		subjectType: "site_tunnel",
		subjectId: id,
		createdByUserId: userId,
		expiresAt,
	});
	return { token: t.token, expiresAt };
}

export async function issueSiteLinkAsPlatform(
	actor: Actor & { userId: string },
	orgId: string,
	id: string,
) {
	return platformTx(async (tx) => {
		const link = await insertSiteLink(tx, orgId, id, actor.userId);
		if (!link) return null;
		await audit(tx, actor, {
			action: "site_tunnel.link_issued",
			organizationId: orgId,
			target: `site_tunnel:${id}`,
			after: { via: "platform", expiresAt: link.expiresAt.toISOString() },
		});
		return link;
	});
}

/** Tunnel einer Org (Admin-Detailseite; keine Geheimnisse). */
export async function orgSiteTunnels(orgId: string): Promise<SiteTunnel[]> {
	return platformTx((tx) =>
		tx
			.select()
			.from(siteTunnels)
			.where(eq(siteTunnels.organizationId, orgId))
			.orderBy(siteTunnels.createdAt),
	);
}

export async function siteTunnelCounts(): Promise<{
	active: number;
	notConnected: number;
}> {
	return platformTx(async (tx) => {
		const rows = await tx
			.select({
				connectedAt: siteTunnels.connectedAt,
				lastUp: siteTunnels.lastUp,
				downSince: siteTunnels.downSince,
			})
			.from(siteTunnels)
			.where(isNull(siteTunnels.removedAt));
		return {
			active: rows.length,
			notConnected: rows.filter((r) => r.downSince !== null).length,
		};
	});
}

// ---- Job (lib/jobs/site-tunnels.ts) -------------------------------------

export type JobTunnel = {
	row: SiteTunnel;
	secret: SiteSecret | null;
};

/** Aktive Tunnel mit Geheimnis und abgebaute, die der Agent noch hat. */
export async function jobTunnels(): Promise<JobTunnel[]> {
	return platformTx(async (tx) => {
		const rows = await tx
			.select()
			.from(siteTunnels)
			.where(
				or(
					isNull(siteTunnels.removedAt),
					and(
						isNotNull(siteTunnels.removedAt),
						isNull(siteTunnels.agentRemovedAt),
					),
				),
			);
		const out: JobTunnel[] = [];
		for (const row of rows) {
			const secret = row.removedAt
				? null
				: await decryptJson<SiteSecret>(
						tx,
						row.organizationId,
						row.secretEnc,
						secretAad(row.id),
					);
			out.push({ row, secret });
		}
		return out;
	});
}

export type Observation = {
	id: string;
	up: boolean;
	lastHandshakeAt: Date | null;
	error: string | null;
	agentRemoved?: boolean;
};

export async function recordObservations(
	obs: readonly Observation[],
	now: Date,
	notice: (
		row: SiteTunnel,
		next: Partial<SiteTunnel>,
	) => "connected" | "down" | null,
): Promise<{ connected: string[]; down: string[] }> {
	const changed = { connected: [] as string[], down: [] as string[] };
	if (obs.length === 0) return changed;
	await platformTx(async (tx) => {
		for (const o of obs) {
			const [row] = await tx
				.select()
				.from(siteTunnels)
				.where(eq(siteTunnels.id, o.id))
				.for("update");
			if (!row) continue;
			if (o.agentRemoved) {
				await tx
					.update(siteTunnels)
					.set({ agentRemovedAt: now, lastStatusAt: now })
					.where(eq(siteTunnels.id, o.id));
				continue;
			}
			const up = o.up && !o.error;
			const next: Partial<SiteTunnel> = {
				lastUp: o.up,
				lastHandshakeAt: o.lastHandshakeAt,
				lastStatusAt: now,
				lastError: o.error,
				connectedAt: row.connectedAt ?? (up ? now : null),
				downSince: up
					? null
					: (row.downSince ?? (row.connectedAt ? now : null)),
			};
			const n = notice(row, next);
			if (n) next.notifiedState = n;
			await tx.update(siteTunnels).set(next).where(eq(siteTunnels.id, o.id));
			if (!n) continue;
			const owners = await orgOwnerIds(tx, row.organizationId);
			const system = { userId: null };
			await audit(tx, system, {
				action:
					n === "connected" ? "site_tunnel.connected" : "site_tunnel.down",
				organizationId: row.organizationId,
				target: `site_tunnel:${row.id}`,
				after: { name: row.name, via: "klick-netz" },
			});
			await notify(tx, {
				orgId: row.organizationId,
				recipients: owners,
				actorUserId: null,
				kind: n === "connected" ? "system" : "security_alert",
				title:
					n === "connected"
						? `Standort-Tunnel „${row.name}“ verbunden`
						: `Standort-Tunnel „${row.name}“ getrennt`,
				body:
					n === "connected"
						? "Der Tunnel zu eurem Büro steht."
						: "Seit mindestens zehn Minuten keine Verbindung. Gilt eure IP-Liste nur für den Standort, kommt aus dem Büro gerade niemand in Klick. Prüf die Firewall oder sprich mit dem Klick-Betrieb.",
				link: "/einstellungen?tab=netzwerk",
				payload: {
					dedupeKey: `site-tunnel:${row.id}:${n}:${now.toISOString().slice(0, 13)}`,
				},
			});
			changed[n].push(row.id);
		}
	});
	return changed;
}
