import { describe, expect, it } from "vitest";
import type { ReconciliationLine } from "@/db/schema";
import { formatDecimal, isDecimal, parseDecimal } from "@/lib/custody/decimal";
import {
	previousBusinessDay,
	reconcile,
	reviewerAllowed,
} from "@/lib/custody/reconcile";
import {
	nextBackupTestDue,
	nextWalletCode,
	walletIssues,
} from "@/lib/custody/wallet-rules";

describe("Dezimalbeträge", () => {
	it("rechnet ohne Float-Fehler", () => {
		const sum = parseDecimal("0.1") + parseDecimal("0.2");
		expect(formatDecimal(sum)).toBe("0.3");
		expect(formatDecimal(parseDecimal("1,5"))).toBe("1.5");
		expect(formatDecimal(parseDecimal("-0.000000000000000001"))).toBe(
			"-0.000000000000000001",
		);
		expect(formatDecimal(parseDecimal("21000000"))).toBe("21000000");
	});
	it("lehnt Unsinn ab", () => {
		expect(isDecimal("1.000.000")).toBe(false);
		expect(isDecimal("1e6")).toBe(false);
		expect(isDecimal("0.0000000000000000001")).toBe(false);
		expect(() => parseDecimal("abc")).toThrow();
	});
});

const line = (
	symbol: string,
	onChain: string,
	ledger: string,
	tolerance = "0",
): ReconciliationLine => ({
	symbol,
	walletId: null,
	onChain,
	ledger,
	tolerance,
});

describe("Abstimmung Kundenvermögen", () => {
	it("summiert je Kryptowert und erkennt Deckung", () => {
		const r = reconcile([
			line("btc", "1.5", "1"),
			line("BTC", "0.5", "1"),
			line("ETH", "10", "10"),
		]);
		expect(r.status).toBe("matched");
		expect(r.shortfall).toBe(false);
		expect(r.symbols.map((s) => [s.symbol, s.difference, s.state])).toEqual([
			["BTC", "0", "ok"],
			["ETH", "0", "ok"],
		]);
	});
	it("Unterdeckung über der Toleranz ist ein Befund, Überdeckung nur Differenz", () => {
		const r = reconcile([
			line("USDC", "999.5", "1000", "1"),
			line("BTC", "2", "2.1", "0.01"),
			line("ETH", "5.2", "5", "0.1"),
		]);
		expect(r.symbols.map((s) => [s.symbol, s.difference, s.state])).toEqual([
			["BTC", "-0.1", "shortfall"],
			["ETH", "0.2", "surplus"],
			["USDC", "-0.5", "ok"],
		]);
		expect(r.status).toBe("difference");
		expect(r.shortfall).toBe(true);
	});
	it("Stichtag = letzter Geschäftstag in Berlin", () => {
		// Montag 26.10.2026 08:00 Berlin → Freitag 23.10.
		expect(previousBusinessDay(new Date("2026-10-26T07:00:00Z"))).toBe(
			"2026-10-23",
		);
		// Mittwoch kurz nach Mitternacht Berlin (Dienstag 22:30 UTC) → Dienstag
		expect(previousBusinessDay(new Date("2026-10-27T23:30:00Z"))).toBe(
			"2026-10-27",
		);
	});
	it("Vier-Augen-Prinzip, Solo-Modus bei einem Mitglied", () => {
		expect(
			reviewerAllowed({
				preparedByUserId: "a",
				reviewerUserId: "a",
				memberCount: 3,
			}),
		).toBe(false);
		expect(
			reviewerAllowed({
				preparedByUserId: "a",
				reviewerUserId: "b",
				memberCount: 3,
			}),
		).toBe(true);
		expect(
			reviewerAllowed({
				preparedByUserId: "a",
				reviewerUserId: "a",
				memberCount: 1,
			}),
		).toBe(true);
	});
});

describe("Wallet-Regeln", () => {
	const now = new Date("2026-10-22T10:00:00Z");
	const wallet = {
		kind: "cold" as const,
		technology: "multisig" as const,
		purpose: "client" as const,
		quorumRequired: 2,
		quorumTotal: 3,
		status: "active" as const,
		lastBackupTestAt: "2026-06-01",
		nextBackupTestDue: "2026-12-01",
	};
	const holder = (siteId: string | null, extra = {}) => ({
		role: "signer" as const,
		status: "active" as const,
		siteId,
		vettedAt: "2026-01-01",
		until: null,
		...extra,
	});

	it("gesunde Kundenwallet ohne Befund", () => {
		expect(
			walletIssues(wallet, [holder("a"), holder("b"), holder("c")], now),
		).toEqual([]);
	});
	it("meldet Quorum, Standort, Überprüfung, Ablauf und Backup-Test", () => {
		expect(
			walletIssues(
				{ ...wallet, nextBackupTestDue: "2026-10-01" },
				[
					holder("a", { vettedAt: null }),
					holder("a", { until: "2026-09-30" }),
					holder("a", { status: "revoked" }),
				],
				now,
			),
		).toEqual([
			"same_site",
			"holder_not_vetted",
			"holder_expired",
			"backup_test_overdue",
		]);
		expect(
			walletIssues(
				{ ...wallet, quorumRequired: 3 },
				[holder("a"), holder("b")],
				now,
			),
		).toContain("quorum_exceeds_signers");
		expect(
			walletIssues(
				{
					...wallet,
					technology: "single_key",
					quorumRequired: 1,
					lastBackupTestAt: null,
				},
				[holder("a")],
				now,
			),
		).toEqual([
			"single_signer_client",
			"single_key_client",
			"backup_test_missing",
		]);
	});
	it("Unterverwahrer: keine Quorum- und Backup-Prüfung im eigenen Register", () => {
		expect(
			walletIssues(
				{ ...wallet, technology: "sub_custodian", lastBackupTestAt: null },
				[],
				now,
			),
		).toEqual([]);
	});
	it("ausgemusterte Wallets prüfen wir nicht", () => {
		expect(walletIssues({ ...wallet, status: "retired" }, [], now)).toEqual([]);
	});
	it("Backup-Test: kalt alle 6, heiß alle 12 Monate", () => {
		expect(nextBackupTestDue("cold", "2026-01-31")).toBe("2026-07-31");
		expect(nextBackupTestDue("hot", "2026-03-15")).toBe("2027-03-15");
	});
	it("vergibt fortlaufende Codes", () => {
		expect(nextWalletCode([])).toBe("W-01");
		expect(nextWalletCode(["W-01", "W-09", "X-99"])).toBe("W-10");
	});
});

describe("Kein Schlüsselmaterial im Register", () => {
	it("erkennt private Schlüssel, xprv, WIF und Seed-Phrasen", async () => {
		const { looksLikeKeyMaterial } = await import("@/lib/validation/custody");
		// zur Laufzeit gebaut — keine Secret-Muster im Repo
		expect(looksLikeKeyMaterial("ab".repeat(32))).toBe(true);
		expect(looksLikeKeyMaterial(`0x${"cd".repeat(32)}`)).toBe(true);
		expect(looksLikeKeyMaterial(`xprv${"A".repeat(100)}`)).toBe(true);
		expect(looksLikeKeyMaterial(`5${"H".repeat(50)}`)).toBe(true);
		expect(looksLikeKeyMaterial(Array(12).fill("abandon").join(" "))).toBe(
			true,
		);
		// öffentliche Angaben bleiben erlaubt
		expect(looksLikeKeyMaterial(`bc1q${"x".repeat(38)}`)).toBe(false);
		expect(looksLikeKeyMaterial("Treasury Cold 1, Tresor Frankfurt")).toBe(
			false,
		);
		expect(looksLikeKeyMaterial(`0x${"ef".repeat(20)}`)).toBe(false);
	});
});
