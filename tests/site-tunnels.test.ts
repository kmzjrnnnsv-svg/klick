import { describe, expect, it } from "vitest";
import { renderPdf } from "@/lib/export/pdf";
import { parseCidr } from "@/lib/net/ip";
import {
	tunnelValues,
	valueRows,
	wireguardConfig,
} from "@/lib/site-tunnels/config";
import {
	agentNetsAllowed,
	checkCustomerNets,
	checkPeerIp,
	effectiveNets,
	PSK_PATTERN,
	rangesOverlap,
	stateNotice,
	transferFor,
	tunnelState,
	WG_KEY_PATTERN,
} from "@/lib/site-tunnels/rules";
import { siteSheet } from "@/lib/site-tunnels/sheet";
import {
	fillStep,
	SITE_VENDORS,
	TRANSFER_STEP,
	VENDOR_GUIDES,
} from "@/lib/site-tunnels/vendors";

const r = (s: string) => {
	const x = parseCidr(s);
	if (!x) throw new Error(s);
	return x;
};

describe("Standort-Tunnel: Netze", () => {
	it("Überschneidung: gleich, enthalten, getrennt", () => {
		expect(rangesOverlap(r("192.168.10.0/24"), r("192.168.10.0/24"))).toBe(
			true,
		);
		expect(rangesOverlap(r("192.168.0.0/16"), r("192.168.10.0/24"))).toBe(true);
		expect(rangesOverlap(r("192.168.10.0/24"), r("192.168.11.0/24"))).toBe(
			false,
		);
		expect(rangesOverlap(r("10.0.0.0/8"), r("fd00::/8"))).toBe(false);
	});

	it("Gegenstelle: nur öffentliche IPv4", () => {
		expect(checkPeerIp("203.0.114.7")).toEqual({ ok: true, ip: "203.0.114.7" });
		expect(checkPeerIp(" 80.1.2.3 ")).toEqual({ ok: true, ip: "80.1.2.3" });
		for (const bad of [
			"192.168.1.1",
			"10.0.0.1",
			"100.64.1.1",
			"127.0.0.1",
			"203.0.113.5",
			"224.0.0.1",
		])
			expect(checkPeerIp(bad)).toEqual({ ok: false, error: "peer_private" });
		for (const bad of ["", "1.2.3", "2001:db8::1", "1.2.3.4/32", "01.2.3.4"])
			expect(checkPeerIp(bad)).toEqual({ ok: false, error: "peer_invalid" });
	});

	it("Kundennetze: privat, ab /16, ohne Doppel", () => {
		expect(checkCustomerNets(["192.168.10.0/24"], [])).toEqual({
			ok: true,
			nets: ["192.168.10.0/24"],
			conflicts: [],
		});
		expect(checkCustomerNets(["192.168.10.7/24"], [])).toMatchObject({
			ok: true,
			nets: ["192.168.10.0/24"],
		});
		expect(checkCustomerNets(["8.8.8.0/24"], [])).toMatchObject({
			error: "net_not_private",
		});
		expect(checkCustomerNets(["10.0.0.0/8"], [])).toMatchObject({
			error: "net_too_large",
		});
		expect(checkCustomerNets(["192.168.1.5"], [])).toMatchObject({
			error: "net_invalid",
		});
		expect(checkCustomerNets([], [])).toMatchObject({ error: "net_count" });
		expect(
			checkCustomerNets(["192.168.0.0/16", "192.168.4.0/24"], []),
		).toMatchObject({ error: "net_duplicate" });
	});

	it("Überschneidung mit Klick-Netzen und anderen Standorten wird gemeldet", () => {
		const c = checkCustomerNets(
			["10.9.0.0/24", "192.168.10.0/24"],
			["192.168.10.0/25"],
		);
		expect(c.ok).toBe(true);
		if (!c.ok) return;
		expect(c.conflicts).toEqual([
			{ net: "10.9.0.0/24", with: "admin", other: "10.9.0.0/24" },
			{ net: "192.168.10.0/24", with: "site", other: "192.168.10.0/25" },
		]);
		const svc = checkCustomerNets(["10.21.0.0/16"], []);
		expect(svc.ok && svc.conflicts.map((x) => x.with)).toEqual(["service"]);
	});

	it("Übergabenetz: gleiche Größe, frei, nie das eigene Netz", () => {
		expect(transferFor(["192.168.1.0/24"], [])).toBe("10.20.1.0/24");
		expect(
			transferFor(["192.168.1.0/24"], ["10.20.1.0/24", "10.20.2.0/26"]),
		).toBe("10.20.3.0/24");
		expect(transferFor(["192.168.1.0/26"], ["10.20.1.0/24"])).toBe(
			"10.20.2.0/26",
		);
		// eigenes Netz im Pool: Kandidat darf es nicht überdecken
		expect(transferFor(["10.20.1.0/24"], [])).toBe("10.20.2.0/24");
		expect(transferFor(["192.168.0.0/23"], [])).toBeNull();
		expect(transferFor(["192.168.1.0/24", "192.168.2.0/24"], [])).toBeNull();
		expect(
			effectiveNets({
				customerNets: ["192.168.1.0/24"],
				transferNet: "10.20.1.0/24",
			}),
		).toEqual(["10.20.1.0/24"]);
	});

	it("Agent prüft zweite Linie: Übergabe erlaubt, Admin/Dienst/Knoten nie", () => {
		expect(agentNetsAllowed(["10.20.4.0/24"])).toBe(true);
		expect(agentNetsAllowed(["192.168.1.0/24", "172.16.0.0/16"])).toBe(true);
		for (const bad of [
			["10.9.0.0/24"],
			["10.21.0.0/24"],
			["10.8.0.0/24"],
			["8.8.8.0/24"],
			["192.168.1.7/24"],
			[],
		])
			expect(agentNetsAllowed(bad)).toBe(false);
	});

	it("Schlüsselformate", () => {
		expect(PSK_PATTERN.test("a".repeat(43))).toBe(true);
		expect(PSK_PATTERN.test("a".repeat(42))).toBe(false);
		expect(WG_KEY_PATTERN.test(`${"A".repeat(42)}A=`)).toBe(true);
		expect(WG_KEY_PATTERN.test(`${"A".repeat(42)}B=`)).toBe(false);
		expect(WG_KEY_PATTERN.test(Buffer.alloc(32, 7).toString("base64"))).toBe(
			true,
		);
	});
});

describe("Standort-Tunnel: Zustand", () => {
	const now = new Date("2026-11-01T10:00:00Z");
	const ago = (ms: number) => new Date(now.getTime() - ms);
	const base = {
		tech: "wireguard" as const,
		connectedAt: null,
		lastHandshakeAt: null,
		lastUp: null,
		lastStatusAt: ago(30_000),
		lastError: null,
	};

	it("WireGuard nach Handshake, IPsec nach SA", () => {
		expect(tunnelState(base, now)).toBe("pending");
		expect(tunnelState({ ...base, lastHandshakeAt: ago(60_000) }, now)).toBe(
			"connected",
		);
		expect(
			tunnelState(
				{ ...base, connectedAt: ago(1e6), lastHandshakeAt: ago(10 * 60_000) },
				now,
			),
		).toBe("down");
		expect(tunnelState({ ...base, tech: "ipsec", lastUp: true }, now)).toBe(
			"connected",
		);
		expect(tunnelState({ ...base, lastError: "nft_failed" }, now)).toBe(
			"error",
		);
		expect(
			tunnelState(
				{ ...base, lastStatusAt: ago(10 * 60_000), connectedAt: ago(1e6) },
				now,
			),
		).toBe("unknown");
	});

	it("Mitteilung: verbunden sofort, getrennt nach 10 min, je Wechsel einmal", () => {
		expect(stateNotice(null, "connected", null, now)).toBe("connected");
		expect(stateNotice("connected", "connected", null, now)).toBeNull();
		expect(stateNotice("connected", "down", ago(5 * 60_000), now)).toBeNull();
		expect(stateNotice("connected", "down", ago(11 * 60_000), now)).toBe(
			"down",
		);
		expect(stateNotice("down", "down", ago(60 * 60_000), now)).toBeNull();
		expect(stateNotice("down", "connected", null, now)).toBe("connected");
		expect(stateNotice(null, "pending", null, now)).toBeNull();
	});
});

describe("Standort-Tunnel: Werte und Anleitungen", () => {
	const server = {
		publicIp: "88.99.1.2",
		wgPublicKey: `${"B".repeat(42)}A=`,
		host: "raza.work",
	};

	it("Werte ohne Geheimnis, WireGuard-Datei mit", () => {
		const v = tunnelValues(
			{
				tech: "wireguard",
				peerIp: "80.1.2.3",
				customerNets: ["192.168.1.0/24"],
				transferNet: "10.20.1.0/24",
			},
			server,
		);
		expect(v.nets).toEqual(["10.20.1.0/24"]);
		const rows = valueRows(v);
		expect(rows.find((x) => x.label.startsWith("Übergabenetz"))?.value).toBe(
			"10.20.1.0/24",
		);
		expect(rows.find((x) => x.label === "Dein Netz im Büro")?.value).toBe(
			"192.168.1.0/24",
		);
		expect(rows.at(-1)?.value).toBe("raza.work zeigt auf 10.21.0.1");
		const conf = wireguardConfig(v, {
			privateKey: "PRIV",
			presharedKey: "PSK",
		});
		expect(conf).toContain("Endpoint = 88.99.1.2:51821");
		expect(conf).toContain("AllowedIPs = 10.21.0.1/32");
		expect(conf).toContain("PrivateKey = PRIV");
		const ipsec = valueRows({ ...v, tech: "ipsec" });
		expect(ipsec.some((x) => x.value.includes("aes256gcm16"))).toBe(true);
		expect(JSON.stringify(ipsec)).not.toContain("PRIV");
	});

	it("jede Marke: Technik passt, Schritte je unterstützter Technik, Du-Form", () => {
		for (const k of SITE_VENDORS) {
			const g = VENDOR_GUIDES[k];
			expect(g.supports, k).toContain(g.tech);
			for (const tech of g.supports) {
				const steps = g.steps[tech];
				expect(steps?.length, `${k}/${tech}`).toBeGreaterThan(2);
				for (const s of steps ?? []) {
					expect(s, k).not.toMatch(/—|\bSie\b|\bIhr(e|en)?\b|\bwir\b/);
					expect(s, k).not.toMatch(/[→←]/);
					const filled = fillStep(s, {
						server: "1.2.3.4",
						service: "10.21.0.1",
						nets: "10.20.1.0/24",
						transfer: "10.20.1.0/24",
						port: 51821,
						host: "raza.work",
					});
					expect(filled, k).not.toMatch(/\{[a-z]+\}/);
				}
			}
		}
		expect(VENDOR_GUIDES.fritzbox.supports).toEqual(["wireguard"]);
		expect(TRANSFER_STEP).toContain("{transfer}");
	});

	it("Blatt für die IT: Schritte mit Werten, ohne Geheimnis, PDF entsteht", () => {
		const v = tunnelValues(
			{
				tech: "ipsec",
				peerIp: "80.1.2.3",
				customerNets: ["192.168.1.0/24"],
				transferNet: "10.20.1.0/24",
			},
			server,
		);
		const doc = siteSheet({
			orgName: "Beispiel GmbH",
			tunnelName: "Büro Frankfurt",
			vendor: "fortinet",
			values: v,
			exportLine: "Export-ID x",
			date: "2026-11-01",
		});
		const text = JSON.stringify(doc);
		expect(text).toContain("netmap");
		expect(text).toContain("88.99.1.2");
		expect(text).not.toMatch(/\{(server|service|nets|transfer|port|host)\}/);
		const pdf = renderPdf(doc, { now: new Date("2026-11-01T10:00:00Z") });
		expect(Buffer.from(pdf).subarray(0, 5).toString()).toBe("%PDF-");
	});
});
