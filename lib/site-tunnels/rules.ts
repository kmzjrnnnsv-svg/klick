import { type IpRange, parseCidr, parseIp } from "@/lib/net/ip";

// Standort-Tunnel (Admin-Portal, Teil 7, ADR-033) — rein, geteilt von der
// App und dem Netz-Agenten (netz-agent/, läuft als root). Getestet in
// tests/site-tunnels.test.ts.
//
// Bild: Das Büro der Kundin baut einen Tunnel (IPsec IKEv2 oder WireGuard)
// zum Klick-Server. Klick ist darin unter einer eigenen Dienstadresse
// erreichbar (SITE_SERVICE_ADDRESS, 10.21.0.1); die IT der Kundin trägt im
// internen DNS raza.work auf diese Adresse ein. Die öffentliche Server-IP
// über den Tunnel zu leiten ginge bei WireGuard nicht (der Tunnel liefe in
// sich selbst). Aus dem Tunnel darf nur HTTPS an die Dienstadresse, der
// Server leitet nichts weiter (ip_forward = 0).
//
// Netze der Kundin müssen privat sein (RFC 1918) und dürfen sich weder mit
// den Netzen von Klick (Admin, Knoten, Übergabe-Pool, Dienst) noch mit
// anderen Standorten überschneiden. Überschneidet sich das Netz, setzt die
// Kundin NAT auf ein Übergabenetz 10.20.N.0/x (gleiche Größe, höchstens /24).

export const SITE_TECHS = ["ipsec", "wireguard"] as const;
export type SiteTech = (typeof SITE_TECHS)[number];

export const SITE_SERVICE_ADDRESS = "10.21.0.1";
export const SITE_SERVICE_NET = "10.21.0.0/24";
export const SITE_TRANSFER_POOL = "10.20.0.0/16";
export const WG_SITES_PORT = 51821;
export const WG_SITES_INTERFACE = "wg-sites";
export const SITE_DUMMY_INTERFACE = "klick-sites";

export const MAX_SITE_NETS = 8;
export const MAX_TUNNELS_PER_ORG = 5;
/** kleinstes Präfix eines Kundennetzes (größtes Netz): /16 */
export const MIN_NET_PREFIX = 16;

export type ReservedNet = "admin" | "nodes" | "transfer" | "service";

// Netze von Klick, die nie Netz einer Kundin sein dürfen
export const RESERVED_NETS: readonly { cidr: string; kind: ReservedNet }[] = [
	{ cidr: "10.8.0.0/24", kind: "nodes" },
	{ cidr: "10.9.0.0/24", kind: "admin" },
	{ cidr: SITE_TRANSFER_POOL, kind: "transfer" },
	{ cidr: SITE_SERVICE_NET, kind: "service" },
];

const PRIVATE_V4 = ["10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16"];

// Nicht öffentlich erreichbare IPv4-Bereiche (IANA Special-Purpose Registry)
const NON_PUBLIC_V4 = [
	"0.0.0.0/8",
	"10.0.0.0/8",
	"100.64.0.0/10",
	"127.0.0.0/8",
	"169.254.0.0/16",
	"172.16.0.0/12",
	"192.0.0.0/24",
	"192.0.2.0/24",
	"192.88.99.0/24",
	"192.168.0.0/16",
	"198.18.0.0/15",
	"198.51.100.0/24",
	"203.0.113.0/24",
	"224.0.0.0/4",
	"240.0.0.0/4",
];

const cidr = (s: string) => parseCidr(s) as IpRange;

/** Überschneiden sich zwei Netze? (eins enthält das andere oder gleich) */
export function rangesOverlap(a: IpRange, b: IpRange): boolean {
	if (a.family !== b.family) return false;
	const bits = a.family === 4 ? 32 : 128;
	const p = BigInt(bits - Math.min(a.prefix, b.prefix));
	return a.base >> p === b.base >> p;
}

/** Liegt `inner` ganz in `outer`? */
export function rangeWithin(inner: IpRange, outer: IpRange): boolean {
	return inner.prefix >= outer.prefix && rangesOverlap(inner, outer);
}

/** Öffentliche Gegenstelle: nur IPv4, global erreichbar. */
export function checkPeerIp(
	input: string,
):
	| { ok: true; ip: string }
	| { ok: false; error: "peer_invalid" | "peer_private" } {
	const ip = parseIp(input.trim());
	if (!ip || ip.family !== 4 || input.includes("/"))
		return { ok: false, error: "peer_invalid" };
	const r = cidr(`${input.trim()}/32`);
	if (NON_PUBLIC_V4.some((n) => rangeWithin(r, cidr(n))))
		return { ok: false, error: "peer_private" };
	return { ok: true, ip: r.text.slice(0, -3) };
}

export type NetError =
	| "net_invalid"
	| "net_not_private"
	| "net_too_large"
	| "net_duplicate"
	| "net_count";

export type NetConflict = {
	net: string;
	with: ReservedNet | "site";
	/** belegtes Netz bzw. Netz eines anderen Standorts */
	other: string;
};

export type NetCheck =
	| { ok: false; error: NetError; net?: string }
	| {
			ok: true;
			/** normalisierte Netze der Kundin */
			nets: string[];
			conflicts: NetConflict[];
	  };

/**
 * Netze der Kundin prüfen. `taken` = wirksame Netze aller anderen Standorte
 * (Übergabenetz oder Kundennetz). Überschneidungen sind kein Fehler, sondern
 * führen zum Übergabenetz (`transferFor`).
 */
export function checkCustomerNets(
	input: readonly string[],
	taken: readonly string[],
): NetCheck {
	const list = input.map((s) => s.trim()).filter(Boolean);
	if (list.length === 0 || list.length > MAX_SITE_NETS)
		return { ok: false, error: "net_count" };
	const ranges: IpRange[] = [];
	for (const raw of list) {
		const r = parseCidr(raw);
		if (!r || r.family !== 4 || !raw.includes("/"))
			return { ok: false, error: "net_invalid", net: raw };
		if (!PRIVATE_V4.some((p) => rangeWithin(r, cidr(p))))
			return { ok: false, error: "net_not_private", net: r.text };
		if (r.prefix < MIN_NET_PREFIX)
			return { ok: false, error: "net_too_large", net: r.text };
		if (ranges.some((o) => rangesOverlap(o, r)))
			return { ok: false, error: "net_duplicate", net: r.text };
		ranges.push(r);
	}
	const conflicts: NetConflict[] = [];
	for (const r of ranges) {
		for (const res of RESERVED_NETS)
			if (rangesOverlap(r, cidr(res.cidr)))
				conflicts.push({ net: r.text, with: res.kind, other: res.cidr });
		for (const t of taken) {
			const o = parseCidr(t);
			if (o && rangesOverlap(r, o))
				conflicts.push({ net: r.text, with: "site", other: o.text });
		}
	}
	return { ok: true, nets: ranges.map((r) => r.text), conflicts };
}

/**
 * Übergabenetz für einen Standort mit Überschneidung: gleiche Größe wie das
 * (einzige) Kundennetz, höchstens /24, frei im Pool und ohne Überschneidung
 * mit dem Kundennetz selbst (sonst verwechselt die NAT-Regel der Kundin
 * beides). Null = geht nicht (mehrere Netze oder größer als /24).
 */
export function transferFor(
	nets: readonly string[],
	taken: readonly string[],
): string | null {
	if (nets.length !== 1) return null;
	const own = parseCidr(nets[0] ?? "");
	if (!own || own.prefix < 24) return null;
	const used = taken.map(parseCidr).filter((r): r is IpRange => r !== null);
	for (let n = 1; n <= 254; n += 1) {
		const c = cidr(`10.20.${n}.0/${own.prefix}`);
		if (rangesOverlap(c, own)) continue;
		if (used.some((u) => rangesOverlap(u, c))) continue;
		return c.text;
	}
	return null;
}

/** Netze, die Klick für diesen Standort sieht (nach NAT der Kundin). */
export const effectiveNets = (t: {
	customerNets: readonly string[];
	transferNet: string | null;
}): string[] => (t.transferNet ? [t.transferNet] : [...t.customerNets]);

/**
 * Prüfung im Agenten (zweite Linie): wirksame Netze nur privat, ab /16,
 * nie Admin-, Knoten- oder Dienstnetz. Das Übergabe-Pool ist hier erlaubt.
 */
export function agentNetsAllowed(nets: readonly string[]): boolean {
	if (nets.length === 0 || nets.length > MAX_SITE_NETS) return false;
	const ranges: IpRange[] = [];
	for (const n of nets) {
		const r = parseCidr(n);
		if (!r || r.family !== 4 || r.text !== n) return false;
		if (!PRIVATE_V4.some((p) => rangeWithin(r, cidr(p)))) return false;
		if (r.prefix < MIN_NET_PREFIX) return false;
		for (const res of RESERVED_NETS)
			if (res.kind !== "transfer" && rangesOverlap(r, cidr(res.cidr)))
				return false;
		if (ranges.some((o) => rangesOverlap(o, r))) return false;
		ranges.push(r);
	}
	return true;
}

// Schlüssel-Formate: IPsec-PSK = 32 Byte base64url (43 Zeichen),
// WireGuard-Schlüssel = 32 Byte base64 (44 Zeichen mit „=“).
export const PSK_PATTERN = /^[A-Za-z0-9_-]{43}$/;
export const WG_KEY_PATTERN = /^[A-Za-z0-9+/]{42}[AEIMQUYcgkosw480]=$/;

// ---- Zustand (abgeleitet, nie gespeichert) --------------------------------

export type TunnelState =
	| "pending" // noch nie verbunden
	| "connected"
	| "down" // war verbunden, jetzt nicht
	| "error" // Agent meldet Fehler beim Einrichten
	| "unknown"; // kein Lebenszeichen vom Agenten

/** Ohne Handshake so lange gilt ein WireGuard-Tunnel noch als verbunden. */
export const WG_HANDSHAKE_FRESH_MS = 3 * 60_000;
/** Ohne Status vom Agenten so lange: unbekannt. */
export const AGENT_STALE_MS = 5 * 60_000;
/** Getrennt so lange, bevor Klick Bescheid gibt. */
export const DOWN_NOTIFY_MS = 10 * 60_000;

export type TunnelObservation = {
	tech: SiteTech;
	connectedAt: Date | null;
	lastHandshakeAt: Date | null;
	lastUp: boolean | null;
	lastStatusAt: Date | null;
	lastError: string | null;
};

export function tunnelState(t: TunnelObservation, now: Date): TunnelState {
	if (t.lastError) return "error";
	if (
		!t.lastStatusAt ||
		now.getTime() - t.lastStatusAt.getTime() > AGENT_STALE_MS
	)
		return t.connectedAt ? "unknown" : "pending";
	const up =
		t.tech === "wireguard"
			? Boolean(
					t.lastHandshakeAt &&
						now.getTime() - t.lastHandshakeAt.getTime() <=
							WG_HANDSHAKE_FRESH_MS,
				)
			: t.lastUp === true;
	if (up) return "connected";
	return t.connectedAt ? "down" : "pending";
}

/**
 * Mitteilung bei Zustandswechsel (einmal je Wechsel): verbunden (auch
 * wieder), getrennt erst nach 10 min. `notified` = zuletzt gemeldeter Stand.
 */
export function stateNotice(
	notified: "connected" | "down" | null,
	state: TunnelState,
	downSince: Date | null,
	now: Date,
): "connected" | "down" | null {
	if (state === "connected" && notified !== "connected") return "connected";
	if (
		(state === "down" || state === "unknown") &&
		notified === "connected" &&
		downSince &&
		now.getTime() - downSince.getTime() >= DOWN_NOTIFY_MS
	)
		return "down";
	return null;
}
