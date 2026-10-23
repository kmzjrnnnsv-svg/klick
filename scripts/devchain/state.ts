import { createHash, randomBytes } from "node:crypto";
import {
	existsSync,
	mkdirSync,
	readFileSync,
	renameSync,
	writeFileSync,
} from "node:fs";
import { dirname } from "node:path";

// Zustand der lokalen Testkette (scripts/wallet-devchain.ts). Version 2:
// Bitcoin mit echten Roh-Transaktionen (UTXO-Menge, Senden, RBF), Ethereum
// mit Nonces, Gas und Transaktionspool. Ältere Stände werden beiseitegelegt.

export const STATE_VERSION = 2;

export const rnd = (n = 32) => randomBytes(n).toString("hex");
export const sha = (s: string) => createHash("sha256").update(s).digest("hex");
export const nowSec = () => Math.floor(Date.now() / 1000);

export type BtcTx = {
	txid: string;
	hex: string;
	// verbrauchte Ausgänge; leer bei Faucet-Zahlungen
	inputs: { txid: string; vout: number }[];
	outputs: { address: string; sats: string }[];
	fee: string;
	vsize: number;
	// Faucet: angeblicher Absender (für die Sanktionsprüfung)
	from: string;
	block: string | null;
	time: number;
	// durch Reorg/Doppelausgabe ungültig (Bitcoin Core: Bestätigungen < 0)
	conflicted?: boolean;
	// durch eine Transaktion mit höherer Gebühr ersetzt (RBF)
	replacedBy?: string;
};
export type BtcBlock = {
	hash: string;
	height: number;
	time: number;
	txids: string[];
};
export type EthTransfer = {
	hash: string;
	kind: "eth" | "internal" | "token";
	asset: "ETH" | "USDC" | "EURC";
	from: string;
	to: string;
	value: string;
	block: number;
	logIndex: number;
};
// über eth_sendRawTransaction eingereicht
export type EthTx = {
	hash: string;
	raw: string;
	from: string;
	to: string;
	nonce: number;
	value: string;
	data: string;
	gasLimit: string;
	maxFeePerGas: string;
	maxPriorityFeePerGas: string;
	arrival: number;
	block: number | null;
	status?: 0 | 1;
	gasUsed?: string;
	effectiveGasPrice?: string;
	revertReason?: string;
	replacedBy?: string;
	// beim Ausführen verworfen (z. B. Guthaben reicht nicht mehr)
	dropped?: boolean;
};
export type EthBlock = {
	number: number;
	hash: string;
	parent: string;
	time: number;
	baseFee: string;
};
export type State = {
	version: number;
	btc: {
		blocks: BtcBlock[];
		mempool: string[];
		txs: Record<string, BtcTx>;
		orphaned: Record<string, string[]>; // verworfener Block → Transaktionen
		wallets: Record<
			string,
			{ keys: { tpub: string; branch: number; range: number }[] }
		>;
		// Gebührensatz für estimatesmartfee in sat/vB; null = keine Schätzung
		feeRate: number | null;
	};
	eth: {
		blocks: EthBlock[];
		transfers: EthTransfer[];
		txs: Record<string, EthTx>;
		pool: string[];
		// Basisgebühr der nächsten Blöcke und übliches Trinkgeld (Wei)
		baseFee: string;
		tip: string;
		// Circle-Sperrliste (USDC/EURC): transfer() von/an diese Adressen scheitert
		blacklist: string[];
	};
};

export const GWEI = 1_000_000_000n;

export function initialState(): State {
	return {
		version: STATE_VERSION,
		btc: {
			blocks: [{ hash: rnd(), height: 0, time: nowSec(), txids: [] }],
			mempool: [],
			txs: {},
			orphaned: {},
			wallets: {},
			feeRate: 2,
		},
		eth: {
			blocks: [
				{
					number: 0,
					hash: `0x${rnd()}`,
					parent: `0x${"0".repeat(64)}`,
					time: nowSec(),
					baseFee: GWEI.toString(),
				},
			],
			transfers: [],
			txs: {},
			pool: [],
			baseFee: GWEI.toString(),
			tip: GWEI.toString(),
			blacklist: [],
		},
	};
}

// Stand aus der Datei; ein älteres Format wird umbenannt (nicht gelöscht)
export function loadState(file: string | null): State {
	if (!file || !existsSync(file)) return initialState();
	const parsed = JSON.parse(readFileSync(file, "utf8")) as Partial<State>;
	if (parsed.version === STATE_VERSION) return parsed as State;
	const old = `${file}.v${parsed.version ?? 1}`;
	renameSync(file, old);
	console.log(`Älterer Stand der Testkette liegt jetzt in ${old}`);
	return initialState();
}

export function saveState(file: string | null, state: State) {
	if (!file) return;
	mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
	writeFileSync(file, JSON.stringify(state), { mode: 0o600 });
}

export class RpcFault extends Error {
	constructor(
		readonly code: number,
		message: string,
	) {
		super(message);
	}
}

// wie rpcwhitelist in Bitcoin Core: HTTP 403 ohne Inhalt
export class Forbidden extends Error {}
