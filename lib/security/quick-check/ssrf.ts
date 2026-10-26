import { BlockList, isIP } from "node:net";

// SSRF-Schutz für den passiven Schnellcheck: nur öffentliche Ziele über
// http(s) auf 80/443. Jede aufgelöste Adresse wird geprüft — auch IPv4, die
// in IPv6 steckt (::ffff:a.b.c.d, NAT64 64:ff9b::/96, 6to4 2002::/16).
// Der Abruf verbindet sich danach nur mit der geprüften Adresse (gepinnter
// Lookup, siehe fetcher.ts), damit DNS-Rebinding nichts umlenkt; jeder
// Redirect läuft erneut durch diese Prüfung.

const blocked = new BlockList();
for (const [net, prefix] of [
	["0.0.0.0", 8], // „dieses“ Netz
	["10.0.0.0", 8],
	["100.64.0.0", 10], // CGNAT
	["127.0.0.0", 8],
	["169.254.0.0", 16], // Link-Local inkl. Cloud-Metadaten 169.254.169.254
	["172.16.0.0", 12],
	["192.0.0.0", 24],
	["192.0.2.0", 24], // TEST-NET
	["192.88.99.0", 24],
	["192.168.0.0", 16],
	["198.18.0.0", 15],
	["198.51.100.0", 24],
	["203.0.113.0", 24],
	["224.0.0.0", 4], // Multicast
	["240.0.0.0", 4], // reserviert + Broadcast
] as const)
	blocked.addSubnet(net, prefix, "ipv4");
for (const [net, prefix] of [
	["::", 128],
	["::1", 128],
	["fc00::", 7], // ULA
	["fe80::", 10], // Link-Local
	["fec0::", 10], // Site-Local (veraltet)
	["ff00::", 8], // Multicast
	["2001:db8::", 32], // Doku
	// Teredo (IPv4 darin verschleiert) und lokales NAT64 (RFC 8215): kein
	// Ziel für einen Schnellcheck, nur ein Weg um die IPv4-Sperren herum
	["2001::", 32],
	["64:ff9b:1::", 48],
	["100::", 64], // Discard
	["fd00:ec2::", 32], // AWS-Metadaten (IPv6)
] as const)
	blocked.addSubnet(net, prefix, "ipv6");

function expandV6(ip: string): number[] | null {
	// IPv6 → 8 Gruppen; IPv4-Suffix (::ffff:1.2.3.4) wird umgerechnet.
	let s = ip.toLowerCase().split("%")[0] ?? "";
	const v4 = /(\d+\.\d+\.\d+\.\d+)$/.exec(s);
	if (v4?.[1]) {
		const o = v4[1].split(".").map(Number);
		if (o.some((x) => x > 255)) return null;
		s = s.replace(
			v4[1],
			`${(((o[0] ?? 0) << 8) | (o[1] ?? 0)).toString(16)}:${(((o[2] ?? 0) << 8) | (o[3] ?? 0)).toString(16)}`,
		);
	}
	const [head, tail] = s.split("::");
	const h = head ? head.split(":") : [];
	const t = tail !== undefined ? (tail ? tail.split(":") : []) : [];
	const fill = s.includes("::") ? 8 - h.length - t.length : 0;
	const groups = [...h, ...Array(fill).fill("0"), ...t].map((g) =>
		Number.parseInt(g || "0", 16),
	);
	return groups.length === 8 && groups.every((g) => g >= 0 && g <= 0xffff)
		? groups
		: null;
}

const v4From = (hi: number, lo: number) =>
	`${hi >> 8}.${hi & 0xff}.${lo >> 8}.${lo & 0xff}`;

// Eingebettete IPv4 (mapped, kompatibel, NAT64, 6to4) — sonst null.
export function embeddedV4(ip: string): string | null {
	const g = expandV6(ip);
	if (!g) return null;
	const [g0, g1, g2, g3, g4, g5, g6, g7] = g as [
		number,
		number,
		number,
		number,
		number,
		number,
		number,
		number,
	];
	if (g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0) {
		if (g5 === 0xffff || g5 === 0) return v4From(g6, g7);
	}
	if (
		g0 === 0x64 &&
		g1 === 0xff9b &&
		g2 === 0 &&
		g3 === 0 &&
		g4 === 0 &&
		g5 === 0
	)
		return v4From(g6, g7);
	if (g0 === 0x2002) return v4From(g1, g2);
	return null;
}

export function isBlockedAddress(ip: string): boolean {
	const family = isIP(ip);
	if (family === 4) return blocked.check(ip, "ipv4");
	if (family === 6) {
		const v4 = embeddedV4(ip);
		if (v4 && (isIP(v4) !== 4 || blocked.check(v4, "ipv4"))) return true;
		return blocked.check(ip, "ipv6");
	}
	return true; // keine gültige Adresse
}

export type TargetError =
	| "invalid_url"
	| "protocol"
	| "credentials"
	| "port"
	| "host"
	| "blocked_address"
	| "dns";

const BLOCKED_HOST =
	/(^|\.)(localhost|local|internal|intranet|lan|home|corp|localdomain)$/i;

// URL-Form prüfen (ohne DNS). Nur http/https, keine Zugangsdaten, nur 80/443,
// keine internen Namen, IP-Literale nur, wenn öffentlich.
export function validateTargetUrl(
	raw: string,
): { ok: true; url: URL } | { ok: false; error: TargetError } {
	let url: URL;
	try {
		url = new URL(raw.trim());
	} catch {
		return { ok: false, error: "invalid_url" };
	}
	if (url.protocol !== "https:" && url.protocol !== "http:")
		return { ok: false, error: "protocol" };
	if (url.username || url.password) return { ok: false, error: "credentials" };
	if (url.port && url.port !== "80" && url.port !== "443")
		return { ok: false, error: "port" };
	const host = url.hostname.replace(/^\[|\]$/g, "");
	if (!host || BLOCKED_HOST.test(host) || (!host.includes(".") && !isIP(host)))
		return { ok: false, error: "host" };
	if (isIP(host) && isBlockedAddress(host))
		return { ok: false, error: "blocked_address" };
	return { ok: true, url };
}

export type Resolver = (
	host: string,
) => Promise<{ address: string; family: number }[]>;

// Hostname auflösen; ALLE Adressen müssen öffentlich sein (sonst könnte ein
// Angreifer eine interne neben eine öffentliche Adresse legen). Liefert die
// Adresse, an die der Abruf gepinnt wird.
export async function resolvePublic(
	host: string,
	resolve: Resolver,
): Promise<
	| { ok: true; address: string; family: 4 | 6 }
	| { ok: false; error: TargetError }
> {
	const literal = host.replace(/^\[|\]$/g, "");
	const fam = isIP(literal);
	if (fam)
		return isBlockedAddress(literal)
			? { ok: false, error: "blocked_address" }
			: { ok: true, address: literal, family: fam as 4 | 6 };
	let addrs: { address: string; family: number }[];
	try {
		addrs = await resolve(host);
	} catch {
		return { ok: false, error: "dns" };
	}
	if (addrs.length === 0) return { ok: false, error: "dns" };
	if (addrs.some((a) => isBlockedAddress(a.address)))
		return { ok: false, error: "blocked_address" };
	const first = addrs.find((a) => a.family === 4) ?? addrs[0];
	if (!first) return { ok: false, error: "dns" };
	return {
		ok: true,
		address: first.address,
		family: first.family === 6 ? 6 : 4,
	};
}
