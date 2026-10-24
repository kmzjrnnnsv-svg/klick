import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
	batch,
	batchResponse,
	eventHash,
	helloRequest,
	helloResponse,
	parseEventData,
} from "@/lib/wallet-link/contract";
import { EVENT_TYPES } from "@/lib/wallet-link/events";

// Exportvertrag v1 (Plan both.money, W4): feste Beispieldaten beider Seiten.
// Ändert sich eine Prüfsumme, hat sich der Vertrag geändert — dann ist es
// Version 2, nicht ein neuer Fixture-Stand. Neu erzeugen nur bewusst mit
// UPDATE_WALLET_LINK_FIXTURES=1.

const DIR = join(import.meta.dirname, "fixtures", "wallet-link-v1");
const read = (f: string) => JSON.parse(readFileSync(join(DIR, f), "utf8"));

describe("Exportvertrag v1", () => {
	const fixture = read("batch.json");
	const parsed = batch.parse(fixture);

	it("jeder Ereignistyp kommt im Beispielstapel vor und ist gültig", () => {
		expect(parsed.events.map((e) => e.type).sort()).toEqual(
			[...EVENT_TYPES].sort(),
		);
		for (const e of parsed.events) {
			const r = parseEventData(e);
			expect(r.ok, `${e.type}: ${JSON.stringify(r)}`).toBe(true);
		}
	});

	it("Prüfsummen sind stabil (kanonisches JSON)", () => {
		const hashes = Object.fromEntries(
			parsed.events.map((e) => [e.id, eventHash(e)]),
		);
		const file = join(DIR, "hashes.json");
		if (process.env.UPDATE_WALLET_LINK_FIXTURES === "1")
			writeFileSync(file, `${JSON.stringify(hashes, null, "\t")}\n`);
		expect(hashes).toEqual(read("hashes.json"));
		// Schlüsselreihenfolge ändert nichts, Inhalt schon
		const e = parsed.events[0];
		if (!e) throw new Error("leer");
		const reordered = {
			data: e.data,
			occurredAt: e.occurredAt,
			type: e.type,
			seq: e.seq,
			id: e.id,
		};
		expect(eventHash(reordered)).toBe(eventHash(e));
		expect(eventHash({ ...e, seq: e.seq + 1 })).not.toBe(eventHash(e));
	});

	it("unbekannter Typ wird ignoriert, ungültige Daten abgelehnt", () => {
		const e = parsed.events[0];
		if (!e) throw new Error("leer");
		expect(parseEventData({ ...e, type: "future.thing" })).toEqual({
			ok: false,
			reason: "unknown_type",
		});
		const bad = parseEventData({
			...e,
			type: "transfer.upserted",
			data: { transfer: { amount: "1.5" } },
		});
		expect(bad.ok).toBe(false);
		if (!bad.ok) expect(bad.reason).toBe("invalid");
	});

	it("Umschlag: seq steigt, IDs eindeutig, höchstens 200 Ereignisse", () => {
		const twice = { ...fixture, events: [...fixture.events].reverse() };
		expect(batch.safeParse(twice).success).toBe(false);
		const dup = {
			...fixture,
			events: [
				fixture.events[0],
				{ ...fixture.events[1], id: fixture.events[0].id },
			],
		};
		expect(batch.safeParse(dup).success).toBe(false);
		const many = {
			...fixture,
			events: Array.from({ length: 201 }, (_, i) => ({
				...fixture.events[0],
				id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
				seq: i + 1,
			})),
		};
		expect(batch.safeParse(many).success).toBe(false);
	});

	it("Kontoschlüssel (xpub) kommt nie mit", () => {
		expect(JSON.stringify(fixture)).not.toMatch(
			/[xtvz]pub[1-9A-HJ-NP-Za-km-z]{20}/,
		);
		const account = fixture.events.find(
			(e: { type: string }) => e.type === "account.upserted",
		);
		expect(Object.keys(account.data.account)).not.toContain("accountKey");
	});

	it("Antwort und Begrüßung", () => {
		expect(batchResponse.parse(read("response.json")).results).toHaveLength(
			parsed.events.length,
		);
		expect(helloRequest.parse(read("hello-request.json")).linkId).toBe(
			parsed.linkId,
		);
		expect(helloResponse.parse(read("hello-response.json")).lastSeq).toBe(10);
	});
});

describe("Umwandlung Datensatz → Ereignis", () => {
	const t = new Date("2026-10-24T08:00:00.000Z");

	it("Bewegung und Auszahlung ergeben gültige Ereignisdaten", async () => {
		const { transferData, payoutData, dayAccount, closedDay } = await import(
			"@/lib/wallet-link/mapping"
		);
		const { EVENT_DATA } = await import("@/lib/wallet-link/events");
		const tr = transferData(
			{
				id: "1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f",
				accountId: "0b9d8c7a-6e5f-4a3b-8c2d-1e0f9a8b7c6d",
				direction: "out",
				asset: "BTC",
				amount: "80000",
				txid: "ab".repeat(32),
				outputRef: "vout:1",
				address: "tb1qexample",
				counterparty: null,
				blockHeight: null,
				blockHash: null,
				blockTime: null,
				confirmations: 0,
				status: "pending",
				screening: "unchecked",
				frozen: false,
				payoutId: null,
				firstSeenAt: t,
				confirmedAt: null,
			},
			"bitcoin_signet",
			7,
		);
		expect(EVENT_DATA["transfer.upserted"].safeParse(tr).success).toBe(true);
		const po = payoutData(
			{
				id: "2d3e4f5a-6b7c-4d8e-9f0a-1b2c3d4e5f60",
				accountId: "0b9d8c7a-6e5f-4a3b-8c2d-1e0f9a8b7c6d",
				asset: "BTC",
				amount: "80000",
				destination: "tb1qexample",
				destinationLabel: "Ziel",
				speed: "slow",
				status: "awaiting_approval",
				intentId: "ab".repeat(16),
				feeCap: "900",
				fee: null,
				txid: null,
				txids: null,
				createdAt: t,
				approvedAt: null,
				signedAt: null,
				broadcastAt: null,
				confirmedAt: null,
			},
			"bitcoin_signet",
			8,
		);
		expect(EVENT_DATA["payout.upserted"].safeParse(po).success).toBe(true);
		expect(po.payout.txids).toEqual([]);
		const day = dayAccount(
			{
				id: "0b9d8c7a-6e5f-4a3b-8c2d-1e0f9a8b7c6d",
				network: "bitcoin_signet",
				balances: { BTC: { confirmed: "100", pending: "5" } },
				balanceHeight: 10,
				balanceHash: "00",
				balanceAt: t,
			},
			{ BTC: 7n, ETH: 0n },
		);
		expect(day.frozen).toEqual({ BTC: "7" });
		// 00:10 Uhr Berlin (Sommerzeit) schließt den Vortag
		expect(closedDay(new Date("2026-10-23T22:10:00Z"))).toBe("2026-10-23");
		// Winterzeit: 00:10 Uhr Berlin = 23:10 UTC
		expect(closedDay(new Date("2026-12-01T23:10:00Z"))).toBe("2026-12-01");
	});
});
