import { describe, expect, it } from "vitest";
import {
	formatIp,
	ipInRanges,
	normalizeIp,
	parseCidr,
	parseIp,
	parseRanges,
} from "@/lib/net/ip";

// IP-Adressen und Netze (Admin-Netz, IP-Listen je Org): beide Familien,
// IPv4-mapped, Präfixgrenzen, nichts Mehrdeutiges.

describe("parseIp", () => {
	it("IPv4 in Punktschreibweise", () => {
		expect(parseIp("10.9.0.1")).toEqual({ family: 4, value: 0x0a090001n });
		expect(parseIp(" 255.255.255.255 ")?.value).toBe(0xffffffffn);
	});

	it("lehnt mehrdeutige IPv4-Formen ab", () => {
		for (const bad of [
			"010.9.0.1",
			"0x7f.0.0.1",
			"127.1",
			"2130706433",
			"1.2.3.256",
			"1.2.3",
			"1.2.3.4.5",
			"",
			"a.b.c.d",
		])
			expect(parseIp(bad), bad).toBeNull();
	});

	it("IPv6 mit ::, Klammern und eingebettetem IPv4", () => {
		expect(parseIp("::1")).toEqual({ family: 6, value: 1n });
		expect(parseIp("[::1]")).toEqual({ family: 6, value: 1n });
		expect(parseIp("::")).toEqual({ family: 6, value: 0n });
		expect(parseIp("fd10:9::1")?.value).toBe(
			(0xfd10n << 112n) | (0x9n << 96n) | 1n,
		);
		expect(parseIp("2001:db8:0:0:0:0:2:1")).toEqual(parseIp("2001:db8::2:1"));
		expect(parseIp("64:ff9b::192.0.2.33")?.family).toBe(6);
	});

	it("IPv4-mapped IPv6 zählt als IPv4", () => {
		expect(parseIp("::ffff:10.9.0.5")).toEqual(parseIp("10.9.0.5"));
		expect(parseIp("::FFFF:a09:5")).toEqual(parseIp("10.9.0.5"));
	});

	it("lehnt ungültiges IPv6 und Zonen ab", () => {
		for (const bad of [
			"1::2::3",
			":::",
			"12345::1",
			"fe80::1%eth0",
			"1:2:3:4:5:6:7:8:9",
			"1:2:3:4:5:6:7",
			"g::1",
			"::1.2.3",
		])
			expect(parseIp(bad), bad).toBeNull();
	});
});

describe("formatIp", () => {
	it("IPv6 nach RFC 5952", () => {
		expect(normalizeIp("2001:0db8:0000:0000:0000:0000:0002:0001")).toBe(
			"2001:db8::2:1",
		);
		expect(normalizeIp("fd10:9:0:0:0:0:0:1")).toBe("fd10:9::1");
		expect(normalizeIp("1:0:0:2:0:0:0:3")).toBe("1:0:0:2::3");
		expect(normalizeIp("::")).toBe("::");
		expect(normalizeIp("1:2:3:4:5:6:7:8")).toBe("1:2:3:4:5:6:7:8");
		expect(normalizeIp("1:0:2:3:4:5:6:7")).toBe("1:0:2:3:4:5:6:7");
	});

	it("Rundreise", () => {
		for (const s of ["10.9.0.1", "fd10:9::1", "2001:db8::", "::1"]) {
			const ip = parseIp(s);
			expect(ip).not.toBeNull();
			if (ip) expect(parseIp(formatIp(ip))).toEqual(ip);
		}
	});
});

describe("parseCidr und ipInRanges", () => {
	it("Netze und einzelne Adressen", () => {
		expect(parseCidr("10.9.0.0/24")?.text).toBe("10.9.0.0/24");
		expect(parseCidr("10.9.0.77/24")?.text).toBe("10.9.0.0/24");
		expect(parseCidr("203.0.113.5")?.text).toBe("203.0.113.5/32");
		expect(parseCidr("fd10:9::/64")?.text).toBe("fd10:9::/64");
		expect(parseCidr("2001:db8::1")?.text).toBe("2001:db8::1/128");
		expect(parseCidr("0.0.0.0/0")?.text).toBe("0.0.0.0/0");
		expect(parseCidr("::ffff:10.0.0.0/104")?.text).toBe("10.0.0.0/8");
	});

	it("lehnt ungültige Präfixe ab", () => {
		for (const bad of [
			"10.0.0.0/33",
			"10.0.0.0/-1",
			"fd00::/129",
			"10.0.0.0/",
			"10.0.0.0/2a",
			"x/8",
		])
			expect(parseCidr(bad), bad).toBeNull();
	});

	it("Treffer an den Grenzen", () => {
		const { ranges } = parseRanges(["10.9.0.0/24", "fd10:9::/64"]);
		expect(ipInRanges("10.9.0.0", ranges)).toBe(true);
		expect(ipInRanges("10.9.0.255", ranges)).toBe(true);
		expect(ipInRanges("10.9.1.0", ranges)).toBe(false);
		expect(ipInRanges("10.8.255.255", ranges)).toBe(false);
		expect(ipInRanges("fd10:9::ffff", ranges)).toBe(true);
		expect(ipInRanges("fd10:9:0:1::1", ranges)).toBe(false);
		expect(ipInRanges("::ffff:10.9.0.9", ranges)).toBe(true);
	});

	it("Familien mischen nie, unlesbar = nein", () => {
		const { ranges } = parseRanges(["0.0.0.0/0"]);
		expect(ipInRanges("8.8.8.8", ranges)).toBe(true);
		expect(ipInRanges("2001:db8::1", ranges)).toBe(false);
		expect(ipInRanges(null, ranges)).toBe(false);
		expect(ipInRanges("unbekannt", ranges)).toBe(false);
		expect(ipInRanges("10.9.0.1", [])).toBe(false);
	});

	it("parseRanges trennt ungültige Einträge", () => {
		const r = parseRanges([" 10.0.0.0/8 ", "", "kaputt", "fd00::/8"]);
		expect(r.ranges.map((x) => x.text)).toEqual(["10.0.0.0/8", "fd00::/8"]);
		expect(r.invalid).toEqual(["kaputt"]);
	});
});
