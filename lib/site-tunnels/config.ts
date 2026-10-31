import {
	effectiveNets,
	SITE_SERVICE_ADDRESS,
	type SiteTech,
	WG_SITES_PORT,
} from "./rules";

// Werte für die IT der Kundin (Assistent, Link, PDF-Blatt) — rein.
// Verfahren bewusst konservativ und mit einem Rückfall für ältere Geräte:
// IKEv2, AES-256-GCM, SHA-256/384, ECP-384 bzw. MODP-2048 (BSI TR-02102-3).

export const IPSEC = {
	version: "IKEv2",
	ike: ["aes256gcm16-prfsha384-ecp384", "aes256-sha256-modp2048"],
	esp: ["aes256gcm16-ecp384", "aes256-sha256-modp2048"],
	ikeLifetime: "8 h",
	espLifetime: "1 h",
	dpd: "30 s",
} as const;

export type TunnelValues = {
	tech: SiteTech;
	server: string;
	service: string;
	peerIp: string;
	nets: string[];
	transferNet: string | null;
	port: number;
	/** Name von Klick (aus BETTER_AUTH_URL), z. B. raza.work */
	host: string;
	/** WireGuard: öffentlicher Schlüssel von Klick */
	serverPublicKey: string | null;
};

export function tunnelValues(
	t: {
		tech: SiteTech;
		peerIp: string;
		customerNets: string[];
		transferNet: string | null;
	},
	server: { publicIp: string; wgPublicKey: string | null; host: string },
): TunnelValues {
	return {
		tech: t.tech,
		server: server.publicIp,
		service: SITE_SERVICE_ADDRESS,
		peerIp: t.peerIp,
		nets: effectiveNets(t),
		transferNet: t.transferNet,
		port: WG_SITES_PORT,
		serverPublicKey: server.wgPublicKey,
		host: server.host,
	};
}

/** Tabelle der Werte (ohne Geheimnis), für Blatt, Link und Assistent. */
export function valueRows(v: TunnelValues): { label: string; value: string }[] {
	const rows = [
		{ label: "Gegenstelle (Klick)", value: v.server },
		{ label: "Deine öffentliche IP", value: v.peerIp },
		{ label: "Klick im Tunnel", value: `${v.service}/32` },
		{ label: "Dein Netz im Tunnel", value: v.nets.join(", ") },
	];
	if (v.transferNet)
		rows.push({ label: "Übergabenetz (NAT)", value: v.transferNet });
	if (v.tech === "ipsec")
		rows.push(
			{ label: "IKE-Version", value: IPSEC.version },
			{ label: "Phase 1 (IKE)", value: IPSEC.ike.join(" oder ") },
			{ label: "Phase 2 (ESP, mit PFS)", value: IPSEC.esp.join(" oder ") },
			{
				label: "Lebensdauer",
				value: `IKE ${IPSEC.ikeLifetime}, ESP ${IPSEC.espLifetime}`,
			},
			{ label: "Dead Peer Detection", value: IPSEC.dpd },
			{ label: "Identität", value: "IP-Adresse (beide Seiten)" },
			{ label: "Anmeldung", value: "Pre-shared Key (siehe Link)" },
		);
	else
		rows.push(
			{ label: "Port (UDP)", value: String(v.port) },
			{
				label: "Öffentlicher Schlüssel von Klick",
				value: v.serverPublicKey ?? "",
			},
			{ label: "Allowed IPs bei dir", value: `${v.service}/32` },
			{ label: "Keepalive", value: "25 s" },
		);
	rows.push({
		label: "Eintrag im DNS bei dir",
		value: `${v.host} zeigt auf ${v.service}`,
	});
	return rows;
}

/** WireGuard-Datei für die Gegenstelle (enthält den privaten Schlüssel). */
export function wireguardConfig(
	v: TunnelValues,
	secret: { privateKey: string; presharedKey: string },
): string {
	return [
		"# Klick Standort-Tunnel. Vertraulich: enthält den privaten Schlüssel.",
		"[Interface]",
		`PrivateKey = ${secret.privateKey}`,
		"",
		"[Peer]",
		`PublicKey = ${v.serverPublicKey ?? ""}`,
		`PresharedKey = ${secret.presharedKey}`,
		`Endpoint = ${v.server}:${v.port}`,
		`AllowedIPs = ${v.service}/32`,
		"PersistentKeepalive = 25",
		"",
	].join("\n");
}
