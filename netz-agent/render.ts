import { IPSEC } from "@/lib/site-tunnels/config";
import { SITE_SERVICE_ADDRESS } from "@/lib/site-tunnels/rules";
import { connName, type TunnelSpec } from "./spec";

// Konfiguration aus dem geprüften Soll-Zustand — rein (Test netz-agent).
// Alle eingesetzten Werte sind vorher auf feste Formate geprüft (spec.ts):
// UUID, IPv4-Adresse, CIDR, base64url-Schlüssel. Kein freier Text.

/** swanctl-Datei je IPsec-Tunnel (/etc/swanctl/conf.d/klick-<id>.conf, 0600). */
export function renderSwanctl(
	spec: Extract<TunnelSpec, { tech: "ipsec" }>,
	serverIp: string,
): string {
	const name = connName(spec.id);
	return [
		`# Klick Standort-Tunnel ${spec.id} (verwaltet von klick-netz, nicht von Hand ändern)`,
		"connections {",
		`  ${name} {`,
		"    version = 2",
		`    local_addrs = ${serverIp}`,
		`    remote_addrs = ${spec.peerIp}`,
		`    proposals = ${IPSEC.ike.join(",")}`,
		"    rekey_time = 8h",
		"    dpd_delay = 30s",
		"    mobike = no",
		"    local {",
		"      auth = psk",
		`      id = ${serverIp}`,
		"    }",
		"    remote {",
		"      auth = psk",
		`      id = ${spec.peerIp}`,
		"    }",
		"    children {",
		`      ${name} {`,
		`        local_ts = ${SITE_SERVICE_ADDRESS}/32`,
		`        remote_ts = ${spec.nets.join(",")}`,
		`        esp_proposals = ${IPSEC.esp.join(",")}`,
		"        rekey_time = 1h",
		"        start_action = start",
		"        dpd_action = restart",
		"        close_action = start",
		"      }",
		"    }",
		"  }",
		"}",
		"secrets {",
		`  ike-${name} {`,
		`    id-1 = ${serverIp}`,
		`    id-2 = ${spec.peerIp}`,
		`    secret = "${spec.psk}"`,
		"  }",
		"}",
		"",
	].join("\n");
}

/** Argumente für `wg set wg-sites …` (der Preshared Key kommt über stdin). */
export function wgPeerArgs(
	iface: string,
	spec: Extract<TunnelSpec, { tech: "wireguard" }>,
): string[] {
	return [
		"set",
		iface,
		"peer",
		spec.publicKey,
		"preshared-key",
		"/dev/stdin",
		"allowed-ips",
		spec.nets.join(","),
	];
}
