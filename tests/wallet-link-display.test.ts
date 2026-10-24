import { describe, expect, it } from "vitest";
import {
	amountText,
	isLiveNetwork,
	networkLabel,
} from "@/lib/wallet-link-ingest/display";

describe("Anzeige der Daten aus both.money", () => {
	it("Beträge mit den Stellen des Assets", () => {
		expect(amountText("bitcoin_signet", "BTC", "150000")).toBe("0,0015 BTC");
		expect(amountText("bitcoin_signet", "XYZ", "5")).toBe(
			"5 (Basiseinheiten) XYZ",
		);
		expect(amountText("bitcoin_signet", "BTC", null)).toBe("—");
		expect(amountText("bitcoin_signet", "BTC", "-1")).toBe("—");
	});

	it("Netze", () => {
		expect(networkLabel("bitcoin_signet")).toContain("Testnetz");
		expect(isLiveNetwork("bitcoin_signet")).toBe(false);
		expect(isLiveNetwork("bitcoin_mainnet")).toBe(true);
		expect(networkLabel("unbekannt")).toBe("unbekannt");
	});
});
