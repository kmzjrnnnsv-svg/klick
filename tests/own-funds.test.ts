import { describe, expect, it } from "vitest";
import {
	calculateOwnFunds,
	micarClassFor,
	micarOwnFunds,
	riskBearingCapacity,
	zagInitialCapital,
	zagOwnFunds,
} from "@/lib/compliance/own-funds";

describe("own funds", () => {
	it("MiCAR-Klasse aus Diensten (Anhang IV)", () => {
		expect(micarClassFor(["transfer"])).toBe(1);
		expect(micarClassFor(["transfer", "custody"])).toBe(2);
		expect(micarClassFor(["custody", "exchange"])).toBe(3);
		expect(micarClassFor(["platform"])).toBe(3);
	});

	it("MiCAR Art. 67: höherer Wert aus Mindestkapital und ¼ Fixkosten", () => {
		expect(
			micarOwnFunds({ micarClass: 2, fixedOverheadsPrevYear: 100_000 }),
		).toMatchObject({
			minCapital: 125_000,
			required: 125_000,
			basis: "min_capital",
		});
		expect(
			micarOwnFunds({ micarClass: 2, fixedOverheadsPrevYear: 1_520_000 }),
		).toMatchObject({
			overheadsQuarter: 380_000,
			required: 380_000,
			basis: "fixed_overheads",
		});
	});

	it("ZAG § 15 Methode B: gestaffelt × k", () => {
		const remit = zagOwnFunds({
			method: "B",
			serviceKind: "money_remittance_only",
			monthlyPaymentVolume: 2_500_000,
		});
		expect(remit.k).toBe(0.5);
		expect(remit.required).toBe(50_000); // 4 % × 2,5 Mio × 0,5
		const other = zagOwnFunds({
			method: "B",
			serviceKind: "other",
			monthlyPaymentVolume: 12_000_000,
		});
		// 5 Mio × 4 % + 5 Mio × 2,5 % + 2 Mio × 1 % = 200 000 + 125 000 + 20 000
		expect(other.required).toBe(345_000);
		expect(other.initialCapital).toBe(125_000);
	});

	it("ZAG § 12 Anfangskapital", () => {
		expect(zagInitialCapital("money_remittance_only")).toBe(20_000);
		expect(zagInitialCapital("payment_initiation_only")).toBe(50_000);
		expect(zagInitialCapital("other")).toBe(125_000);
	});

	it("Methode A und C", () => {
		expect(
			zagOwnFunds({
				method: "A",
				serviceKind: "other",
				fixedOverheadsPrevYear: 1_000_000,
			}).required,
		).toBe(100_000);
		expect(
			zagOwnFunds({
				method: "C",
				serviceKind: "other",
				relevantIndicator: 3_000_000,
			}).required,
		).toBe(250_000 + 40_000); // 2,5 Mio × 10 % + 0,5 Mio × 8 %
	});

	it("Businessplan 12.4 (2029): Kl. 2, Fixkosten 1,52 Mio, Methode B bei 2,5 Mio/Monat ≈ 440 k€", () => {
		const r = calculateOwnFunds({
			micar: { micarClass: 2, fixedOverheadsPrevYear: 1_520_000 },
			zag: {
				method: "B",
				serviceKind: "money_remittance_only",
				monthlyPaymentVolume: 2_500_000,
			},
			availableOwnFunds: 600_000,
		});
		expect(r.micar?.required).toBe(380_000);
		expect(r.totalRequired).toBeGreaterThanOrEqual(420_000);
		expect(r.totalRequired).toBeLessThanOrEqual(460_000);
		expect(r.buffer).toBe(600_000 - r.totalRequired);
		expect(r.status).toBe("ok");
	});

	it("Status: knapp unter 20 % Puffer, kurz bei Unterdeckung, unbekannt ohne Bestand", () => {
		const tight = calculateOwnFunds({
			micar: { micarClass: 1, fixedOverheadsPrevYear: 0 },
			availableOwnFunds: 55_000,
		});
		expect(tight.status).toBe("tight");
		const short = calculateOwnFunds({
			micar: { micarClass: 1, fixedOverheadsPrevYear: 0 },
			availableOwnFunds: 40_000,
		});
		expect(short.status).toBe("short");
		expect(short.buffer).toBe(-10_000);
		expect(
			calculateOwnFunds({ micar: { micarClass: 1, fixedOverheadsPrevYear: 0 } })
				.status,
		).toBe("unknown");
	});

	it("Risikotragfähigkeit (AT 4.1): Potenzial gegen Risikobeträge", () => {
		const r = riskBearingCapacity({
			ownFunds: 600_000,
			liquidityBuffer: 200_000,
			regulatoryMinimum: 430_000,
			risks: [
				{ category: "operational", amount: 150_000 },
				{ category: "market", amount: 100_000 },
				{ category: "credit", amount: 50_000 },
			],
		});
		expect(r.potential).toBe(370_000);
		expect(r.totalRisk).toBe(300_000);
		expect(r.utilisationPct).toBe(81.1);
		expect(r.status).toBe("tight");
		expect(r.byCategory[0]?.sharePct).toBe(50);
		expect(
			riskBearingCapacity({
				ownFunds: 100_000,
				risks: [{ category: "x", amount: 150_000 }],
			}).status,
		).toBe("exceeded");
	});
});
