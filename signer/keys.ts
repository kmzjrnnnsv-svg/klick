import {
	createCipheriv,
	createDecipheriv,
	createHash,
	randomBytes,
} from "node:crypto";
import {
	closeSync,
	existsSync,
	fsyncSync,
	openSync,
	readFileSync,
	renameSync,
	writeFileSync,
} from "node:fs";
import { dirname } from "node:path";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { HDKey } from "@scure/bip32";
import {
	entropyToMnemonic,
	mnemonicToEntropy,
	mnemonicToSeedSync,
	validateMnemonic,
} from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import { NETWORKS, type WalletNetwork } from "../lib/wallet/core/networks";

// Schlüssel des Signers: je Netz eine eigene Seed (BIP39, 24 Wörter). Auf
// der Platte liegt nur die Entropie, verschlüsselt mit AES-256-GCM unter
// dem KEK (systemd-Credential); die AAD bindet Netz und Fingerprint. Das
// Backup sind die Wörter, nicht diese Datei.
// Ableitung: Bitcoin BIP84 m/84'/c'/a' (Signet mit tpub), Ethereum BIP44
// m/44'/60'/a', Adresse …/0/0 — wie lib/wallet/core/derive.ts.

const TEST_VERSIONS = { private: 0x04358394, public: 0x043587cf };

export class KeyError extends Error {
	constructor(readonly code: string) {
		super(`keys_${code}`);
	}
}

export function readKek(path: string): Buffer {
	const raw = readFileSync(path);
	const text = raw.toString("utf8").trim();
	if (/^[0-9a-f]{64}$/i.test(text)) return Buffer.from(text, "hex");
	if (raw.length === 32) return raw;
	throw new KeyError("kek_format");
}

// Entropie aus dem System, optional mit Würfelwürfen gemischt (XOR)
export function newEntropy(dice?: string): Uint8Array {
	const e = randomBytes(32);
	if (dice) {
		const d = createHash("sha256").update(`klick-dice/v1|${dice}`).digest();
		for (let i = 0; i < 32; i += 1) e[i] = (e[i] as number) ^ (d[i] as number);
	}
	return new Uint8Array(e);
}

export const mnemonicOf = (entropy: Uint8Array) =>
	entropyToMnemonic(entropy, wordlist);

export function entropyOfMnemonic(words: string): Uint8Array {
	const m = words.trim().toLowerCase().split(/\s+/).join(" ");
	if (!validateMnemonic(m, wordlist) || m.split(" ").length !== 24)
		throw new KeyError("mnemonic");
	return mnemonicToEntropy(m, wordlist);
}

function masterOf(network: WalletNetwork, entropy: Uint8Array): HDKey {
	const seed = mnemonicToSeedSync(mnemonicOf(entropy), "");
	const info = NETWORKS[network];
	return info.chain === "bitcoin" && !info.live
		? HDKey.fromMasterSeed(seed, TEST_VERSIONS)
		: HDKey.fromMasterSeed(seed);
}

const fp = (hd: HDKey) => hd.fingerprint.toString(16).padStart(8, "0");

export const fingerprintOf = (network: WalletNetwork, entropy: Uint8Array) =>
	fp(masterOf(network, entropy));

function accountPath(network: WalletNetwork, index: number): string {
	if (!Number.isInteger(index) || index < 0 || index >= 2 ** 31)
		throw new KeyError("index");
	const info = NETWORKS[network];
	if (info.chain === "bitcoin") return `m/84'/${info.live ? 0 : 1}'/${index}'`;
	return `m/44'/60'/${index}'`;
}

// ── Datei mit verschlüsselten Seeds ──────────────────────────────────────

type SealedSeed = { fingerprint: string; iv: string; ct: string; tag: string };
export type SeedFile = {
	v: 1;
	seeds: Partial<Record<WalletNetwork, SealedSeed>>;
};

const aad = (network: WalletNetwork, fingerprint: string) =>
	Buffer.from(`klick-signer/v1|seed|${network}|${fingerprint}`);

export function sealSeed(
	kek: Buffer,
	network: WalletNetwork,
	entropy: Uint8Array,
): SealedSeed {
	const fingerprint = fingerprintOf(network, entropy);
	const iv = randomBytes(12);
	const c = createCipheriv("aes-256-gcm", kek, iv);
	c.setAAD(aad(network, fingerprint));
	const ct = Buffer.concat([c.update(entropy), c.final()]);
	return {
		fingerprint,
		iv: iv.toString("base64"),
		ct: ct.toString("base64"),
		tag: c.getAuthTag().toString("base64"),
	};
}

export function openSeed(
	kek: Buffer,
	network: WalletNetwork,
	s: SealedSeed,
): Uint8Array {
	try {
		const d = createDecipheriv("aes-256-gcm", kek, Buffer.from(s.iv, "base64"));
		d.setAAD(aad(network, s.fingerprint));
		d.setAuthTag(Buffer.from(s.tag, "base64"));
		const e = Buffer.concat([d.update(Buffer.from(s.ct, "base64")), d.final()]);
		if (fingerprintOf(network, e) !== s.fingerprint)
			throw new KeyError("fingerprint");
		return new Uint8Array(e);
	} catch (e) {
		if (e instanceof KeyError) throw e;
		throw new KeyError("decrypt");
	}
}

export function readSeedFile(path: string): SeedFile {
	if (!existsSync(path)) return { v: 1, seeds: {} };
	const f = JSON.parse(readFileSync(path, "utf8")) as SeedFile;
	if (f.v !== 1) throw new KeyError("seed_file");
	return f;
}

// atomar: temporäre Datei, fsync, umbenennen, Verzeichnis fsync
export function writeSeedFile(path: string, file: SeedFile) {
	const tmp = `${path}.tmp`;
	writeFileSync(tmp, JSON.stringify(file), { mode: 0o600 });
	const fd = openSync(tmp, "r");
	fsyncSync(fd);
	closeSync(fd);
	renameSync(tmp, path);
	const dir = openSync(dirname(path), "r");
	fsyncSync(dir);
	closeSync(dir);
}

// ── Schlüsselbund im Speicher ────────────────────────────────────────────

export class KeyRing {
	private constructor(private readonly masters: Map<WalletNetwork, HDKey>) {}

	static fromEntropy(
		entries: Partial<Record<WalletNetwork, Uint8Array>>,
	): KeyRing {
		const m = new Map<WalletNetwork, HDKey>();
		for (const [n, e] of Object.entries(entries))
			if (e) m.set(n as WalletNetwork, masterOf(n as WalletNetwork, e));
		return new KeyRing(m);
	}

	static load(file: SeedFile, kek: Buffer): KeyRing {
		const entries: Partial<Record<WalletNetwork, Uint8Array>> = {};
		for (const [n, s] of Object.entries(file.seeds))
			if (s) entries[n as WalletNetwork] = openSeed(kek, n as WalletNetwork, s);
		return KeyRing.fromEntropy(entries);
	}

	networks(): WalletNetwork[] {
		return [...this.masters.keys()];
	}

	fingerprint(network: WalletNetwork): string | null {
		const m = this.masters.get(network);
		return m ? fp(m) : null;
	}

	private account(network: WalletNetwork, index: number): HDKey {
		const m = this.masters.get(network);
		if (!m) throw new KeyError("network");
		return m.derive(accountPath(network, index));
	}

	// öffentlicher Kontoschlüssel (Tiefe 3): tpub für Signet, sonst xpub
	accountXpub(network: WalletNetwork, index: number): string {
		return this.account(network, index).publicExtendedKey;
	}

	btcKeys(network: WalletNetwork, index: number) {
		if (NETWORKS[network].chain !== "bitcoin") throw new KeyError("chain");
		const acc = this.account(network, index);
		return (branch: 0 | 1, i: number) => {
			const k = acc.deriveChild(branch).deriveChild(i);
			if (!k.privateKey || !k.publicKey) throw new KeyError("derive");
			return { priv: k.privateKey, pub: k.publicKey };
		};
	}

	ethPrivateKey(network: WalletNetwork, index: number): Uint8Array {
		if (NETWORKS[network].chain !== "ethereum") throw new KeyError("chain");
		const k = this.account(network, index).deriveChild(0).deriveChild(0);
		if (!k.privateKey) throw new KeyError("derive");
		return k.privateKey;
	}

	// Selbsttest beim Start: je Netz signieren und prüfen
	selfTest(): void {
		const msg = createHash("sha256").update("klick-signer/selftest").digest();
		for (const n of this.networks()) {
			const k = this.account(n, 0).deriveChild(0).deriveChild(0);
			if (!k.privateKey || !k.publicKey) throw new KeyError("selftest");
			const sig = secp256k1.sign(msg, k.privateKey, { prehash: false });
			if (!secp256k1.verify(sig, msg, k.publicKey, { prehash: false }))
				throw new KeyError("selftest");
		}
	}
}
