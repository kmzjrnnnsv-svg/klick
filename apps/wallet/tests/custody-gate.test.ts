import {
	clientPurposeAllowed,
	hotAccountAllowed,
} from "@wallet/lib/wallet/custody-gate";
import { describe, expect, it } from "vitest";

describe("Sperre für Kundengelder", () => {
	it("Hot-Konten nur für die Betreiber-Org mit eigenen Beständen", () => {
		expect(hotAccountAllowed({ custodyMode: "own", isOperator: true })).toBe(
			true,
		);
		expect(hotAccountAllowed({ custodyMode: "own", isOperator: false })).toBe(
			false,
		);
		expect(hotAccountAllowed({ custodyMode: "none", isOperator: true })).toBe(
			false,
		);
	});

	it("mit eingetragener Erlaubnis für jede Org", () => {
		expect(
			hotAccountAllowed({ custodyMode: "licensed", isOperator: false }),
		).toBe(true);
	});

	it("Kundengelder (cold) im echten Netz nur mit Erlaubnis", () => {
		const none = { custodyMode: "none", isOperator: false } as const;
		const licensed = { custodyMode: "licensed", isOperator: false } as const;
		expect(clientPurposeAllowed(none, "bitcoin_signet")).toBe(true);
		expect(clientPurposeAllowed(none, "bitcoin_mainnet")).toBe(false);
		expect(clientPurposeAllowed(licensed, "bitcoin_mainnet")).toBe(true);
	});
});
