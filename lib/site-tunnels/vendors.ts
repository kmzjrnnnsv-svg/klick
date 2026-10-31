import type { SiteTech } from "./rules";

// Firewalls der Kundin für den Standort-Tunnel (AP7, ADR-033) — rein.
// Je Marke: welche Technik Klick vorschlägt, welche gehen, und Schritte mit
// den Namen aus der Oberfläche des Herstellers (nach Herstellerdoku, vor dem
// Verkauf je Marke einmal mit einem Testgerät durchspielen; CLAUDE.md,
// Offene Punkte). Platzhalter in den Schritten: {server} (öffentliche IP
// von Klick), {service} (Dienstadresse im Tunnel), {nets} (Netze, die in den
// Tunnel gehen), {transfer} (Übergabenetz, falls NAT nötig), {port}
// (WireGuard-Port), {host} (Name von Klick, z. B. raza.work). Du-Form, ohne Geviertstrich (Test site-tunnels).

export const SITE_VENDORS = [
	"sophos",
	"fortinet",
	"cisco",
	"pfsense",
	"opnsense",
	"lancom",
	"fritzbox",
	"mikrotik",
	"other",
] as const;
export type SiteVendor = (typeof SITE_VENDORS)[number];

export type VendorGuide = {
	label: string;
	/** Vorschlag im Assistenten */
	tech: SiteTech;
	supports: readonly SiteTech[];
	/** Hinweis zur Marke, z. B. Mindestversion */
	note?: string;
	steps: Partial<Record<SiteTech, readonly string[]>>;
};

const IPSEC_COMMON_END = [
	"Leg im internen DNS einen Eintrag an: {host} zeigt auf {service}. Ohne diesen Eintrag geht der Verkehr weiter über das Internet.",
	"Prüf von einem Rechner im Büro: https://{host} öffnet sich, und Klick zeigt den Tunnel als „verbunden“.",
];

const WG_COMMON_END = IPSEC_COMMON_END;

export const VENDOR_GUIDES: Record<SiteVendor, VendorGuide> = {
	sophos: {
		label: "Sophos Firewall",
		tech: "ipsec",
		supports: ["ipsec"],
		steps: {
			ipsec: [
				"Öffne „Site-to-site VPN“ > „IPsec“ und wähle „Add“.",
				"Verbindungsart „Site-to-site“, Gateway-Typ „Respond only“ oder „Initiate the connection“, IKE-Version „IKEv2“.",
				"Lege unter „Profiles“ ein IPsec-Profil mit den Verfahren von unten an (Phase 1 und Phase 2) und wähle es aus.",
				"Authentifizierung „Preshared key“, Schlüssel von unten einfügen.",
				"Lokales Gateway: deine öffentliche IP, Remote-Gateway: {server}. Local ID und Remote ID als IP-Adresse.",
				"Lokales Subnetz: {nets}. Remote-Subnetz: {service}/32.",
				"Unter „Rules and policies“ eine Regel von deinem LAN in die VPN-Zone für {service} mit HTTPS anlegen.",
				...IPSEC_COMMON_END,
			],
		},
	},
	fortinet: {
		label: "Fortinet FortiGate",
		tech: "ipsec",
		supports: ["ipsec"],
		steps: {
			ipsec: [
				"Öffne „VPN“ > „IPsec Tunnels“ > „Create New“ > „Custom“.",
				"Remote Gateway „Static IP Address“ mit {server}, Interface = deine WAN-Schnittstelle.",
				"IKE Version 2, Authentication Method „Pre-shared Key“, Schlüssel von unten einfügen.",
				"Phase 1 Proposal und Diffie-Hellman-Gruppe wie unten, „Dead Peer Detection“ an.",
				"Phase 2 Selector: Local Address {nets}, Remote Address {service}/32, Proposal wie unten, PFS an.",
				"Lege eine statische Route nach {service}/32 über die Tunnel-Schnittstelle an.",
				"Lege eine Firewall-Policy vom LAN zum Tunnel für {service}, Dienst HTTPS, ohne NAT an.",
				...IPSEC_COMMON_END,
			],
		},
	},
	cisco: {
		label: "Cisco (ASA oder IOS)",
		tech: "ipsec",
		supports: ["ipsec"],
		steps: {
			ipsec: [
				"Leg eine IKEv2-Policy mit den Verfahren von unten an (Verschlüsselung, Integrität bzw. PRF, DH-Gruppe).",
				"Leg die Gegenstelle {server} mit Pre-shared Key an (Tunnel-Group bzw. IKEv2-Keyring).",
				"Crypto-Map bzw. IPsec-Profil mit dem IPsec-Proposal von unten und PFS.",
				"Interessanter Verkehr (Crypto-ACL): von {nets} nach {service}/32.",
				"Kein NAT für diesen Verkehr (NAT-Ausnahme bzw. „no nat“).",
				...IPSEC_COMMON_END,
			],
		},
	},
	pfsense: {
		label: "pfSense",
		tech: "wireguard",
		supports: ["wireguard", "ipsec"],
		note: "WireGuard braucht das Paket „WireGuard“ (System > Package Manager).",
		steps: {
			wireguard: [
				"Öffne „VPN“ > „WireGuard“ > „Tunnels“ > „Add Tunnel“ und füg den privaten Schlüssel von unten ein.",
				"Unter „Peers“ > „Add Peer“: Public Key und Preshared Key von unten, Endpoint {server}, Port {port}, Keep Alive 25, Allowed IPs {service}/32.",
				"Weise den Tunnel unter „Interfaces“ > „Assignments“ zu und schalte die Schnittstelle ein.",
				"Leg unter „System“ > „Routing“ ein Gateway auf der Schnittstelle und eine Route nach {service}/32 an.",
				"Unter „Firewall“ > „Rules“ > „LAN“: Regel nach {service} mit HTTPS über dieses Gateway.",
				...WG_COMMON_END,
			],
			ipsec: [
				"Öffne „VPN“ > „IPsec“ > „Add P1“: IKEv2, Remote Gateway {server}, Pre-Shared Key von unten, Verfahren wie unten.",
				"„Add P2“: Local Network {nets}, Remote Network {service}/32, Verfahren wie unten, PFS-Gruppe wie unten.",
				"Unter „Firewall“ > „Rules“ > „IPsec“: Verkehr nach {service} mit HTTPS erlauben.",
				...IPSEC_COMMON_END,
			],
		},
	},
	opnsense: {
		label: "OPNsense",
		tech: "wireguard",
		supports: ["wireguard", "ipsec"],
		steps: {
			wireguard: [
				"Öffne „VPN“ > „WireGuard“ > „Instances“, leg eine Instanz mit dem privaten Schlüssel von unten an.",
				"Unter „Peers“: Public Key und Preshared Key von unten, Endpoint {server}, Port {port}, Keepalive 25, Allowed IPs {service}/32.",
				"Weise die Instanz unter „Interfaces“ > „Assignments“ zu, leg ein Gateway und eine Route nach {service}/32 an.",
				"Unter „Firewall“ > „Rules“ > „LAN“: Verkehr nach {service} mit HTTPS erlauben.",
				...WG_COMMON_END,
			],
			ipsec: [
				"Öffne „VPN“ > „IPsec“ > „Connections“, leg eine Verbindung mit IKEv2 und Remote {server} an.",
				"Authentifizierung: Pre-Shared Key von unten, lokale und entfernte ID als IP-Adresse.",
				"Child: Local {nets}, Remote {service}/32, Verfahren wie unten.",
				...IPSEC_COMMON_END,
			],
		},
	},
	lancom: {
		label: "LANCOM",
		tech: "ipsec",
		supports: ["ipsec"],
		steps: {
			ipsec: [
				"Starte in LANconfig den Assistenten „Zwei lokale Netze verbinden (VPN)“ mit IKEv2.",
				"Gegenstelle: {server}, Authentifizierung „Preshared Key“ mit dem Schlüssel von unten, Identitäten als IP-Adresse.",
				"Lokales Netz: {nets}, entferntes Netz: {service}/32.",
				"Wähle unter „IKEv2/IPsec“ > „Verschlüsselung“ die Verfahren von unten.",
				...IPSEC_COMMON_END,
			],
		},
	},
	fritzbox: {
		label: "FRITZ!Box",
		tech: "wireguard",
		supports: ["wireguard"],
		note: "Ab FRITZ!OS 7.50. IPsec der FRITZ!Box nutzt IKEv1, das Klick nicht anbietet.",
		steps: {
			wireguard: [
				"Öffne „Internet“ > „Freigaben“ > „VPN (WireGuard)“ > „Verbindung hinzufügen“.",
				"Wähle „Netzwerke koppeln oder spezielle Verbindungen herstellen“ und „Ja“ bei „Wurde für die Gegenstelle bereits eine WireGuard-Konfiguration erstellt?“.",
				"Lade die Datei „klick-standort.conf“ von unten hoch.",
				"Prüf unter „Heimnetz“ > „Netzwerk“ > „Netzwerkeinstellungen“, dass der DNS-Rebind-Schutz eine Ausnahme für {host} hat, falls du einen eigenen DNS-Server nutzt.",
				...WG_COMMON_END,
			],
		},
	},
	mikrotik: {
		label: "MikroTik",
		tech: "wireguard",
		supports: ["wireguard", "ipsec"],
		note: "WireGuard ab RouterOS 7.",
		steps: {
			wireguard: [
				"Leg unter „WireGuard“ eine Schnittstelle mit dem privaten Schlüssel von unten an.",
				"Unter „Peers“: Public Key und Preshared Key von unten, Endpoint {server}, Port {port}, Allowed Address {service}/32, Persistent Keepalive 25s.",
				"Leg unter „IP“ > „Routes“ eine Route nach {service}/32 über die WireGuard-Schnittstelle an.",
				"Erlaube in „IP“ > „Firewall“ > „Filter Rules“ HTTPS vom LAN nach {service}.",
				...WG_COMMON_END,
			],
			ipsec: [
				"Unter „IP“ > „IPsec“: Profile und Proposal mit den Verfahren von unten anlegen.",
				"Peer {server} mit Exchange Mode „IKE2“, Identity mit Pre-Shared Key von unten.",
				"Policy: Src. Address {nets}, Dst. Address {service}/32, Tunnel an.",
				...IPSEC_COMMON_END,
			],
		},
	},
	other: {
		label: "Andere Firewall",
		tech: "ipsec",
		supports: ["ipsec", "wireguard"],
		steps: {
			ipsec: [
				"Leg einen IPsec-Tunnel mit IKEv2 zur Gegenstelle {server} an, Authentifizierung mit dem Pre-shared Key von unten.",
				"Verfahren für Phase 1 (IKE) und Phase 2 (ESP) wie unten, mit PFS.",
				"Lokale Netze: {nets}, entferntes Netz: {service}/32.",
				"Kein NAT für den Verkehr in den Tunnel, außer du nutzt das Übergabenetz.",
				...IPSEC_COMMON_END,
			],
			wireguard: [
				"Leg eine WireGuard-Schnittstelle mit dem privaten Schlüssel von unten an oder importiere die Datei „klick-standort.conf“.",
				"Peer: Public Key und Preshared Key von unten, Endpoint {server}:{port}, Allowed IPs {service}/32, Keepalive 25.",
				"Route nach {service}/32 über die WireGuard-Schnittstelle.",
				...WG_COMMON_END,
			],
		},
	},
};

/** Schritt mit eingesetzten Werten. */
export function fillStep(
	step: string,
	v: {
		server: string;
		service: string;
		nets: string;
		transfer: string | null;
		port: number;
		host: string;
	},
): string {
	return step
		.replaceAll("{host}", v.host)
		.replaceAll("{server}", v.server)
		.replaceAll("{service}", v.service)
		.replaceAll("{nets}", v.nets)
		.replaceAll("{transfer}", v.transfer ?? "")
		.replaceAll("{port}", String(v.port));
}

/** Schritt zum Übergabenetz (NAT bei der Kundin), wenn Klick eins vergeben hat. */
export const TRANSFER_STEP =
	"Dein Netz überschneidet sich mit einem Netz bei Klick. Setz deshalb für den Verkehr in den Tunnel NAT (1:1, „netmap“) von deinem Netz auf {transfer}. Klick sieht dann nur Adressen aus {transfer}.";

export function isSiteVendor(v: string): v is SiteVendor {
	return (SITE_VENDORS as readonly string[]).includes(v);
}
