import { randomBytes, randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { createConnection } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { addr } from "micro-eth-signer";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assetOf } from "@/lib/wallet/core/assets";
import {
	btcDescriptors,
	deriveAddress,
	parseAccountKey,
} from "@/lib/wallet/core/derive";
import { BitcoinRpc } from "@/lib/wallet/rpc/bitcoin";
import { EthereumRpc } from "@/lib/wallet/rpc/ethereum";
import { endpointFrom } from "@/lib/wallet/rpc/http";
import { type Devchain, startDevchain } from "@/scripts/devchain/server";
import { callSigner, SignerCallError } from "@/signer/client";
import { startSignerServer } from "@/signer/server";
import { Signer } from "@/signer/service";
import { SoftSecurityKey } from "./helpers/security-key";

// Signer über seine Sockets: getrennte Befehle für app.sock und admin.sock,
// Zeilenprotokoll mit Grenzen, Journal-Kopf in jeder Antwort — und der ganze
// Weg einer Auszahlung gegen die Testkette (BTC und ETH).

const RP = "localhost";
const ORIGIN = "http://localhost:3201";
const ORG = randomUUID();
const ALICE = randomUUID();
const BTC_DEST = "tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx";
const ETH_DEST = addr.addChecksum("0x00000000000000000000000000000000000000dd");

let dir: string;
let signer: Signer;
let server: Awaited<ReturnType<typeof startSignerServer>>;
let chain: Devchain;
const appSock = () => join(dir, "app.sock");
const adminSock = () => join(dir, "admin.sock");
const app = <T = Record<string, unknown>>(cmd: string, args: unknown = {}) =>
	callSigner<T>(appSock(), cmd, args).then((r) => r.result);
const admin = <T = Record<string, unknown>>(cmd: string, args: unknown = {}) =>
	callSigner<T>(adminSock(), cmd, args).then((r) => r.result);

async function failure(p: Promise<unknown>) {
	try {
		await p;
	} catch (e) {
		if (e instanceof SignerCallError) return e.signerCode ?? e.code;
		throw e;
	}
	return "ok";
}

// rohe Zeilen an einen Socket, Antworten zeilenweise zurück
function rawExchange(path: string, payload: string, lines: number) {
	return new Promise<string[]>((resolve) => {
		const sock = createConnection(path);
		let buf = "";
		sock.setEncoding("utf8");
		sock.on("connect", () => sock.write(payload));
		sock.on("data", (c: string) => {
			buf += c;
			const out = buf.split("\n").filter(Boolean);
			if (out.length >= lines) {
				sock.destroy();
				resolve(out);
			}
		});
		sock.on("close", () => resolve(buf.split("\n").filter(Boolean)));
	});
}

const key = new SoftSecurityKey();

beforeAll(async () => {
	dir = mkdtempSync(join(tmpdir(), "klick-signer-sock-"));
	signer = Signer.open({ dir, kek: randomBytes(32), dev: true });
	server = await startSignerServer(signer, {
		app: { path: appSock(), mode: 0o660 },
		admin: { path: adminSock(), mode: 0o600 },
		log: () => {},
	});
	chain = await startDevchain({ btcPort: 0, ethPort: 0, stateFile: null });
	// Einrichtung über admin.sock (wie `pnpm signer:admin init`)
	const prep = await admin<{ token: string; words: Record<string, string> }>(
		"seed.prepare",
		{ networks: ["bitcoin_signet", "ethereum_sepolia"] },
	);
	const checks = Object.fromEntries(
		Object.entries(prep.words).map(([n, w]) => {
			const words = w.split(" ");
			return [n, { 3: words[2], 7: words[6], 20: words[19] }];
		}),
	);
	await admin("init.commit", {
		token: prep.token,
		checks,
		orgId: ORG,
		rpId: RP,
		origin: ORIGIN,
	});
	// Schlüssel: Link am Terminal, Abschluss über die Bestätigungsseite (app)
	const start = await admin<{ enrolId: string; url: string }>("enrol.start", {
		person: ALICE,
	});
	const secret = new URL(start.url).hash.match(
		/t=([0-9a-f]{64})/,
	)?.[1] as string;
	await app(
		"enrol.finish",
		key.enrol({ rpId: RP, origin: ORIGIN, enrolId: start.enrolId, secret }),
	);
});

afterAll(async () => {
	await server.close();
	signer.close();
	await chain.close();
});

async function approve(intentId: string) {
	const g = await app<{ challenge: string }>("intent.get", { intentId });
	return app("approve", {
		intentId,
		...key.assert({
			rpId: RP,
			origin: ORIGIN,
			challenge: Buffer.from(g.challenge, "base64url"),
		}),
	});
}

describe("Sockets und Protokoll", () => {
	it("app.sock kann nicht einrichten oder lockern, admin.sock nicht freigeben", async () => {
		expect(await failure(app("init.commit", {}))).toBe("unknown_command");
		expect(await failure(app("policy.set", {}))).toBe("unknown_command");
		expect(await failure(app("unfreeze"))).toBe("unknown_command");
		expect(await failure(app("enrol.start", { person: ALICE }))).toBe(
			"unknown_command",
		);
		expect(await failure(admin("approve", {}))).toBe("unknown_command");
		expect(await failure(admin("sign", {}))).toBe("unknown_command");
		expect(await failure(app("__proto__"))).toBe("unknown_command");
	});

	it("jede Antwort trägt den Journal-Kopf; Änderungen schieben ihn weiter", async () => {
		const a = await callSigner(appSock(), "hello");
		expect(a.head).toMatch(/^[0-9a-f]{64}$/);
		await app("account.create", {
			orgId: ORG,
			accountId: randomUUID(),
			network: "bitcoin_signet",
		});
		const b = await callSigner(appSock(), "journal.head");
		expect(b.seq).toBe(a.seq + 1);
		expect(b.head).not.toBe(a.head);
	});

	it("mehrere Zeilen in Reihenfolge, kaputtes JSON, zu lange Zeile", async () => {
		const out = await rawExchange(
			appSock(),
			`${JSON.stringify({ id: 1, cmd: "hello" })}\n{kaputt\n${JSON.stringify({ id: 3, cmd: "journal.head" })}\n`,
			3,
		);
		const parsed = out.map((l) => JSON.parse(l));
		expect(parsed.map((r) => r.id)).toEqual([1, null, 3]);
		expect(parsed[1].error).toEqual({ code: "bad_request", detail: "json" });
		const long = await rawExchange(appSock(), "x".repeat(1024 * 1024 + 10), 1);
		expect(JSON.parse(long[0] as string).error.code).toBe("line_too_long");
	});

	it("Socket-Rechte: app 0660, admin 0600", async () => {
		const { statSync } = await import("node:fs");
		expect(statSync(appSock()).mode & 0o777).toBe(0o660);
		expect(statSync(adminSock()).mode & 0o777).toBe(0o600);
	});
});

describe("Auszahlung von Anfang bis Ende gegen die Testkette", () => {
	it("Bitcoin: Konto, Eingang, Ziel, Freigabe, Signatur, Senden, Block", async () => {
		const accountId = randomUUID();
		const acc = await app<{ xpub: string }>("account.create", {
			orgId: ORG,
			accountId,
			network: "bitcoin_signet",
		});
		const { hd, standard } = parseAccountKey(acc.xpub, "bitcoin_signet");
		const btc = new BitcoinRpc(
			endpointFrom(`http://dev:dev@${new URL(chain.btcUrl).host}`),
		);
		const wallet = `klick-${accountId}`;
		await btc.ensureWatchWallet(wallet);
		const d = btcDescriptors(standard);
		await btc.importDescriptors(wallet, [
			{ desc: d.receive, range: [0, 20], timestamp: "now" },
			{ desc: d.change, range: [0, 20], timestamp: "now" },
		]);
		chain.btc.faucet(deriveAddress(hd, "bitcoin_signet", 0, 0), 250_000n);
		chain.btc.mine(1);

		const w = await app<{ intentId: string }>("intent.create", {
			kind: "whitelist",
			network: "bitcoin_signet",
			destination: BTC_DEST,
			initiator: ALICE,
		});
		await approve(w.intentId);
		const p = await app<{ intentId: string; text: string }>("intent.create", {
			kind: "payout",
			accountId,
			asset: "BTC",
			amount: "40000",
			destination: BTC_DEST,
			feeCap: "5000",
			initiator: ALICE,
		});
		expect(p.text).toContain(`|${BTC_DEST}|`);
		await approve(p.intentId);

		// Ausgabeplan wie der Job wallet-payouts: UTXOs + Vorgänger-Hex
		const [u] = await btc.listUnspent(wallet, 1);
		const prev = await btc.getTransaction(wallet, u?.txid as string);
		const signed = await app<{ raw: string; txid: string }>("sign", {
			intentId: p.intentId,
			mode: "first",
			plan: {
				inputs: [
					{
						txid: u?.txid,
						vout: u?.vout,
						prevTxHex: prev.hex,
						branch: 0,
						index: 0,
					},
				],
				fee: "1500",
			},
		});
		expect(await btc.sendRawTransaction(signed.raw)).toBe(signed.txid);
		chain.btc.mine(1);
		const since = await btc.listSinceBlock(wallet, null, 1);
		expect(
			since.transactions.find(
				(t) => t.category === "send" && t.txid === signed.txid,
			),
		).toMatchObject({
			address: BTC_DEST,
			amount: "-0.00040000",
			fee: "-0.00001500",
			confirmations: 1,
		});
		const [change] = await btc.listUnspent(wallet, 1);
		expect(change?.amount).toBe("0.00208500");
	});

	it("Ethereum: USDC mit Nonce, Gebühren und Vorprüfung vom Knoten", async () => {
		const accountId = randomUUID();
		const acc = await app<{ xpub: string }>("account.create", {
			orgId: ORG,
			accountId,
			network: "ethereum_sepolia",
		});
		const { hd } = parseAccountKey(acc.xpub, "ethereum_sepolia");
		const from = deriveAddress(hd, "ethereum_sepolia", 0, 0);
		chain.eth.faucet({ address: from, amount: (10n ** 17n).toString() });
		chain.eth.faucet({ address: from, asset: "USDC", amount: "9000000" });
		const eth = new EthereumRpc(endpointFrom(chain.ethUrl));

		const w = await app<{ intentId: string }>("intent.create", {
			kind: "whitelist",
			network: "ethereum_sepolia",
			destination: ETH_DEST,
			initiator: ALICE,
		});
		await approve(w.intentId);
		const p = await app<{ intentId: string }>("intent.create", {
			kind: "payout",
			accountId,
			asset: "USDC",
			amount: "2500000",
			destination: ETH_DEST,
			feeCap: "5000000000000000",
			initiator: ALICE,
		});
		await approve(p.intentId);

		const nonce = await eth.transactionCount(from, "pending");
		const fees = await eth.feeHistory();
		const signed = await app<{ raw: string; txid: string }>("sign", {
			intentId: p.intentId,
			mode: "first",
			plan: {
				nonce: nonce.toString(),
				gasLimit: "80000",
				maxFeePerGas: (fees.nextBaseFee * 2n + fees.priorityFee).toString(),
				maxPriorityFeePerGas: fees.priorityFee.toString(),
			},
		});
		expect(await eth.sendRawTransaction(signed.raw)).toBe(signed.txid);
		chain.eth.mine(1);
		expect((await eth.receipt(signed.txid))?.status).toBe("0x1");
		const usdc = assetOf("ethereum_sepolia", "USDC")?.contract as string;
		expect(await eth.tokenBalance(usdc, ETH_DEST, "latest")).toBe(2_500_000n);
	});

	it("eingefroren: kein Signieren, auch nicht über einen anderen Weg", async () => {
		await app("freeze", { reason: "Test" });
		expect((await app<{ frozen: unknown }>("hello")).frozen).not.toBeNull();
		expect(
			await failure(
				app("intent.create", {
					kind: "whitelist",
					network: "bitcoin_signet",
					destination:
						"tb1qrp33g0q5c5txsp9arysrx4k6zdkfs4nce4xj0gdcccefvpysxf3q0sl5k7",
					initiator: ALICE,
				}),
			),
		).toBe("frozen");
		await admin("unfreeze");
		expect((await app<{ frozen: unknown }>("hello")).frozen).toBeNull();
	});
});
