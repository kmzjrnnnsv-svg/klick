import { addr } from "micro-eth-signer";
import { describe, expect, it } from "vitest";
import { FEEDS, feedsOfPair, PAIRS } from "@/lib/wallet/core/feeds";
import {
	amountValue,
	changeBp,
	decodeAbiString,
	decodeRoundData,
	encodeGetRoundData,
	formatScaled,
	pairSeries,
	priceAt,
	toScale,
} from "@/lib/wallet/prices";

const w = (v: bigint) =>
	(v < 0n ? (1n << 256n) + v : v).toString(16).padStart(64, "0");
const at = (iso: string) => new Date(iso);

describe("Chainlink-Feeds", () => {
	it("Adressen mit gültiger Prüfsumme, jedes Paar aus vorhandenen Feeds", () => {
		for (const [net, feeds] of Object.entries(FEEDS))
			for (const f of feeds ?? []) {
				expect(addr.isValid(f.address), `${net} ${f.key}`).toBe(true);
				expect(f.description).toBe(f.key.replace("/", " / "));
			}
		for (const p of PAIRS) {
			const { base, divisor } = feedsOfPair(p);
			for (const k of [base, divisor].filter(Boolean))
				expect(
					FEEDS.ethereum_sepolia?.some((f) => f.key === k),
					`${p}`,
				).toBe(true);
		}
	});

	it("latestRoundData dekodieren, unvollständige Runden verwerfen", () => {
		const id = (1n << 64n) | 42n;
		const hex = `0x${w(id)}${w(6_412_345_678_901n)}${w(1_792_700_000n)}${w(1_792_700_100n)}${w(id)}`;
		expect(decodeRoundData(hex)).toEqual({
			roundId: id,
			answer: 6_412_345_678_901n,
			updatedAt: 1_792_700_100,
		});
		expect(
			decodeRoundData(`0x${w(id)}${w(-5n)}${w(1n)}${w(2n)}${w(id)}`),
		).toBeNull();
		expect(
			decodeRoundData(`0x${w(id)}${w(5n)}${w(1n)}${w(0n)}${w(id)}`),
		).toBeNull();
		expect(encodeGetRoundData(id)).toBe(`0x9a6fc8f5${w(id)}`);
		const desc = Buffer.from("BTC / USD").toString("hex");
		expect(decodeAbiString(`0x${w(32n)}${w(9n)}${desc.padEnd(64, "0")}`)).toBe(
			"BTC / USD",
		);
	});
});

describe("Kurse und Werte", () => {
	const btc = [
		{ at: at("2026-10-01T00:00:00Z"), value: 6_000_000_000_000n }, // 60.000 USD
		{ at: at("2026-10-02T00:00:00Z"), value: 6_600_000_000_000n }, // 66.000 USD
	];
	const eur = [
		{ at: at("2026-09-30T00:00:00Z"), value: 120_000_000n }, // 1,20 USD
		{ at: at("2026-10-01T12:00:00Z"), value: 110_000_000n }, // 1,10 USD
	];

	it("Euro als Kreuzkurs mit dem jeweils gültigen EUR/USD", () => {
		const s = pairSeries("BTC/EUR", { "BTC/USD": btc, "EUR/USD": eur });
		expect(s.map((t) => formatScaled(t.value))).toEqual([
			"50.000,00",
			"60.000,00",
		]);
		expect(pairSeries("BTC/USD", { "BTC/USD": btc })).toHaveLength(2);
		expect(pairSeries("BTC/EUR", { "BTC/USD": btc })).toEqual([]);
	});

	it("Kurs zum Zeitpunkt, Veränderung, Wert ohne Float", () => {
		const s = pairSeries("BTC/EUR", { "BTC/USD": btc, "EUR/USD": eur });
		expect(priceAt(s, at("2026-10-01T18:00:00Z"))).toBe(5_000_000_000_000n);
		expect(priceAt(s, at("2026-09-01T00:00:00Z"))).toBeNull();
		expect(changeBp(s, at("2026-10-01T06:00:00Z"))).toBe(2000); // +20 %
		// 0,015 BTC zu 60.000 € = 900 €
		expect(formatScaled(amountValue(1_500_000n, 8, 6_000_000_000_000n))).toBe(
			"900,00",
		);
		expect(toScale(123_456n, 6)).toBe(12_345_600n);
		expect(formatScaled(99_995n, 2)).toBe("0,00");
		expect(formatScaled(123_456_789_012n)).toBe("1.234,57");
	});
});
