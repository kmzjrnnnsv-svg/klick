// IP-Adressen und Netze (IPv4, IPv6, CIDR) — pure, ohne Abhängigkeit, geteilt
// von Klick und both.money (Admin-Netz, IP-Listen je Org). Getestet in
// tests/net-ip.test.ts.
//
// Regeln: IPv4 nur in Punktschreibweise mit vier Teilen ohne führende Nullen
// (keine Oktal-/Hex-Varianten wie 0177.1 oder 0x7f.1); IPv6 mit „::“ und
// eingebettetem IPv4-Rest; IPv4-mapped IPv6 (::ffff:a.b.c.d) zählt als IPv4.
// Zonen (fe80::1%eth0) werden abgelehnt.

export type IpFamily = 4 | 6;
export type ParsedIp = { family: IpFamily; value: bigint };
export type IpRange = {
	family: IpFamily;
	/** Netzadresse (Host-Bits genullt) */
	base: bigint;
	prefix: number;
	/** normalisierte Schreibweise, z. B. "10.9.0.0/24" */
	text: string;
};

const BITS: Record<IpFamily, number> = { 4: 32, 6: 128 };

function parseV4(s: string): bigint | null {
	const parts = s.split(".");
	if (parts.length !== 4) return null;
	let v = 0n;
	for (const p of parts) {
		if (!/^(0|[1-9]\d{0,2})$/.test(p)) return null;
		const n = Number(p);
		if (n > 255) return null;
		v = (v << 8n) | BigInt(n);
	}
	return v;
}

function parseV6(s: string): bigint | null {
	if (s.includes("%")) return null;
	let text = s;
	// eingebettetes IPv4 am Ende (::ffff:1.2.3.4, 64:ff9b::1.2.3.4)
	let tail: bigint | null = null;
	const lastColon = text.lastIndexOf(":");
	if (lastColon >= 0 && text.slice(lastColon + 1).includes(".")) {
		tail = parseV4(text.slice(lastColon + 1));
		if (tail === null) return null;
		text = `${text.slice(0, lastColon + 1)}0:0`;
	}
	const halves = text.split("::");
	if (halves.length > 2) return null;
	const groups = (h: string) => (h === "" ? [] : h.split(":"));
	const head = groups(halves[0] ?? "");
	const rest = halves.length === 2 ? groups(halves[1] ?? "") : [];
	const missing = 8 - head.length - rest.length;
	if (halves.length === 2 ? missing < 1 : missing !== 0) return null;
	const all = [
		...head,
		...Array<string>(halves.length === 2 ? missing : 0).fill("0"),
		...rest,
	];
	if (all.length !== 8) return null;
	let v = 0n;
	for (const g of all) {
		if (!/^[0-9a-fA-F]{1,4}$/.test(g)) return null;
		v = (v << 16n) | BigInt(Number.parseInt(g, 16));
	}
	if (tail !== null) v = (v & ~0xffffffffn) | tail;
	return v;
}

/** Adresse lesen; IPv4-mapped IPv6 wird zu IPv4. `[::1]` ist erlaubt. */
export function parseIp(input: string | null | undefined): ParsedIp | null {
	if (!input) return null;
	let s = input.trim();
	if (s.startsWith("[") && s.endsWith("]")) s = s.slice(1, -1);
	if (!s) return null;
	if (!s.includes(":")) {
		const v4 = parseV4(s);
		return v4 === null ? null : { family: 4, value: v4 };
	}
	const v6 = parseV6(s);
	if (v6 === null) return null;
	if (v6 >> 32n === 0xffffn) return { family: 4, value: v6 & 0xffffffffn };
	return { family: 6, value: v6 };
}

function mask(family: IpFamily, prefix: number): bigint {
	const bits = BITS[family];
	if (prefix === 0) return 0n;
	return ((1n << BigInt(prefix)) - 1n) << BigInt(bits - prefix);
}

/** Schreibweise einer Adresse (IPv6 komprimiert nach RFC 5952). */
export function formatIp(ip: ParsedIp): string {
	if (ip.family === 4) {
		const v = ip.value;
		return [24n, 16n, 8n, 0n].map((s) => String((v >> s) & 0xffn)).join(".");
	}
	const groups = Array.from({ length: 8 }, (_, i) =>
		Number((ip.value >> BigInt(112 - i * 16)) & 0xffffn),
	);
	// längste Folge von Nullen (mindestens zwei) durch „::“ ersetzen
	let bestStart = -1;
	let bestLen = 0;
	for (let i = 0; i < 8; ) {
		if (groups[i] !== 0) {
			i++;
			continue;
		}
		let j = i;
		while (j < 8 && groups[j] === 0) j++;
		if (j - i > bestLen && j - i >= 2) {
			bestStart = i;
			bestLen = j - i;
		}
		i = j;
	}
	const hex = groups.map((g) => g.toString(16));
	if (bestStart < 0) return hex.join(":");
	const left = hex.slice(0, bestStart).join(":");
	const right = hex.slice(bestStart + bestLen).join(":");
	return `${left}::${right}`;
}

/**
 * Netz lesen: "10.9.0.0/24", "fd10:9::/64" oder eine einzelne Adresse
 * (= /32 bzw. /128). Host-Bits werden genullt ("10.9.0.7/24" → 10.9.0.0/24).
 */
export function parseCidr(input: string): IpRange | null {
	const s = input.trim();
	if (!s) return null;
	const slash = s.indexOf("/");
	const addr = slash < 0 ? s : s.slice(0, slash);
	const ip = parseIp(addr);
	if (!ip) return null;
	// IPv4-mapped mit IPv6-Präfix (::ffff:10.0.0.0/104) auf IPv4 umrechnen
	const mapped = ip.family === 4 && addr.includes(":");
	let prefix = BITS[ip.family];
	if (slash >= 0) {
		const p = s.slice(slash + 1);
		if (!/^\d{1,3}$/.test(p)) return null;
		prefix = Number(p);
		if (mapped) prefix -= 96;
		if (prefix < 0 || prefix > BITS[ip.family]) return null;
	}
	const base = ip.value & mask(ip.family, prefix);
	const text = `${formatIp({ family: ip.family, value: base })}/${prefix}`;
	return { family: ip.family, base, prefix, text };
}

export function ipInRange(ip: ParsedIp, range: IpRange): boolean {
	if (ip.family !== range.family) return false;
	return (ip.value & mask(range.family, range.prefix)) === range.base;
}

/** Liegt die Adresse in einem der Netze? Unlesbare Adresse = nein. */
export function ipInRanges(
	ip: string | ParsedIp | null | undefined,
	ranges: readonly IpRange[],
): boolean {
	const parsed = typeof ip === "string" || ip == null ? parseIp(ip) : ip;
	if (!parsed) return false;
	return ranges.some((r) => ipInRange(parsed, r));
}

/** Liste lesen; ungültige Einträge getrennt zurück (für Formulare und Env). */
export function parseRanges(list: readonly string[]): {
	ranges: IpRange[];
	invalid: string[];
} {
	const ranges: IpRange[] = [];
	const invalid: string[] = [];
	for (const raw of list) {
		const s = raw.trim();
		if (!s) continue;
		const r = parseCidr(s);
		if (r) ranges.push(r);
		else invalid.push(s);
	}
	return { ranges, invalid };
}

/** Schreibweise einer Adresse für die Anzeige („Deine IP“), sonst null. */
export function normalizeIp(input: string | null | undefined): string | null {
	const ip = parseIp(input);
	return ip ? formatIp(ip) : null;
}
