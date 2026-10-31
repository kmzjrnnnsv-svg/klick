import {
	jobTunnels,
	type Observation,
	recordObservations,
} from "@/lib/db/site-tunnels";
import { logger } from "@/lib/log";
import {
	AgentError,
	type AgentStatus,
	agentCall,
	siteConfig,
} from "@/lib/site-tunnels/agent-client";
import {
	effectiveNets,
	stateNotice,
	tunnelState,
} from "@/lib/site-tunnels/rules";

// Job site-tunnels (jede Minute, ADR-033): gleicht den Soll-Zustand aus der
// Datenbank mit dem Netz-Agenten ab. Aktive Tunnel → apply (idempotent, füllt
// nach einem nftables-Reload auch die Mengen wieder), abgebaute und dem
// Agenten unbekannte (Org gelöscht) → remove, dann status → Beobachtung und
// Mitteilung bei Zustandswechsel. Ohne Agent (SITE_AGENT_SOCKET) aus.

export type SiteTunnelsRun = {
	applied: number;
	removed: number;
	errors: number;
	skipped?: "not_configured" | "agent_unreachable";
};

export async function runSiteTunnels(
	now = new Date(),
	call: typeof agentCall = agentCall,
): Promise<SiteTunnelsRun> {
	const cfg = siteConfig();
	if (!cfg.enabled || !cfg.socket)
		return { applied: 0, removed: 0, errors: 0, skipped: "not_configured" };
	const socket = cfg.socket;
	const out: SiteTunnelsRun = { applied: 0, removed: 0, errors: 0 };
	let hello: { wgPublicKey: string | null; serverIp: string };
	try {
		hello = await call(socket, "hello");
	} catch (err) {
		logger.warn({ err }, "site-tunnels: agent unreachable");
		return { ...out, skipped: "agent_unreachable" };
	}
	if (hello.serverIp !== cfg.publicIp)
		logger.warn(
			{ agent: hello.serverIp },
			"site-tunnels: SITE_PUBLIC_IP differs from agent",
		);
	if (
		cfg.wgPublicKey &&
		hello.wgPublicKey &&
		hello.wgPublicKey !== cfg.wgPublicKey
	)
		logger.warn("site-tunnels: SITE_WG_PUBLIC_KEY differs from agent");

	const tunnels = await jobTunnels();
	const obs: Observation[] = [];
	const applyErrors = new Map<string, string>();
	for (const { row, secret } of tunnels) {
		if (row.removedAt) {
			try {
				await call(socket, "remove", { id: row.id });
				obs.push({
					id: row.id,
					up: false,
					lastHandshakeAt: null,
					error: null,
					agentRemoved: true,
				});
				out.removed += 1;
			} catch (err) {
				out.errors += 1;
				logger.warn({ err, id: row.id }, "site-tunnels: remove failed");
			}
			continue;
		}
		if (!secret) {
			applyErrors.set(row.id, "secret_missing");
			continue;
		}
		const spec =
			row.tech === "ipsec" && "psk" in secret
				? {
						id: row.id,
						tech: "ipsec",
						peerIp: row.peerIp,
						nets: effectiveNets(row),
						psk: secret.psk,
					}
				: row.tech === "wireguard" && "presharedKey" in secret
					? {
							id: row.id,
							tech: "wireguard",
							peerIp: row.peerIp,
							nets: effectiveNets(row),
							publicKey: secret.publicKey,
							presharedKey: secret.presharedKey,
						}
					: null;
		if (!spec) {
			applyErrors.set(row.id, "secret_mismatch");
			continue;
		}
		try {
			await call(socket, "apply", spec);
			out.applied += 1;
		} catch (err) {
			out.errors += 1;
			applyErrors.set(
				row.id,
				err instanceof AgentError ? err.code : "apply_failed",
			);
		}
	}

	let status: AgentStatus;
	try {
		status = await call<AgentStatus>(socket, "status");
	} catch (err) {
		logger.warn({ err }, "site-tunnels: status failed");
		return out;
	}
	// Dem Agenten bekannt, in der Datenbank nicht (mehr): abbauen
	const known = new Set(tunnels.map((t) => t.row.id));
	for (const t of status.tunnels)
		if (!known.has(t.id))
			try {
				await call(socket, "remove", { id: t.id });
				out.removed += 1;
			} catch {
				out.errors += 1;
			}
	const byId = new Map(status.tunnels.map((t) => [t.id, t]));
	for (const { row } of tunnels) {
		if (row.removedAt) continue;
		const t = byId.get(row.id);
		const error =
			applyErrors.get(row.id) ?? t?.error ?? status.baseError ?? null;
		obs.push({
			id: row.id,
			up: Boolean(t?.up),
			lastHandshakeAt: t?.lastHandshakeAt ? new Date(t.lastHandshakeAt) : null,
			error,
		});
	}
	await recordObservations(obs, now, (row, next) => {
		const merged = { ...row, ...next };
		const state = tunnelState(
			{
				tech: merged.tech,
				connectedAt: merged.connectedAt ?? null,
				lastHandshakeAt: merged.lastHandshakeAt ?? null,
				lastUp: merged.lastUp ?? null,
				lastStatusAt: merged.lastStatusAt ?? null,
				lastError: merged.lastError ?? null,
			},
			now,
		);
		return stateNotice(
			row.notifiedState ?? null,
			state,
			merged.downSince ?? null,
			now,
		);
	});
	return out;
}
