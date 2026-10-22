import { sha256 } from "@noble/hashes/sha2.js";
import { createBase58check } from "@scure/base";
import { HDKey } from "@scure/bip32";
import { NETWORK, p2wpkh, TEST_NETWORK } from "@scure/btc-signer";
import { addr } from "micro-eth-signer";
import { NETWORKS, type WalletNetwork } from "./networks";

// Adressen aus einem öffentlichen Kontoschlüssel (xpub) ableiten — Klick
// kennt nie private Schlüssel. Bitcoin: BIP84 (native SegWit, P2WPKH),
// Kontoschlüssel auf Ebene m/84'/c'/a' (Tiefe 3). Ethereum: BIP44,
// Kontoschlüssel m/44'/60'/a' (Tiefe 3), Adresse i = …/0/i.

const b58c = createBase58check(sha256);

// Versionsbytes erweiterter Schlüssel (SLIP-132)
const PUBLIC_VERSIONS = {
	xpub: { v: 0x0488b21e, net: "main" },
	zpub: { v: 0x04b24746, net: "main" },
	tpub: { v: 0x043587cf, net: "test" },
	vpub: { v: 0x045f1cf6, net: "test" },
} as const;
const PRIVATE_VERSIONS = [
	0x0488ade4, // xprv
	0x04b2430c, // zprv
	0x049d7878, // yprv
	0x04358394, // tprv
	0x045f18bc, // vprv
	0x044a4e28, // uprv
];
type Prefix = keyof typeof PUBLIC_VERSIONS;

export const ACCOUNT_DEPTH = 3;
// Adress-Lücke: so viele unbenutzte Adressen werden vorab beobachtet
export const GAP_LIMIT = 20;

export type KeyError =
	| "format"
	| "private"
	| "unsupported"
	| "network_mismatch"
	| "depth";

export class ExtendedKeyError extends Error {
	constructor(readonly code: KeyError) {
		super(code);
	}
}

function versionOf(bytes: Uint8Array): number {
	return (
		(((bytes[0] as number) << 24) |
			((bytes[1] as number) << 16) |
			((bytes[2] as number) << 8) |
			(bytes[3] as number)) >>>
		0
	);
}

// Prüft Format, Art (nur öffentlich), Netz und Ebene; liefert den Schlüssel
// in Standardschreibweise (xpub/tpub) — so versteht ihn auch Bitcoin Core.
export function parseAccountKey(
	key: string,
	network: WalletNetwork,
): { hd: HDKey; standard: string } {
	let bytes: Uint8Array;
	try {
		bytes = b58c.decode(key.trim());
	} catch {
		throw new ExtendedKeyError("format");
	}
	if (bytes.length !== 78) throw new ExtendedKeyError("format");
	const version = versionOf(bytes);
	if (PRIVATE_VERSIONS.includes(version)) throw new ExtendedKeyError("private");
	const prefix = (Object.keys(PUBLIC_VERSIONS) as Prefix[]).find(
		(p) => PUBLIC_VERSIONS[p].v === version,
	);
	if (!prefix) throw new ExtendedKeyError("unsupported");
	const info = NETWORKS[network];
	const wantTest = !info.live;
	if (info.chain === "bitcoin") {
		if ((PUBLIC_VERSIONS[prefix].net === "test") !== wantTest)
			throw new ExtendedKeyError("network_mismatch");
	} else if (prefix !== "xpub") {
		// Ethereum-Wallets (Ledger, Trezor) exportieren den Kontoschlüssel als
		// xpub — auch für Testnetze (gleiche Ableitung)
		throw new ExtendedKeyError("unsupported");
	}
	const std = new Uint8Array(bytes);
	const target =
		PUBLIC_VERSIONS[PUBLIC_VERSIONS[prefix].net === "test" ? "tpub" : "xpub"].v;
	std.set(
		[target >>> 24, (target >>> 16) & 255, (target >>> 8) & 255, target & 255],
		0,
	);
	const standard = b58c.encode(std);
	const hd = HDKey.fromExtendedKey(standard, {
		private: wantTest && info.chain === "bitcoin" ? 0x04358394 : 0x0488ade4,
		public: target,
	});
	if (hd.depth !== ACCOUNT_DEPTH) throw new ExtendedKeyError("depth");
	return { hd, standard };
}

export type AddressBranch = 0 | 1; // 0 = Empfang, 1 = Wechselgeld

function childKey(account: HDKey, branch: AddressBranch, index: number) {
	if (!Number.isInteger(index) || index < 0 || index >= 2 ** 31)
		throw new RangeError("index");
	const pub = account.deriveChild(branch).deriveChild(index).publicKey;
	if (!pub) throw new Error("public key missing");
	return pub;
}

export function deriveAddress(
	account: HDKey,
	network: WalletNetwork,
	branch: AddressBranch,
	index: number,
): string {
	const pub = childKey(account, branch, index);
	const info = NETWORKS[network];
	if (info.chain === "bitcoin") {
		const net = info.bech32 === "bc" ? NETWORK : TEST_NETWORK;
		const out = p2wpkh(pub, net).address;
		if (!out) throw new Error("address");
		return out;
	}
	// Ethereum: Keccak-Hash des unkomprimierten Schlüssels, EIP-55-Prüfsumme
	return addr.fromPublicKey(pub);
}

// Descriptoren für den Beobachtungs-Wallet in Bitcoin Core (ohne Prüfsumme;
// die liefert der Knoten über getdescriptorinfo).
export function btcDescriptors(standardKey: string): {
	receive: string;
	change: string;
} {
	return {
		receive: `wpkh(${standardKey}/0/*)`,
		change: `wpkh(${standardKey}/1/*)`,
	};
}
