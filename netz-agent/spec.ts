import {
	agentNetsAllowed,
	checkPeerIp,
	PSK_PATTERN,
	type SiteTech,
	WG_KEY_PATTERN,
} from "@/lib/site-tunnels/rules";

// Soll-Zustand eines Standort-Tunnels, wie die App ihn dem Agenten schickt
// (ADR-033). Streng geprüft: der Agent läuft als root, jede Angabe landet in
// einer Konfigurationsdatei oder als Argument von ip/wg/nft/swanctl. Keine
// unbekannten Felder, feste Formate, nie freier Text.

export type TunnelSpec =
	| {
			id: string;
			tech: Extract<SiteTech, "ipsec">;
			peerIp: string;
			nets: string[];
			psk: string;
	  }
	| {
			id: string;
			tech: Extract<SiteTech, "wireguard">;
			peerIp: string;
			nets: string[];
			publicKey: string;
			presharedKey: string;
	  };

export class SpecError extends Error {
	constructor(readonly code: string) {
		super(code);
	}
}

export const UUID =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function exactKeys(o: Record<string, unknown>, keys: readonly string[]) {
	const got = Object.keys(o).sort();
	const want = [...keys].sort();
	if (got.length !== want.length || got.some((k, i) => k !== want[i]))
		throw new SpecError("spec_fields");
}

export function validateId(raw: unknown): string {
	if (typeof raw !== "string" || !UUID.test(raw))
		throw new SpecError("spec_id");
	return raw;
}

export function validateSpec(raw: unknown): TunnelSpec {
	if (!raw || typeof raw !== "object" || Array.isArray(raw))
		throw new SpecError("spec_shape");
	const o = raw as Record<string, unknown>;
	const id = validateId(o.id);
	if (typeof o.peerIp !== "string") throw new SpecError("spec_peer");
	const peer = checkPeerIp(o.peerIp);
	if (!peer.ok || peer.ip !== o.peerIp) throw new SpecError("spec_peer");
	if (
		!Array.isArray(o.nets) ||
		!o.nets.every((n) => typeof n === "string") ||
		!agentNetsAllowed(o.nets as string[])
	)
		throw new SpecError("spec_nets");
	const nets = [...(o.nets as string[])];
	if (o.tech === "ipsec") {
		exactKeys(o, ["id", "tech", "peerIp", "nets", "psk"]);
		if (typeof o.psk !== "string" || !PSK_PATTERN.test(o.psk))
			throw new SpecError("spec_psk");
		return { id, tech: "ipsec", peerIp: peer.ip, nets, psk: o.psk };
	}
	if (o.tech === "wireguard") {
		exactKeys(o, ["id", "tech", "peerIp", "nets", "publicKey", "presharedKey"]);
		if (typeof o.publicKey !== "string" || !WG_KEY_PATTERN.test(o.publicKey))
			throw new SpecError("spec_key");
		if (
			typeof o.presharedKey !== "string" ||
			!WG_KEY_PATTERN.test(o.presharedKey)
		)
			throw new SpecError("spec_key");
		return {
			id,
			tech: "wireguard",
			peerIp: peer.ip,
			nets,
			publicKey: o.publicKey,
			presharedKey: o.presharedKey,
		};
	}
	throw new SpecError("spec_tech");
}

export const connName = (id: string) => `klick-${id}`;
