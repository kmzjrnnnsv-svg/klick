import {
	chmodSync,
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	renameSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import path from "node:path";
import { type IpRange, parseCidr } from "@/lib/net/ip";
import {
	rangesOverlap,
	SITE_DUMMY_INTERFACE,
	SITE_SERVICE_ADDRESS,
	WG_KEY_PATTERN,
	WG_SITES_INTERFACE,
	WG_SITES_PORT,
} from "@/lib/site-tunnels/rules";
import { parseSwanctlSas, parseWgDump } from "./parse";
import { renderSwanctl, wgPeerArgs } from "./render";
import type { Runner } from "./runner";
import {
	connName,
	SpecError,
	type TunnelSpec,
	validateId,
	validateSpec,
} from "./spec";

// Netz-Agent klick-netz (ADR-033): setzt den Soll-Zustand der Standort-
// Tunnel um, den die App über den Socket schickt. Läuft als root mit nur
// CAP_NET_ADMIN, schreibt nur unter `dir` (/etc/klick-netz) und `swanctlDir`
// (/etc/swanctl/conf.d). Zustand = je Tunnel eine JSON-Datei (0600), beim
// Start nachgespielt (WireGuard-Peers, Routen und nft-Mengen sind flüchtig).
// Fehler eines Tunnels stehen im Status, der Agent selbst läuft weiter.

export const NFT_TABLE = ["inet", "klick"] as const;
export const NFT_PEERS = "site_peers";
export const NFT_NETS = "site_nets";

export type TunnelStatus = {
	id: string;
	tech: TunnelSpec["tech"];
	up: boolean;
	/** WireGuard: letzter Handshake (ISO), sonst null */
	lastHandshakeAt: string | null;
	error: string | null;
};

export type AgentStatus = {
	wgPublicKey: string | null;
	baseError: string | null;
	tunnels: TunnelStatus[];
};

type Opts = {
	dir: string;
	swanctlDir: string;
	serverIp: string;
	run: Runner;
	now?: () => Date;
	log?: (msg: string) => void;
};

export class NetzAgent {
	private readonly specs = new Map<string, TunnelSpec>();
	private readonly errors = new Map<string, string>();
	private wgPublicKey: string | null = null;
	private baseError: string | null = null;
	/** Netze, die der Server selbst an anderen Schnittstellen hat */
	private hostNets: IpRange[] = [];
	private readonly log: (msg: string) => void;

	constructor(private readonly o: Opts) {
		this.log = o.log ?? (() => {});
		mkdirSync(this.tunnelDir, { recursive: true, mode: 0o700 });
		for (const f of readdirSync(this.tunnelDir)) {
			if (!f.endsWith(".json")) continue;
			try {
				const spec = validateSpec(
					JSON.parse(readFileSync(path.join(this.tunnelDir, f), "utf8")),
				);
				if (`${spec.id}.json` === f) this.specs.set(spec.id, spec);
			} catch {
				this.log(`Zustand ${f} unlesbar, übersprungen`);
			}
		}
	}

	private get tunnelDir() {
		return path.join(this.o.dir, "tunnels");
	}

	private writeSecret(file: string, content: string) {
		const tmp = `${file}.tmp-${process.pid}`;
		writeFileSync(tmp, content, { mode: 0o600 });
		chmodSync(tmp, 0o600);
		renameSync(tmp, file);
	}

	private async must(
		bin: Parameters<Runner>[0],
		args: string[],
		input?: string,
	) {
		const r = await this.o.run(bin, args, input === undefined ? {} : { input });
		if (r.code !== 0)
			throw new SpecError(`${bin}_failed: ${r.stderr.trim().slice(0, 200)}`);
		return r;
	}

	/** Schnittstellen und Schlüssel anlegen, gespeicherte Tunnel nachspielen. */
	async start(): Promise<void> {
		await this.readHostNets();
		try {
			await this.ensureBase();
			this.baseError = null;
		} catch (e) {
			this.baseError = e instanceof Error ? e.message : String(e);
			this.log(`Grundlage: ${this.baseError}`);
		}
		for (const spec of this.specs.values()) await this.applyRuntime(spec, null);
		if ([...this.specs.values()].some((s) => s.tech === "ipsec"))
			await this.reloadSwanctl();
	}

	private async ensureBase() {
		const run = this.o.run;
		if (
			(await run("ip", ["link", "show", "dev", SITE_DUMMY_INTERFACE])).code !==
			0
		)
			await this.must("ip", [
				"link",
				"add",
				SITE_DUMMY_INTERFACE,
				"type",
				"dummy",
			]);
		await this.must("ip", [
			"addr",
			"replace",
			`${SITE_SERVICE_ADDRESS}/32`,
			"dev",
			SITE_DUMMY_INTERFACE,
		]);
		await this.must("ip", ["link", "set", SITE_DUMMY_INTERFACE, "up"]);

		const keyFile = path.join(this.o.dir, "wg-sites.key");
		if (!existsSync(keyFile)) {
			const k = (await this.must("wg", ["genkey"])).stdout.trim();
			if (!WG_KEY_PATTERN.test(k)) throw new SpecError("wg_genkey");
			this.writeSecret(keyFile, `${k}\n`);
		}
		const priv = readFileSync(keyFile, "utf8").trim();
		const pub = (await this.must("wg", ["pubkey"], `${priv}\n`)).stdout.trim();
		if (!WG_KEY_PATTERN.test(pub)) throw new SpecError("wg_pubkey");
		this.wgPublicKey = pub;
		if (
			(await run("ip", ["link", "show", "dev", WG_SITES_INTERFACE])).code !== 0
		)
			await this.must("ip", [
				"link",
				"add",
				WG_SITES_INTERFACE,
				"type",
				"wireguard",
			]);
		await this.must("wg", [
			"set",
			WG_SITES_INTERFACE,
			"listen-port",
			String(WG_SITES_PORT),
			"private-key",
			keyFile,
		]);
		await this.must("ip", ["link", "set", WG_SITES_INTERFACE, "up"]);
	}

	hello() {
		return {
			version: 1,
			wgPublicKey: this.wgPublicKey,
			serviceAddress: SITE_SERVICE_ADDRESS,
			serverIp: this.o.serverIp,
		};
	}

	/**
	 * Eigene Netze des Servers (privates Netz beim Hoster, Docker …): ein
	 * Standort darf sie nie überdecken, sonst lenkte eine Route über
	 * wg-sites deren Verkehr um. Nicht lesbar = keine (Trockenlauf).
	 */
	private async readHostNets() {
		const r = await this.o.run("ip", ["-j", "-4", "addr", "show"]);
		if (r.code !== 0) return;
		this.hostNets = parseHostNets(r.stdout);
	}

	private conflicts(spec: TunnelSpec): string | null {
		for (const n of spec.nets) {
			const r = parseCidr(n);
			if (r && this.hostNets.some((h) => rangesOverlap(h, r)))
				return "nets_host";
		}
		for (const other of this.specs.values()) {
			if (other.id === spec.id) continue;
			if (other.peerIp === spec.peerIp) return "peer_taken";
			for (const a of other.nets)
				for (const b of spec.nets) {
					const ra = parseCidr(a);
					const rb = parseCidr(b);
					if (ra && rb && rangesOverlap(ra, rb)) return "nets_overlap";
				}
		}
		return null;
	}

	/** Soll-Zustand eines Tunnels setzen (idempotent). */
	async apply(raw: unknown): Promise<{ changed: boolean }> {
		const spec = validateSpec(raw);
		const clash = this.conflicts(spec);
		if (clash) throw new SpecError(clash);
		const prev = this.specs.get(spec.id) ?? null;
		const changed = !prev || JSON.stringify(prev) !== JSON.stringify(spec);
		if (changed) {
			this.writeSecret(
				path.join(this.tunnelDir, `${spec.id}.json`),
				`${JSON.stringify(spec)}\n`,
			);
			this.specs.set(spec.id, spec);
		}
		// Technik gewechselt: alte Seite abbauen
		if (prev && prev.tech !== spec.tech) await this.teardown(prev);
		await this.applyRuntime(
			spec,
			prev && prev.tech === spec.tech ? prev : null,
		);
		if (spec.tech === "ipsec") {
			const file = path.join(this.o.swanctlDir, `${connName(spec.id)}.conf`);
			const conf = renderSwanctl(spec, this.o.serverIp);
			const old = existsSync(file) ? readFileSync(file, "utf8") : null;
			if (old !== conf) {
				this.writeSecret(file, conf);
				await this.reloadSwanctl();
			}
		}
		this.errors.delete(spec.id);
		return { changed };
	}

	/** Flüchtiger Teil: Peer, Routen, Firewall-Mengen. */
	private async applyRuntime(spec: TunnelSpec, prev: TunnelSpec | null) {
		try {
			if (spec.tech === "wireguard") {
				if (prev?.tech === "wireguard" && prev.publicKey !== spec.publicKey)
					await this.o.run("wg", [
						"set",
						WG_SITES_INTERFACE,
						"peer",
						prev.publicKey,
						"remove",
					]);
				await this.must(
					"wg",
					wgPeerArgs(WG_SITES_INTERFACE, spec),
					`${spec.presharedKey}\n`,
				);
				for (const n of prev?.nets ?? [])
					if (!spec.nets.includes(n))
						await this.o.run("ip", [
							"route",
							"del",
							n,
							"dev",
							WG_SITES_INTERFACE,
						]);
				for (const n of spec.nets)
					await this.must("ip", [
						"route",
						"replace",
						n,
						"dev",
						WG_SITES_INTERFACE,
					]);
			}
			if (prev && prev.peerIp !== spec.peerIp)
				await this.nftDelete(NFT_PEERS, prev.peerIp);
			for (const n of prev?.nets ?? [])
				if (!spec.nets.includes(n)) await this.nftDelete(NFT_NETS, n);
			await this.must("nft", [
				"add",
				"element",
				...NFT_TABLE,
				NFT_PEERS,
				`{ ${spec.peerIp} }`,
			]);
			await this.must("nft", [
				"add",
				"element",
				...NFT_TABLE,
				NFT_NETS,
				`{ ${spec.nets.join(", ")} }`,
			]);
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			this.errors.set(spec.id, msg);
			throw e;
		}
	}

	private async nftDelete(set: string, value: string) {
		await this.o.run("nft", [
			"delete",
			"element",
			...NFT_TABLE,
			set,
			`{ ${value} }`,
		]);
	}

	private async reloadSwanctl() {
		await this.must("swanctl", ["--load-all", "--clear", "--noprompt"]);
	}

	private async teardown(spec: TunnelSpec) {
		if (spec.tech === "wireguard") {
			await this.o.run("wg", [
				"set",
				WG_SITES_INTERFACE,
				"peer",
				spec.publicKey,
				"remove",
			]);
			for (const n of spec.nets)
				await this.o.run("ip", ["route", "del", n, "dev", WG_SITES_INTERFACE]);
		} else {
			const file = path.join(this.o.swanctlDir, `${connName(spec.id)}.conf`);
			if (existsSync(file)) unlinkSync(file);
			await this.reloadSwanctl();
			await this.o.run("swanctl", [
				"--terminate",
				"--ike",
				connName(spec.id),
				"--force",
			]);
		}
		await this.nftDelete(NFT_PEERS, spec.peerIp);
		for (const n of spec.nets) await this.nftDelete(NFT_NETS, n);
	}

	/** Tunnel abbauen und vergessen. Unbekannte ID = nichts zu tun. */
	async remove(rawId: unknown): Promise<{ removed: boolean }> {
		const id = validateId(rawId);
		const spec = this.specs.get(id);
		if (!spec) return { removed: false };
		await this.teardown(spec);
		const file = path.join(this.tunnelDir, `${id}.json`);
		if (existsSync(file)) unlinkSync(file);
		this.specs.delete(id);
		this.errors.delete(id);
		return { removed: true };
	}

	async status(): Promise<AgentStatus> {
		const specs = [...this.specs.values()];
		let sas = new Map<string, boolean>();
		if (specs.some((s) => s.tech === "ipsec")) {
			const r = await this.o.run("swanctl", ["--list-sas", "--noblock"]);
			if (r.code === 0) sas = parseSwanctlSas(r.stdout);
		}
		let hs = new Map<string, number>();
		if (specs.some((s) => s.tech === "wireguard")) {
			const r = await this.o.run("wg", ["show", WG_SITES_INTERFACE, "dump"]);
			if (r.code === 0) hs = parseWgDump(r.stdout).handshakes;
		}
		return {
			wgPublicKey: this.wgPublicKey,
			baseError: this.baseError,
			tunnels: specs.map((s) => {
				const seconds = s.tech === "wireguard" ? (hs.get(s.publicKey) ?? 0) : 0;
				const last = seconds > 0 ? new Date(seconds * 1000) : null;
				const now = (this.o.now ?? (() => new Date()))();
				return {
					id: s.id,
					tech: s.tech,
					up:
						s.tech === "ipsec"
							? sas.get(connName(s.id)) === true
							: Boolean(last && now.getTime() - last.getTime() <= 180_000),
					lastHandshakeAt: last?.toISOString() ?? null,
					error: this.errors.get(s.id) ?? null,
				};
			}),
		};
	}
}

/** `ip -j -4 addr show` lesen: Netze außer lo, wg-sites und klick-sites. */
export function parseHostNets(json: string): IpRange[] {
	let data: unknown;
	try {
		data = JSON.parse(json);
	} catch {
		return [];
	}
	if (!Array.isArray(data)) return [];
	const out: IpRange[] = [];
	for (const link of data as {
		ifname?: unknown;
		addr_info?: { family?: unknown; local?: unknown; prefixlen?: unknown }[];
	}[]) {
		if (
			typeof link?.ifname !== "string" ||
			["lo", WG_SITES_INTERFACE, SITE_DUMMY_INTERFACE].includes(link.ifname)
		)
			continue;
		for (const a of link.addr_info ?? []) {
			if (a.family !== "inet" || typeof a.local !== "string") continue;
			const r = parseCidr(`${a.local}/${Number(a.prefixlen)}`);
			if (r) out.push(r);
		}
	}
	return out;
}
