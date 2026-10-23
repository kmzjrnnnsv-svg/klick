import { describe, expect, it } from "vitest";
import {
	estimateVsize,
	feeFor,
	type Utxo,
} from "@/lib/wallet/core/coin-select";
import {
	btcFeeCap,
	btcFeeRate,
	btcPerKvbToSatPerVb,
	bumpBtcFee,
	bumpEthFees,
	ethFees,
	MAX_TOKEN_GAS,
	payoutStatusFromView,
	selectInputs,
	tokenGasLimit,
} from "@/lib/wallet/payouts/plan";

// Auszahlungen (rein): Gebühren je Tempo, Deckel, Erhöhung, Münzauswahl ohne
// gesperrte Eingänge, Stand aus der Sicht des Signers.

const GWEI = 1_000_000_000n;

describe("Bitcoin-Gebühren", () => {
	it("Satz je Tempo aus estimatesmartfee, nie unter 1, nie über dem Deckel", () => {
		expect(btcFeeRate(10, "normal", 50)).toBe(10);
		expect(btcFeeRate(10, "fast", 50)).toBe(15);
		expect(btcFeeRate(10, "slow", 50)).toBe(8);
		expect(btcFeeRate(40, "fast", 50)).toBe(50);
		expect(btcFeeRate(0.5, "slow", 50)).toBe(1);
		// keine Schätzung (frischer Knoten): 2 sat/vB als Ausgangswert
		expect(btcFeeRate(null, "normal", 50)).toBe(2);
	});

	it("BTC/kvB exakt als Text → sat/vB", () => {
		expect(btcPerKvbToSatPerVb("0.00010000")).toBe(10);
		expect(btcPerKvbToSatPerVb("0.00001")).toBe(1);
		expect(btcPerKvbToSatPerVb("0.0002345")).toBe(23.45);
		expect(btcPerKvbToSatPerVb(null)).toBeNull();
	});

	it("Deckel der Absicht: doppelter Satz für die erwartete Größe, höchstens Richtlinie", () => {
		expect(btcFeeCap(10, 1, 50)).toBe(feeFor(estimateVsize(2, 2), 20));
		expect(btcFeeCap(40, 2, 50)).toBe(feeFor(estimateVsize(3, 2), 50));
		// mindestens ein Eingang angenommen
		expect(btcFeeCap(5, 0, 50)).toBe(btcFeeCap(5, 1, 50));
	});

	it("Erhöhung: +50 % bzw. +1 sat/vB, nie über dem Deckel", () => {
		expect(bumpBtcFee(1000n, 141, 10_000n)).toBe(1500n);
		// kleine Gebühr: Relay-Regel (+1 sat/vB × vsize) überwiegt
		expect(bumpBtcFee(150n, 141, 10_000n)).toBe(292n);
		expect(bumpBtcFee(1000n, 141, 1499n)).toBeNull();
	});
});

describe("Ethereum-Gebühren", () => {
	it("doppelte Grundgebühr + Trinkgeld je Tempo, höchstens Deckel", () => {
		const n = ethFees(10n * GWEI, GWEI / 2n, "normal", 50);
		expect(n).toEqual({
			maxFeePerGas: 20n * GWEI + GWEI / 2n,
			maxPriorityFeePerGas: GWEI / 2n,
		});
		const f = ethFees(10n * GWEI, GWEI / 2n, "fast", 50);
		expect(f.maxPriorityFeePerGas).toBe(2n * GWEI);
		const capped = ethFees(40n * GWEI, GWEI, "fast", 50);
		expect(capped.maxFeePerGas).toBe(50n * GWEI);
		expect(capped.maxPriorityFeePerGas).toBeLessThanOrEqual(
			capped.maxFeePerGas,
		);
	});

	it("Erhöhung +25 % für beide Werte, sonst null über dem Deckel", () => {
		expect(
			bumpEthFees({ maxFeePerGas: 20n * GWEI, maxPriorityFeePerGas: GWEI }, 50),
		).toEqual({
			maxFeePerGas: 25n * GWEI,
			maxPriorityFeePerGas: (GWEI * 125n) / 100n,
		});
		expect(
			bumpEthFees({ maxFeePerGas: 45n * GWEI, maxPriorityFeePerGas: GWEI }, 50),
		).toBeNull();
	});

	it("Gas für Token: Schätzung + 20 %, höchstens 100 000", () => {
		expect(tokenGasLimit(50_000n)).toBe(60_000n);
		expect(tokenGasLimit(95_000n)).toBe(MAX_TOKEN_GAS);
		expect(tokenGasLimit(null)).toBe(80_000n);
	});
});

describe("Münzauswahl", () => {
	const u = (txid: string, value: bigint): Utxo => ({
		txid,
		vout: 0,
		value,
		branch: 0,
		index: 0,
	});
	it("eingefrorene und reservierte Eingänge bleiben liegen", () => {
		const utxos = [u("aa", 500_000n), u("bb", 100_000n)];
		const all = selectInputs(utxos, 50_000n, 2, new Set());
		expect("inputs" in all && all.inputs.map((i) => i.txid)).toEqual(["aa"]);
		const without = selectInputs(utxos, 50_000n, 2, new Set(["aa:0"]));
		expect("inputs" in without && without.inputs.map((i) => i.txid)).toEqual([
			"bb",
		]);
		expect(selectInputs(utxos, 50_000n, 2, new Set(["aa:0", "bb:0"]))).toEqual({
			error: "insufficient",
		});
	});
});

describe("Stand aus dem Signer", () => {
	const base = {
		cancelled: false,
		vetoed: false,
		approvedAt: null,
		expiresAt: 2000,
		signed: null,
		signUntil: null,
	};
	it("wartet, bestätigt, abgelaufen, abgebrochen", () => {
		expect(payoutStatusFromView(base, 1000)).toBe("awaiting_approval");
		expect(payoutStatusFromView(base, 2001)).toBe("expired");
		expect(
			payoutStatusFromView(
				{ ...base, approvedAt: 1500, signUntil: 5000 },
				3000,
			),
		).toBe("approved");
		// Fenster zum Signieren vorbei, nie signiert
		expect(
			payoutStatusFromView(
				{ ...base, approvedAt: 1500, signUntil: 5000 },
				5001,
			),
		).toBe("expired");
		expect(payoutStatusFromView({ ...base, cancelled: true }, 1000)).toBe(
			"cancelled",
		);
		expect(payoutStatusFromView({ ...base, vetoed: true }, 1000)).toBe(
			"cancelled",
		);
	});
});
