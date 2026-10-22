import { type RpcEndpoint, RpcError, type RpcOptions, rpcCall } from "./http";

// Bitcoin Core (≥ 28) über JSON-RPC: je Klick-Konto ein Beobachtungs-Wallet
// ohne private Schlüssel (`klick-<kontoId>`), gefüllt mit den Descriptoren
// wpkh(xpub/0/*) und wpkh(xpub/1/*). Beträge kommen als exakter Quelltext
// (Schlüssel `amount`, `fee`, `trusted` …) zurück, nie als Float.

const EXACT = new Set([
	// getbalance liefert den Betrag direkt als Ergebnis
	"result",
	"amount",
	"fee",
	"balance",
	"trusted",
	"untrusted_pending",
	"immature",
	"value",
]);

export type BtcChain = "main" | "signet" | "test" | "testnet4" | "regtest";

export type BtcSinceBlockEntry = {
	address?: string;
	category: "send" | "receive" | "generate" | "immature" | "orphan";
	amount: string;
	vout: number;
	fee?: string;
	confirmations: number;
	blockhash?: string;
	blockheight?: number;
	blocktime?: number;
	txid: string;
	time: number;
	abandoned?: boolean;
};

export type BtcSinceBlock = {
	transactions: BtcSinceBlockEntry[];
	removed?: BtcSinceBlockEntry[];
	lastblock: string;
};

export type BtcRawTx = {
	txid: string;
	vin: {
		coinbase?: string;
		prevout?: { scriptPubKey?: { address?: string } };
	}[];
};

export type BtcImportRequest = {
	desc: string;
	active?: boolean;
	range: [number, number];
	timestamp: number | "now";
	internal?: boolean;
};

export class BitcoinRpc {
	constructor(
		private readonly ep: RpcEndpoint,
		private readonly opts: Pick<RpcOptions, "fetchImpl"> = {},
	) {}

	private call<T>(
		method: string,
		params: unknown[],
		extra: { wallet?: string; timeoutMs?: number } = {},
	): Promise<T> {
		return rpcCall<T>(this.ep, method, params, {
			...this.opts,
			version: "1.0",
			exactKeys: EXACT,
			timeoutMs: extra.timeoutMs,
			path: extra.wallet ? `/wallet/${encodeURIComponent(extra.wallet)}` : "",
		});
	}

	blockchainInfo() {
		return this.call<{
			chain: BtcChain;
			blocks: number;
			headers: number;
			bestblockhash: string;
			initialblockdownload: boolean;
		}>("getblockchaininfo", []);
	}

	listWallets() {
		return this.call<string[]>("listwallets", []);
	}

	// Beobachtungs-Wallet anlegen bzw. laden (idempotent)
	async ensureWatchWallet(name: string): Promise<void> {
		const loaded = await this.listWallets();
		if (loaded.includes(name)) return;
		try {
			await this.call("loadwallet", [name, true]);
			return;
		} catch (e) {
			if (!(e instanceof RpcError) || e.code !== "rpc") throw e;
		}
		// createwallet name disable_private_keys blank passphrase avoid_reuse
		//              descriptors load_on_startup
		await this.call("createwallet", [name, true, true, "", false, true, true]);
	}

	// Descriptor mit Prüfsumme (vom Knoten berechnet)
	async withChecksum(desc: string): Promise<string> {
		const info = await this.call<{ checksum: string }>("getdescriptorinfo", [
			desc,
		]);
		return `${desc}#${info.checksum}`;
	}

	deriveAddresses(descWithChecksum: string, range: [number, number]) {
		return this.call<string[]>("deriveaddresses", [descWithChecksum, range]);
	}

	// Import blockiert bis zum Ende des Rescans — daher lange Wartezeit
	importDescriptors(wallet: string, requests: BtcImportRequest[]) {
		return this.call<{ success: boolean; error?: { message: string } }[]>(
			"importdescriptors",
			[requests],
			{ wallet, timeoutMs: 10 * 60_000 },
		);
	}

	// Bewegungen seit einem Block; `targetConfirmations` hält das Fenster der
	// letzten Blöcke offen, damit Bestätigungen nachgezählt werden
	listSinceBlock(
		wallet: string,
		blockhash: string | null,
		targetConfirmations: number,
	) {
		return this.call<BtcSinceBlock>(
			"listsinceblock",
			[blockhash ?? "", targetConfirmations, true, true],
			{ wallet },
		);
	}

	getTransaction(wallet: string, txid: string) {
		return this.call<{ confirmations: number; txid: string }>(
			"gettransaction",
			[txid, true],
			{ wallet },
		);
	}

	// Mit Vorgänger-Ausgaben (Verbosity 2) — für die Sanktionsprüfung der
	// Absender-Adressen. Mit Block-Hash auch ohne txindex.
	getRawTransaction(txid: string, blockhash?: string) {
		return this.call<BtcRawTx>(
			"getrawtransaction",
			blockhash ? [txid, 2, blockhash] : [txid, 2],
		);
	}

	// Bestand mit mindestens `minconf` Bestätigungen bzw. insgesamt
	async balances(
		wallet: string,
		minconf: number,
	): Promise<{ confirmed: string; total: string }> {
		const confirmed = await this.call<string>(
			"getbalance",
			["*", minconf, true],
			{ wallet },
		);
		const all = await this.call<{
			mine: { trusted: string; untrusted_pending: string; immature: string };
		}>("getbalances", [], { wallet });
		return {
			confirmed,
			total: sumBtc([
				all.mine.trusted,
				all.mine.untrusted_pending,
				all.mine.immature,
			]),
		};
	}
}

// Summe dezimaler BTC-Beträge ohne Float (Ergebnis in BTC, 8 Stellen)
function sumBtc(values: string[]): string {
	let total = 0n;
	for (const v of values) total += btcToSats(v);
	return satsToBtc(total);
}

// Dezimaler BTC-Betrag (Quelltext aus dem Knoten) → Satoshi
export function btcToSats(value: string): bigint {
	const m = /^(-?)(\d+)(?:\.(\d{1,8}))?$/.exec(value.trim());
	if (!m) throw new RpcError("parse", `ungültiger BTC-Betrag: ${value}`);
	const sats =
		BigInt(m[2] as string) * 100_000_000n +
		BigInt((m[3] ?? "").padEnd(8, "0") || "0");
	return m[1] === "-" ? -sats : sats;
}

export function satsToBtc(sats: bigint): string {
	const neg = sats < 0n;
	const abs = neg ? -sats : sats;
	const whole = abs / 100_000_000n;
	const frac = (abs % 100_000_000n).toString().padStart(8, "0");
	return `${neg ? "-" : ""}${whole}.${frac}`;
}
