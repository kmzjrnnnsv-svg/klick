import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
	type AccountLike,
	accountState,
	addMonths,
	DEFAULT_ACCOUNT,
	feeState,
	followUpOverdue,
} from "@/lib/admin/contract";
import { ROOT, walkFiles } from "./helpers/walk";

const NOW = new Date("2026-10-28T12:00:00Z");
const acc = (over: Partial<AccountLike> = {}): AccountLike => ({
	...DEFAULT_ACCOUNT,
	...over,
});

describe("Vertrag je Organisation", () => {
	it("ohne Zeile: aktiv, vor dem Audit", () => {
		expect(accountState(null, NOW)).toBe("active");
		expect(feeState(null, NOW)).toEqual({ kind: "before_audit" });
	});

	it("Sperre geht jedem Status vor", () => {
		const a = acc({ status: "trial", suspendedAt: NOW });
		expect(accountState(a, NOW)).toBe("suspended");
	});

	it("gekündigt bis zum Vertragsende, danach beendet ohne Gebühr", () => {
		const later = new Date("2026-12-31T00:00:00Z");
		const earlier = new Date("2026-10-01T00:00:00Z");
		expect(
			accountState(acc({ status: "cancelled", cancelledAt: later }), NOW),
		).toBe("cancelled");
		const ended = acc({
			status: "cancelled",
			cancelledAt: earlier,
			auditPassedAt: earlier,
		});
		expect(accountState(ended, NOW)).toBe("ended");
		expect(feeState(ended, NOW)).toEqual({ kind: "none" });
	});

	it("Jahresgebühr: fällig mit dem bestandenen Audit, dann berechnet", () => {
		const audit = new Date("2026-09-15T00:00:00Z");
		expect(feeState(acc({ auditPassedAt: audit }), NOW)).toEqual({
			kind: "due",
			since: audit,
		});
		const invoiced = feeState(
			acc({ auditPassedAt: audit, feeInvoicedFor: audit }),
			NOW,
		);
		expect(invoiced.kind).toBe("invoiced");
		if (invoiced.kind === "invoiced")
			expect(invoiced.nextAuditExpected.toISOString().slice(0, 10)).toBe(
				"2027-09-15",
			);
		// Folgeaudit bestanden: wieder fällig
		const next = new Date("2027-09-20T00:00:00Z");
		expect(
			feeState(acc({ auditPassedAt: next, feeInvoicedFor: audit }), NOW).kind,
		).toBe("due");
	});

	it("Probezeit kostet nichts", () => {
		expect(
			feeState(acc({ status: "trial", auditPassedAt: NOW }), NOW).kind,
		).toBe("none");
	});

	it("Folgeaudit überfällig nach 12 Monaten", () => {
		expect(
			followUpOverdue(
				acc({ auditPassedAt: new Date("2025-10-01T00:00:00Z") }),
				NOW,
			),
		).toBe(true);
		expect(
			followUpOverdue(
				acc({ auditPassedAt: new Date("2026-01-01T00:00:00Z") }),
				NOW,
			),
		).toBe(false);
	});

	it("Monate addieren hält den Monatsletzten", () => {
		expect(
			addMonths(new Date("2026-01-31T00:00:00Z"), 1).toISOString().slice(0, 10),
		).toBe("2026-02-28");
	});
});

// Jede Fläche einer Org, die die IP-Liste prüft (App, Token, Portale, Trust
// Center), prüft auch die Sperre. Eine neue Fläche ohne Sperre fällt hier auf.
describe("Sperre an jeder Fläche", () => {
	const files = walkFiles(["app", "lib"]).filter(
		(f) => !f.startsWith("lib/net/") && !f.startsWith("lib/org/suspension"),
	);
	const sources = files.map((f) => ({
		f,
		src: readFileSync(join(ROOT, f), "utf8"),
	}));

	it("wer orgNetworkAllows aufruft, ruft auch orgSuspended", () => {
		const callers = sources.filter((s) => s.src.includes("orgNetworkAllows("));
		expect(callers.length).toBeGreaterThanOrEqual(10);
		const missing = callers
			.filter(
				(s) =>
					(s.src.match(/orgNetworkAllows\(/g) ?? []).length >
					(s.src.match(/orgSuspended\(/g) ?? []).length,
			)
			.map((s) => s.f);
		expect(missing).toEqual([]);
	});

	it("requireOrg leitet gesperrte Orgs auf /gesperrt", () => {
		const gates = readFileSync(join(ROOT, "lib/auth/gates.ts"), "utf8");
		expect(gates).toMatch(/case "org_suspended":\s*return "\/gesperrt";/);
	});
});
