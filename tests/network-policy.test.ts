import { describe, expect, it } from "vitest";
import {
	EMPTY_NETWORK_POLICY,
	locksOut,
	type NetworkPolicy,
	networkAllows,
	networkPolicyOf,
} from "@/lib/net/network-policy";

// IP-Liste je Org (Härtung A5): Lesen, wer wohin darf, Selbstaussperren.

const office: NetworkPolicy = {
	...EMPTY_NETWORK_POLICY,
	members: [
		{ cidr: "203.0.113.0/24", note: "Büro" },
		{ cidr: "2001:db8::/32", note: "Büro v6" },
	],
};

describe("networkPolicyOf", () => {
	it("leer, Unsinn und ungültige Einträge", () => {
		expect(networkPolicyOf(null)).toEqual(EMPTY_NETWORK_POLICY);
		expect(networkPolicyOf("x")).toEqual(EMPTY_NETWORK_POLICY);
		const p = networkPolicyOf({
			members: [
				{ cidr: " 10.0.0.0/8 ", note: "VPN" },
				{ cidr: "999.1.1.1/8", note: "kaputt" },
				{ cidr: 7 },
			],
			externals: "nein",
			exceptions: { ingest: true, trustCenter: "ja", unbekannt: true },
		});
		expect(p.members).toEqual([{ cidr: "10.0.0.0/8", note: "VPN" }]);
		expect(p.externals).toBeNull();
		expect(p.exceptions.ingest).toBe(true);
		expect(p.exceptions.trustCenter).toBe(false);
		expect(Object.keys(p.exceptions)).not.toContain("unbekannt");
	});
});

describe("networkAllows", () => {
	it("aus: alles erlaubt, auch ohne bekannte Adresse", () => {
		expect(networkAllows(EMPTY_NETWORK_POLICY, "app", null)).toBe(true);
	});
	it("an: nur aus den Netzen, v4 und v6, unbekannt = nein", () => {
		expect(networkAllows(office, "app", "203.0.113.9")).toBe(true);
		expect(networkAllows(office, "app", "::ffff:203.0.113.9")).toBe(true);
		expect(networkAllows(office, "app", "2001:db8::1")).toBe(true);
		expect(networkAllows(office, "app", "198.51.100.1")).toBe(false);
		expect(networkAllows(office, "app", null)).toBe(false);
	});
	it("gilt für alle Flächen, außer sie sind ausgenommen", () => {
		for (const s of ["ingest", "wallet", "trustCenter"] as const)
			expect(networkAllows(office, s, "198.51.100.1")).toBe(false);
		const open = {
			...office,
			exceptions: { ...office.exceptions, trustCenter: true },
		};
		expect(networkAllows(open, "trustCenter", "198.51.100.1")).toBe(true);
		expect(networkAllows(open, "ingest", "198.51.100.1")).toBe(false);
	});
	it("Externe: eigene Liste, sonst die der Mitglieder", () => {
		expect(
			networkAllows(office, "app", "203.0.113.9", { external: true }),
		).toBe(true);
		const ext = {
			...office,
			externals: [{ cidr: "198.51.100.0/24", note: "Prüfgesellschaft" }],
		};
		expect(networkAllows(ext, "app", "198.51.100.1", { external: true })).toBe(
			true,
		);
		expect(networkAllows(ext, "app", "203.0.113.9", { external: true })).toBe(
			false,
		);
		// Mitglieder bleiben bei ihrer Liste
		expect(networkAllows(ext, "app", "198.51.100.1")).toBe(false);
	});
});

describe("locksOut", () => {
	it("eigene Adresse muss drin bleiben", () => {
		expect(locksOut(office, "203.0.113.9")).toBe(false);
		expect(locksOut(office, "198.51.100.1")).toBe(true);
		expect(locksOut(office, null)).toBe(true);
		expect(locksOut(EMPTY_NETWORK_POLICY, null)).toBe(false);
	});
});
