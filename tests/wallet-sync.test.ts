import { describe, expect, it } from "vitest";
import { btcToSats, satsToBtc } from "@/lib/wallet/rpc/bitcoin";
import {
	addressTopic,
	type EthLog,
	type EthTrace,
	TRANSFER_TOPIC,
} from "@/lib/wallet/rpc/ethereum";
import {
	endpointFrom,
	type FetchLike,
	parseJsonExact,
	RpcError,
	rpcBatch,
	rpcCall,
} from "@/lib/wallet/rpc/http";
import { sanctionKey, screenSources } from "@/lib/wallet/screening";
import { btcObservations } from "@/lib/wallet/sync/bitcoin";
import {
	ethObservations,
	ethScanRange,
	ownSentTxids,
} from "@/lib/wallet/sync/ethereum";
import { planTransfers, unseenPendingTxids } from "@/lib/wallet/sync/plan";

const OURS_BTC = "tb1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu";
const FOREIGN_BTC = "tb1qnjg0jd8228aq7egyzacy8cys3knf9xvrerkf9g";

describe("JSON-RPC", () => {
	it("Beträge bleiben exakt, auch über 2^53 Satoshi-Grenzen hinaus", () => {
		const parsed = parseJsonExact(
			'{"result":{"amount":0.1,"fee":-0.00000141,"confirmations":3}}',
			new Set(["amount", "fee"]),
		) as { result: { amount: string; fee: string; confirmations: number } };
		expect(parsed.result).toEqual({
			amount: "0.1",
			fee: "-0.00000141",
			confirmations: 3,
		});
		expect(btcToSats("0.1")).toBe(10_000_000n);
		expect(btcToSats("-0.00000141")).toBe(-141n);
		expect(btcToSats("20999999.99999999")).toBe(2_099_999_999_999_999n);
		expect(satsToBtc(150_000_001n)).toBe("1.50000001");
		expect(() => btcToSats("1e-8")).toThrow(RpcError);
	});

	it("Zugangsdaten aus der URL werden Basic-Auth, nie Teil der Adresse", () => {
		const ep = endpointFrom("http://klick:geheim%21@10.8.0.2:38332/");
		expect(ep.url).toBe("http://10.8.0.2:38332");
		expect(ep.label).toBe("10.8.0.2:38332");
		expect(ep.headers.authorization).toBe(
			`Basic ${Buffer.from("klick:geheim!").toString("base64")}`,
		);
		expect(() => endpointFrom("file:///etc/passwd")).toThrow();
	});

	it("Batch in Aufrufreihenfolge, Fehler als RpcError ohne Zugangsdaten", async () => {
		const seen: string[] = [];
		const fetchImpl: FetchLike = async (url, init) => {
			seen.push(url);
			const body = JSON.parse(init.body) as { id: number; method: string }[];
			// Antwort in umgekehrter Reihenfolge
			return {
				ok: true,
				status: 200,
				text: async () =>
					JSON.stringify(
						body.map((c) => ({ id: c.id, result: `${c.method}-ok` })).reverse(),
					),
			};
		};
		const ep = endpointFrom("http://u:p@node:8545");
		const out = await rpcBatch<string>(
			ep,
			[
				{ method: "a", params: [] },
				{ method: "b", params: [] },
			],
			{ fetchImpl },
		);
		expect(out).toEqual(["a-ok", "b-ok"]);
		expect(seen[0]).toBe("http://node:8545");

		const failing: FetchLike = async () => ({
			ok: false,
			status: 500,
			text: async () =>
				'{"result":null,"error":{"code":-5,"message":"Invalid or non-wallet transaction id"},"id":1}',
		});
		await expect(
			rpcCall(ep, "gettransaction", ["x"], { fetchImpl: failing }),
		).rejects.toMatchObject({ code: "rpc", rpcCode: -5 });
		const down: FetchLike = async () => {
			throw new TypeError("fetch failed");
		};
		const err = await rpcCall(ep, "x", [], { fetchImpl: down }).catch(
			(e) => e as RpcError,
		);
		expect(err).toBeInstanceOf(RpcError);
		expect((err as RpcError).code).toBe("unreachable");
		expect((err as RpcError).message).not.toContain("u:p");
	});
});

describe("Bitcoin: listsinceblock → Bewegungen", () => {
	const base = {
		txid: "aa",
		vout: 0,
		time: 1_792_700_000,
		blockhash: "bh1",
		blockheight: 100,
		blocktime: 1_792_700_000,
	};

	it("Eingänge nur an eigene Adressen, Bestätigung nach Regel des Netzes", () => {
		const { observations } = btcObservations(
			{
				lastblock: "bh0",
				transactions: [
					{
						...base,
						category: "receive",
						address: OURS_BTC,
						amount: "0.015",
						confirmations: 1,
					},
					{
						...base,
						txid: "bb",
						category: "receive",
						address: FOREIGN_BTC,
						amount: "1",
						confirmations: 5,
					},
				],
			},
			{ ours: new Set([OURS_BTC]), finality: 3 },
		);
		expect(observations).toHaveLength(1);
		expect(observations[0]).toMatchObject({
			direction: "in",
			amount: 1_500_000n,
			outputRef: "in:vout:0",
			status: "pending",
			blockTime: new Date(1_792_700_000_000),
		});
	});

	it("Ausgang mit Gebühr genau einmal je Transaktion", () => {
		const { observations } = btcObservations(
			{
				lastblock: "bh0",
				transactions: [
					{
						...base,
						category: "send",
						address: FOREIGN_BTC,
						amount: "-0.2",
						vout: 0,
						fee: "-0.00000141",
						confirmations: 3,
					},
					{
						...base,
						category: "send",
						address: "tb1qother",
						amount: "-0.1",
						vout: 1,
						fee: "-0.00000141",
						confirmations: 3,
					},
				],
			},
			{ ours: new Set([OURS_BTC]), finality: 3 },
		);
		expect(observations.map((o) => [o.outputRef, o.amount, o.status])).toEqual([
			["out:vout:0", 20_000_000n, "confirmed"],
			["out:fee", 141n, "confirmed"],
			["out:vout:1", 10_000_000n, "confirmed"],
		]);
	});

	it("Reorg und Konflikt: verschwunden", () => {
		const { observations, goneTxids } = btcObservations(
			{
				lastblock: "bh0",
				transactions: [
					{
						...base,
						txid: "conflict",
						category: "receive",
						address: OURS_BTC,
						amount: "0.1",
						confirmations: -2,
					},
				],
				removed: [
					{
						...base,
						txid: "reorged",
						category: "receive",
						address: OURS_BTC,
						amount: "0.1",
						confirmations: 0,
					},
				],
			},
			{ ours: new Set([OURS_BTC]), finality: 1 },
		);
		expect(observations).toHaveLength(0);
		expect([...goneTxids].sort()).toEqual(["conflict", "reorged"]);
	});
});

describe("Abgleich mit gespeicherten Bewegungen", () => {
	const obs = {
		direction: "in" as const,
		asset: "BTC" as const,
		amount: 1n,
		txid: "aa",
		outputRef: "in:vout:0",
		address: OURS_BTC,
		counterparty: null,
		blockHeight: 100,
		blockHash: "bh1",
		blockTime: null,
		confirmations: 3,
		status: "confirmed" as const,
	};
	const stored = {
		id: "t1",
		txid: "aa",
		outputRef: "in:vout:0",
		asset: "BTC",
		status: "pending" as const,
		confirmations: 1,
		blockHeight: 100,
		blockHash: "bh1",
	};

	it("neu, bestätigt, unverändert", () => {
		expect(planTransfers([], [obs]).inserts).toHaveLength(1);
		const plan = planTransfers([stored], [obs]);
		expect(plan.inserts).toHaveLength(0);
		expect(plan.updates[0]).toMatchObject({
			id: "t1",
			status: "confirmed",
			becameConfirmed: true,
		});
		expect(
			planTransfers(
				[{ ...stored, status: "confirmed", confirmations: 3 }],
				[obs],
			).updates,
		).toHaveLength(0);
	});

	it("verschwundene Bitcoin-Zahlung und Ethereum-Reorg im neu gelesenen Bereich", () => {
		expect(
			planTransfers([stored], [], { goneTxids: new Set(["aa"]) }).drops,
		).toEqual([{ id: "t1", txid: "aa" }]);
		// Ethereum: offen im neu gelesenen Bereich, aber nicht mehr gefunden
		expect(
			planTransfers([stored], [], { rescanned: { from: 90, to: 120 } }).drops,
		).toHaveLength(1);
		// außerhalb des Bereichs bleibt sie stehen
		expect(
			planTransfers([stored], [], { rescanned: { from: 101, to: 120 } }).drops,
		).toHaveLength(0);
		// bestätigte Bewegungen fallen nie heraus
		expect(
			planTransfers([{ ...stored, status: "confirmed" }], [], {
				rescanned: { from: 90, to: 120 },
			}).drops,
		).toHaveLength(0);
	});

	it("taucht eine verworfene Zahlung wieder auf, lebt sie wieder", () => {
		const plan = planTransfers([{ ...stored, status: "dropped" }], [obs]);
		expect(plan.updates[0]).toMatchObject({ revived: true });
		expect(unseenPendingTxids([stored], [])).toEqual(["aa"]);
		expect(unseenPendingTxids([stored], [obs])).toEqual([]);
	});
});

describe("Ethereum: Traces und Token-Logs → Bewegungen", () => {
	const ME = "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266";
	const OTHER = "0x70997970c51812dc3a010c7d01b50e0d17dc79c8";
	const USDC = "0x1c7d4b196cb0c7b01d743fbc6116a902379c7238";
	const trace = (over: Partial<EthTrace>): EthTrace => ({
		type: "call",
		action: {
			from: OTHER as `0x${string}`,
			to: ME as `0x${string}`,
			value: "0xde0b6b3a7640000",
			callType: "call",
		},
		blockNumber: 100,
		blockHash: "0xb1",
		transactionHash: "0x01",
		traceAddress: [],
		...over,
	});
	const input = {
		ours: new Set([ME]),
		logs: [] as EthLog[],
		tokens: new Map([
			[
				USDC,
				{
					code: "USDC" as const,
					name: "USD Coin (Test)",
					decimals: 6,
					kind: "erc20" as const,
					emt: true,
					contract: USDC as `0x${string}`,
				},
			],
		]),
		revertedTxs: new Set<string>(),
		erroredFrames: new Map<string, number[][]>(),
		fees: new Map(),
		blockTimes: new Map([["0xb1", new Date(1_792_700_000_000)]]),
		finalizedHeight: 100,
		latestHeight: 105,
	};

	it("ETH direkt und aus Verträgen; delegatecall und Rücknahmen zählen nicht", () => {
		const out = ethObservations({
			...input,
			traces: [
				trace({}),
				trace({ transactionHash: "0x02", traceAddress: [0, 1] }),
				trace({
					transactionHash: "0x03",
					traceAddress: [0],
					action: {
						from: OTHER as `0x${string}`,
						to: ME as `0x${string}`,
						value: "0x1",
						callType: "delegatecall",
					},
				}),
				trace({ transactionHash: "0x04" }),
				trace({ transactionHash: "0x05", traceAddress: [0, 0] }),
				trace({
					transactionHash: "0x06",
					traceAddress: [1],
					error: "Reverted",
				}),
			],
			revertedTxs: new Set(["0x04"]),
			erroredFrames: new Map([["0x05", [[0]]]]),
		});
		expect(out.map((o) => [o.txid, o.outputRef, o.amount])).toEqual([
			["0x01", "in:trace:r", 1_000_000_000_000_000_000n],
			["0x02", "in:trace:r.0.1", 1_000_000_000_000_000_000n],
		]);
		expect(out[0]).toMatchObject({
			status: "confirmed",
			confirmations: 6,
			counterparty: OTHER,
			blockTime: new Date(1_792_700_000_000),
		});
	});

	it("Token nur von hinterlegten Verträgen, Ausgang mit Gebühr", () => {
		const log = (over: Partial<EthLog>): EthLog => ({
			address: USDC as `0x${string}`,
			topics: [TRANSFER_TOPIC, addressTopic(OTHER), addressTopic(ME)],
			data: "0x00000000000000000000000000000000000000000000000000000000004c4b40",
			blockNumber: "0x66",
			blockHash: "0xb2",
			transactionHash: "0x10",
			logIndex: "0x3",
			...over,
		});
		const out = ethObservations({
			...input,
			traces: [
				trace({
					transactionHash: "0x12",
					action: {
						from: ME as `0x${string}`,
						to: USDC as `0x${string}`,
						value: "0x0",
						callType: "call",
					},
					blockNumber: 103,
					blockHash: "0xb3",
				}),
			],
			logs: [
				log({}),
				log({
					address: "0x0000000000000000000000000000000000000bad",
					transactionHash: "0x11",
				}),
				log({
					transactionHash: "0x12",
					topics: [TRANSFER_TOPIC, addressTopic(ME), addressTopic(OTHER)],
					blockNumber: "0x67",
					blockHash: "0xb3",
				}),
			],
			fees: new Map([
				[
					"0x12",
					{
						fee: 21_000n * 2_000_000_000n,
						from: ME,
						blockHeight: 103,
						blockHash: "0xb3",
					},
				],
			]),
		});
		expect(
			out.map((o) => [o.txid, o.outputRef, o.asset, o.amount, o.status]),
		).toEqual([
			["0x10", "in:log:3", "USDC", 5_000_000n, "pending"],
			["0x12", "out:log:3", "USDC", 5_000_000n, "pending"],
			["0x12", "out:fee", "ETH", 42_000_000_000_000n, "pending"],
		]);
		expect(
			ownSentTxids(
				[
					trace({
						transactionHash: "0x12",
						action: {
							from: ME as `0x${string}`,
							to: USDC as `0x${string}`,
							value: "0x0",
						},
					}),
				],
				new Set([ME]),
			),
		).toEqual(["0x12"]);
	});

	it("Scan-Fenster: Start, Aufholen in Stücken, nicht finale Blöcke erneut", () => {
		expect(
			ethScanRange({
				syncHeight: null,
				startHeight: 1000,
				finalizedHeight: 1050,
				latestHeight: 1100,
				maxBlocks: 2000,
			}),
		).toEqual({ from: 1000, to: 1100, nextSyncHeight: 1050 });
		expect(
			ethScanRange({
				syncHeight: 1050,
				startHeight: 1000,
				finalizedHeight: 1080,
				latestHeight: 1110,
				maxBlocks: 2000,
			}),
		).toEqual({ from: 1051, to: 1110, nextSyncHeight: 1080 });
		expect(
			ethScanRange({
				syncHeight: 0,
				startHeight: 0,
				finalizedHeight: 9000,
				latestHeight: 9100,
				maxBlocks: 2000,
			}),
		).toEqual({ from: 1, to: 2000, nextSyncHeight: 2000 });
		expect(
			ethScanRange({
				syncHeight: 1110,
				startHeight: 1000,
				finalizedHeight: 1110,
				latestHeight: 1110,
				maxBlocks: 2000,
			}),
		).toBeNull();
	});
});

describe("Sanktionsprüfung", () => {
	const set = new Map([
		[
			sanctionKey("ethereum", "0x8589427373D6D84E98730D7795D8f6f8731FDA16"),
			{ source: "ofac", reference: "Tornado Cash" },
		],
		[
			sanctionKey("bitcoin", "bc1qsanctioned"),
			{ source: "ofac", reference: null },
		],
	]);
	it("Treffer bei direktem Absender, Groß/Klein egal bei Ethereum", () => {
		expect(
			screenSources(
				"ethereum",
				["0x8589427373d6d84e98730d7795d8f6f8731fda16"],
				set,
			),
		).toEqual({
			result: "hit",
			ref: "ofac:0x8589427373d6d84e98730d7795d8f6f8731fda16 (Tornado Cash)",
		});
		expect(screenSources("bitcoin", [null, "BC1QSANCTIONED"], set).result).toBe(
			"hit",
		);
		expect(screenSources("bitcoin", ["bc1qclean", undefined], set)).toEqual({
			result: "clear",
			ref: null,
		});
	});
});
