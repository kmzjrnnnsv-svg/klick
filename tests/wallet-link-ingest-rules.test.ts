import { describe, expect, it } from "vitest";
import { ALERT_CODES } from "@/lib/wallet-link/events";
import {
	ALERT_TODO,
	alertEffect,
	berlinDay,
	ceremonyKind,
	eventOutcome,
	quorumFrom,
	registerWallet,
	taskPriority,
} from "@/lib/wallet-link-ingest/rules";

describe("Empfang aus both.money: Regeln", () => {
	it("Ergebnis je Ereignis: neu, doppelt, wie beim ersten Mal, Widerspruch", () => {
		expect(eventOutcome(null, "h")).toEqual({ kind: "new" });
		expect(
			eventOutcome({ hash: "h", result: "accepted", code: null }, "h"),
		).toEqual({ kind: "known", result: "duplicate" });
		expect(
			eventOutcome({ hash: "h", result: "rejected", code: "invalid" }, "h"),
		).toEqual({ kind: "known", result: "rejected", code: "invalid" });
		expect(
			eventOutcome({ hash: "h", result: "ignored", code: null }, "h"),
		).toEqual({ kind: "known", result: "ignored" });
		expect(
			eventOutcome({ hash: "h", result: "accepted", code: null }, "x"),
		).toEqual({ kind: "conflict" });
	});

	it("Zuordnung der Hinweise", () => {
		expect(alertEffect("unknown_spend")).toBe("incident");
		expect(alertEffect("journal_regressed")).toBe("incident");
		expect(alertEffect("sanctions_hit")).toBe("suspicious_report");
		for (const c of [
			"manual_stop",
			"signer_frozen",
			"signer_unreachable",
			"node_mismatch",
		] as const)
			expect(alertEffect(c)).toBe("task");
		for (const c of ALERT_CODES)
			expect(ALERT_TODO[c].length).toBeGreaterThan(20);
		expect(taskPriority("critical")).toBe("critical");
		expect(taskPriority("medium")).toBe("normal");
	});

	it("Register, Quorum, Zeremonie, Berliner Tag", () => {
		expect(
			registerWallet({
				name: "Hot",
				network: "bitcoin_signet",
				kind: "hot",
				purpose: "client",
				keyFingerprint: "0011aabb",
				firstAddress: null,
				status: "retired",
			}),
		).toEqual({
			name: "Hot (both.money)",
			kind: "hot",
			purpose: "client",
			addressLabel: "Fingerprint 0011aabb",
			status: "retired",
		});
		expect(
			quorumFrom({ policy: { mode: "solo" }, keys: { persons: 0 } }),
		).toEqual({
			required: 1,
			total: 1,
		});
		expect(
			quorumFrom({ policy: { mode: "four_eyes" }, keys: { persons: 3 } }),
		).toEqual({ required: 2, total: 3 });
		expect(ceremonyKind("initialised")).toBe("generation");
		expect(ceremonyKind("keys_changed")).toBe("rotation");
		expect(ceremonyKind("policy_changed")).toBeNull();
		expect(berlinDay(new Date("2026-10-23T22:30:00Z"))).toBe("2026-10-24");
	});
});
