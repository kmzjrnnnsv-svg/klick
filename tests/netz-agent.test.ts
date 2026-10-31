import { existsSync, mkdtempSync, readFileSync, statSync } from "node:fs";
import { connect, createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { NetzAgent } from "@/netz-agent/agent";
import { parseSwanctlSas, parseWgDump } from "@/netz-agent/parse";
import { serve } from "@/netz-agent/protocol";
import { renderSwanctl } from "@/netz-agent/render";
import { dryRunner } from "@/netz-agent/runner";
import { validateSpec } from "@/netz-agent/spec";
import { buildNetzAgent } from "@/scripts/build-netz-agent";

const ROOT = resolve(import.meta.dirname, "..");
const ID = "0b9f2c1e-4d5a-4b6c-8d7e-1f2a3b4c5d6e";
const ID2 = "1c0e3d2f-5e6b-4c7d-9e8f-2a3b4c5d6e7f";
const KEY = Buffer.alloc(32, 9).toString("base64");
const PSK = Buffer.alloc(32, 3).toString("base64");
const SERVER_KEY = Buffer.alloc(32, 5).toString("base64");

const ipsec = {
	id: ID,
	tech: "ipsec",
	peerIp: "80.1.2.3",
	nets: ["192.168.10.0/24"],
	psk: "x".repeat(43),
};
const wg = {
	id: ID2,
	tech: "wireguard",
	peerIp: "80.4.5.6",
	nets: ["10.20.1.0/24"],
	publicKey: KEY,
	presharedKey: PSK,
};

function setup(replies: Parameters<typeof dryRunner>[0] = {}) {
	const dir = mkdtempSync(join(tmpdir(), "klick-netz-"));
	const swanctlDir = mkdtempSync(join(tmpdir(), "klick-swanctl-"));
	const run = dryRunner({
		"wg genkey": { stdout: `${SERVER_KEY}\n` },
		"wg pubkey": { stdout: `${SERVER_KEY}\n` },
		...replies,
	});
	const agent = new NetzAgent({ dir, swanctlDir, serverIp: "88.99.1.2", run });
	return { dir, swanctlDir, run, agent };
}

describe("Netz-Agent: Soll-Zustand prüfen", () => {
	it("nimmt gültige Tunnel an", () => {
		expect(validateSpec(ipsec)).toEqual(ipsec);
		expect(validateSpec(wg)).toEqual(wg);
	});

	it("lehnt alles andere ab (Felder, Formate, Netze, Technik)", () => {
		const cases: [unknown, string][] = [
			[{ ...ipsec, extra: 1 }, "spec_fields"],
			[{ ...ipsec, id: "../../etc/passwd" }, "spec_id"],
			[{ ...ipsec, peerIp: "192.168.1.1" }, "spec_peer"],
			[{ ...ipsec, peerIp: "80.1.2.3; rm -rf /" }, "spec_peer"],
			[{ ...ipsec, nets: ["10.9.0.0/24"] }, "spec_nets"],
			[{ ...ipsec, nets: ["192.168.10.0/24 accept"] }, "spec_nets"],
			[{ ...ipsec, psk: 'x"\n}secrets{' }, "spec_psk"],
			[{ ...wg, publicKey: "kein-schluessel" }, "spec_key"],
			[{ ...ipsec, tech: "openvpn" }, "spec_tech"],
			[null, "spec_shape"],
		];
		for (const [raw, code] of cases)
			expect(() => validateSpec(raw), JSON.stringify(raw)).toThrow(code);
	});

	it("swanctl-Datei: feste Verfahren, Dienstadresse, Geheimnis in Anführungszeichen", () => {
		const conf = renderSwanctl(
			validateSpec(ipsec) as Extract<
				ReturnType<typeof validateSpec>,
				{ tech: "ipsec" }
			>,
			"88.99.1.2",
		);
		expect(conf).toContain(`klick-${ID} {`);
		expect(conf).toContain("version = 2");
		expect(conf).toContain("remote_addrs = 80.1.2.3");
		expect(conf).toContain("local_ts = 10.21.0.1/32");
		expect(conf).toContain("remote_ts = 192.168.10.0/24");
		expect(conf).toContain(
			"proposals = aes256gcm16-prfsha384-ecp384,aes256-sha256-modp2048",
		);
		expect(conf).toContain(`secret = "${"x".repeat(43)}"`);
	});
});

describe("Netz-Agent: umsetzen (Trockenlauf)", () => {
	it("Start legt Schnittstellen und Schlüssel an", async () => {
		const { agent, run, dir } = setup({ "ip link show*": { code: 1 } });
		await agent.start();
		const cmds = run.calls.map((c) => `${c.bin} ${c.args.join(" ")}`);
		expect(cmds).toContain("ip link add klick-sites type dummy");
		expect(cmds).toContain("ip addr replace 10.21.0.1/32 dev klick-sites");
		expect(cmds).toContain("ip link add wg-sites type wireguard");
		expect(cmds).toContain(
			`wg set wg-sites listen-port 51821 private-key ${join(dir, "wg-sites.key")}`,
		);
		expect(statSync(join(dir, "wg-sites.key")).mode & 0o777).toBe(0o600);
		expect(agent.hello().wgPublicKey).toBe(SERVER_KEY);
	});

	it("IPsec: Datei 0600, swanctl lädt, Firewall-Mengen; zweimal = nichts Neues", async () => {
		const { agent, run, swanctlDir, dir } = setup();
		await agent.start();
		expect(await agent.apply(ipsec)).toEqual({ changed: true });
		const file = join(swanctlDir, `klick-${ID}.conf`);
		expect(statSync(file).mode & 0o777).toBe(0o600);
		expect(statSync(join(dir, "tunnels", `${ID}.json`)).mode & 0o777).toBe(
			0o600,
		);
		const cmds = run.calls.map((c) => `${c.bin} ${c.args.join(" ")}`);
		expect(cmds).toContain("swanctl --load-all --clear --noprompt");
		expect(cmds).toContain(
			"nft add element inet klick site_peers { 80.1.2.3 }",
		);
		expect(cmds).toContain(
			"nft add element inet klick site_nets { 192.168.10.0/24 }",
		);
		const before = run.calls.length;
		expect(await agent.apply(ipsec)).toEqual({ changed: false });
		expect(run.calls.slice(before).some((c) => c.bin === "swanctl")).toBe(
			false,
		);
	});

	it("WireGuard: Preshared Key nur über stdin, Route je Netz", async () => {
		const { agent, run } = setup();
		await agent.apply(wg);
		const peer = run.calls.find((c) => c.bin === "wg" && c.args[2] === "peer");
		expect(peer?.args).toEqual([
			"set",
			"wg-sites",
			"peer",
			KEY,
			"preshared-key",
			"/dev/stdin",
			"allowed-ips",
			"10.20.1.0/24",
		]);
		expect(peer?.input).toBe(`${PSK}\n`);
		expect(run.calls.every((c) => !c.args.join(" ").includes(PSK))).toBe(true);
		expect(
			run.calls.some(
				(c) => c.args.join(" ") === "route replace 10.20.1.0/24 dev wg-sites",
			),
		).toBe(true);
	});

	it("Überschneidung und doppelte Gegenstelle zwischen Tunneln: abgelehnt", async () => {
		const { agent } = setup();
		await agent.apply(ipsec);
		await expect(agent.apply({ ...wg, peerIp: "80.1.2.3" })).rejects.toThrow(
			"peer_taken",
		);
		await expect(
			agent.apply({ ...wg, nets: ["192.168.10.128/25"] }),
		).rejects.toThrow("nets_overlap");
	});

	it("Entfernen: Datei, Peer, Route, Mengen weg; Zustand übersteht Neustart", async () => {
		const s = setup();
		await s.agent.apply(ipsec);
		await s.agent.apply(wg);
		// neuer Agent auf demselben Ordner kennt beide wieder
		const again = new NetzAgent({
			dir: s.dir,
			swanctlDir: s.swanctlDir,
			serverIp: "88.99.1.2",
			run: s.run,
		});
		expect((await again.status()).tunnels.map((t) => t.id).sort()).toEqual(
			[ID, ID2].sort(),
		);
		expect(await again.remove(ID)).toEqual({ removed: true });
		expect(existsSync(join(s.swanctlDir, `klick-${ID}.conf`))).toBe(false);
		expect(await again.remove(ID2)).toEqual({ removed: true });
		const cmds = s.run.calls.map((c) => `${c.bin} ${c.args.join(" ")}`);
		expect(cmds).toContain(`wg set wg-sites peer ${KEY} remove`);
		expect(cmds).toContain("ip route del 10.20.1.0/24 dev wg-sites");
		expect(cmds).toContain(
			"nft delete element inet klick site_peers { 80.1.2.3 }",
		);
		expect(await again.remove(ID)).toEqual({ removed: false });
		await expect(again.remove("nicht-uuid")).rejects.toThrow("spec_id");
	});

	it("Status: IPsec aus swanctl, WireGuard aus dem letzten Handshake", async () => {
		const now = new Date("2026-11-01T10:00:00Z");
		const hs = Math.floor(now.getTime() / 1000) - 60;
		const s = setup({
			"swanctl --list-sas --noblock": {
				stdout: `klick-${ID}: #3, ESTABLISHED, IKEv2, 1a2b\n  local  '88.99.1.2' @ 88.99.1.2[4500]\n  klick-${ID}: #4, reqid 1, INSTALLED, TUNNEL, ESP:AES_GCM_16-256\n`,
			},
			"wg show wg-sites dump": {
				stdout: `PRIV\t${SERVER_KEY}\t51821\toff\n${KEY}\t${PSK}\t80.4.5.6:51820\t10.20.1.0/24\t${hs}\t100\t200\toff\n`,
			},
		});
		const agent = new NetzAgent({
			dir: s.dir,
			swanctlDir: s.swanctlDir,
			serverIp: "88.99.1.2",
			run: s.run,
			now: () => now,
		});
		await agent.apply(ipsec);
		await agent.apply(wg);
		const st = await agent.status();
		expect(st.tunnels.find((t) => t.id === ID)).toMatchObject({
			up: true,
			error: null,
		});
		expect(st.tunnels.find((t) => t.id === ID2)).toMatchObject({
			up: true,
			lastHandshakeAt: new Date(hs * 1000).toISOString(),
		});
	});

	it("Fehler eines Befehls landet im Status des Tunnels", async () => {
		const { agent } = setup({
			"nft add element*": {
				code: 1,
				stderr: "No such file or directory; did you mean table 'klick'?",
			},
		});
		await expect(agent.apply(ipsec)).rejects.toThrow("nft_failed");
		const st = await agent.status();
		expect(st.tunnels[0]?.error).toMatch(/^nft_failed/);
	});
});

describe("Netz-Agent: Ausgaben lesen", () => {
	it("swanctl: nur ESTABLISHED + INSTALLED zählt", () => {
		const m = parseSwanctlSas(
			"a: #1, ESTABLISHED, IKEv2, x\n  a: #2, reqid 1, INSTALLED, TUNNEL\nb: #3, CONNECTING, IKEv2\nc: #4, ESTABLISHED, IKEv2\n",
		);
		expect(m.get("a")).toBe(true);
		expect(m.get("b")).toBe(false);
		expect(m.get("c")).toBe(false);
	});

	it("wg dump: Handshake 0 = nie", () => {
		const d = parseWgDump(
			`P\tPUB\t51821\toff\nK1\t(none)\t(none)\t10.0.0.0/24\t0\t0\t0\toff\n`,
		);
		expect(d.publicKey).toBe("PUB");
		expect(d.handshakes.get("K1")).toBe(0);
	});
});

describe("Netz-Agent: Protokoll", () => {
	it("hello/apply/status über den Socket, unbekannter Befehl, kaputtes JSON", async () => {
		const { agent } = setup();
		const sock = join(
			mkdtempSync(join(tmpdir(), "klick-netz-sock-")),
			"app.sock",
		);
		const server = createServer();
		serve(server, agent, () => {});
		await new Promise<void>((r) => server.listen(sock, () => r()));
		const c = connect(sock);
		const replies: unknown[] = [];
		let buf = "";
		c.setEncoding("utf8");
		c.on("data", (d: string) => {
			buf += d;
			let i = buf.indexOf("\n");
			while (i >= 0) {
				replies.push(JSON.parse(buf.slice(0, i)));
				buf = buf.slice(i + 1);
				i = buf.indexOf("\n");
			}
		});
		c.write(`${JSON.stringify({ id: 1, cmd: "hello" })}\n`);
		c.write(`${JSON.stringify({ id: 2, cmd: "apply", args: ipsec })}\n`);
		c.write(
			`${JSON.stringify({ id: 3, cmd: "apply", args: { ...ipsec, psk: "x" } })}\n`,
		);
		c.write(`${JSON.stringify({ id: 4, cmd: "exec", args: "id" })}\n`);
		c.write("{kaputt\n");
		c.write(`${JSON.stringify({ id: 6, cmd: "status" })}\n`);
		await new Promise<void>((r) => {
			const t = setInterval(() => {
				if (replies.length >= 6) {
					clearInterval(t);
					r();
				}
			}, 10);
		});
		c.end();
		server.close();
		expect(replies[0]).toMatchObject({
			id: 1,
			ok: true,
			result: { version: 1, serviceAddress: "10.21.0.1" },
		});
		expect(replies[1]).toMatchObject({
			id: 2,
			ok: true,
			result: { changed: true },
		});
		expect(replies[2]).toEqual({ id: 3, ok: false, error: "spec_psk" });
		expect(replies[3]).toEqual({ id: 4, ok: false, error: "unknown_command" });
		expect(replies[4]).toEqual({ id: null, ok: false, error: "bad_json" });
		expect(replies[5]).toMatchObject({ id: 6, ok: true });
	});
});

describe("Netz-Agent: Bündel und Betrieb", () => {
	it("Bündel nur aus erlaubten Quellen, keine Pakete, keine App-Module", async () => {
		const out = join(mkdtempSync(join(tmpdir(), "klick-netz-build-")), "n.mjs");
		const { bad, inputs } = await buildNetzAgent({ outfile: out });
		expect(bad).toEqual([]);
		expect(
			inputs.some((i) => i.startsWith("lib/db") || i.startsWith("lib/auth")),
		).toBe(false);
		expect(readFileSync(out, "utf8")).not.toMatch(
			/drizzle|better-auth|child_process.*exec\(/,
		);
	}, 60_000);

	it("Quelltext: kein exec mit Shell, nur execFile", () => {
		const runner = readFileSync(join(ROOT, "netz-agent/runner.ts"), "utf8");
		expect(runner).toMatch(/execFile\(/);
		expect(runner).not.toMatch(/\bexec\(|spawn\(|shell:\s*true/);
	});

	it("Units: root nur mit CAP_NET_ADMIN, kein IP-Verkehr, Socket nur Gruppe klick", () => {
		const lines = (p: string) =>
			readFileSync(join(ROOT, p), "utf8")
				.split("\n")
				.map((l) => l.trim())
				.filter((l) => l && !l.startsWith("#"));
		const svc = lines("deploy/systemd/klick-netz.service");
		for (const d of [
			"CapabilityBoundingSet=CAP_NET_ADMIN",
			"RestrictAddressFamilies=AF_UNIX AF_NETLINK",
			"IPAddressDeny=any",
			"ProtectSystem=strict",
			"ReadWritePaths=/etc/swanctl/conf.d",
			"ConfigurationDirectoryMode=0700",
			"NoNewPrivileges=yes",
			"MemoryDenyWriteExecute=yes",
			"Sockets=klick-netz.socket",
		])
			expect(svc, d).toContain(d);
		expect(svc.find((l) => l.startsWith("ExecStart="))).toContain(
			"/usr/local/lib/klick-netz/netz-agent.mjs",
		);
		expect(svc.join("\n")).not.toMatch(
			/PrivateNetwork=yes|\/opt\/klick\/current/,
		);
		const sock = lines("deploy/systemd/klick-netz.socket");
		expect(sock).toContain("ListenStream=/run/klick-netz/app.sock");
		expect(sock).toContain("SocketGroup=klick");
		expect(sock).toContain("SocketMode=0660");
	});
});
