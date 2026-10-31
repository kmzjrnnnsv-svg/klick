import { describe, expect, it } from "vitest";
import {
	anchorLevel,
	CHAIN_CHECK_STALE_MS,
	chainLevel,
	countEvents,
	FAILED_SIGNIN_WARN,
	groupOf,
	lockboxSummary,
	releaseLabel,
	SECURITY_EVENT_ACTIONS,
	SECURITY_EVENT_GROUP_KEYS,
} from "@/lib/admin/security";
import type { GrantLike } from "@/lib/platform-access/rules";
import de from "@/messages/de.json";

const now = new Date("2026-10-31T12:00:00Z");
const ago = (h: number) => new Date(now.getTime() - h * 3600_000);

describe("admin security: Ereignisse", () => {
	it("ordnet Aktionen genau einer Gruppe zu", () => {
		expect(groupOf("auth.signin_failed")).toBe("failed_signin");
		expect(groupOf("admin.ip_blocked")).toBe("ip_blocked");
		expect(groupOf("risk.updated")).toBeNull();
		expect(new Set(SECURITY_EVENT_ACTIONS).size).toBe(
			SECURITY_EVENT_ACTIONS.length,
		);
	});

	it("zählt nur die letzten 7 Tage und nur Fehlversuche", () => {
		const rows = countEvents(
			[
				{ action: "auth.signin_failed", outcome: "failure", at: ago(1) },
				{ action: "auth.2fa_failed", outcome: "failure", at: ago(2) },
				{ action: "auth.2fa_failed", outcome: "success", at: ago(2) },
				{ action: "auth.signin_failed", outcome: "failure", at: ago(24 * 8) },
				{ action: "admin.ip_blocked", outcome: "denied", at: ago(3) },
			],
			now,
		);
		const by = new Map(rows.map((r) => [r.key, r]));
		expect(by.get("failed_signin")).toMatchObject({ n: 2, level: "ok" });
		expect(by.get("ip_blocked")).toMatchObject({ n: 1, level: "warn" });
		expect(by.get("impersonation")).toMatchObject({ n: 0, level: "ok" });
		expect(rows.map((r) => r.key)).toEqual(SECURITY_EVENT_GROUP_KEYS);
	});

	it("viele Fehlversuche werden gelb, sehr viele rot", () => {
		const many = (n: number) =>
			Array.from({ length: n }, () => ({
				action: "auth.signin_failed",
				outcome: "failure",
				at: ago(1),
			}));
		const level = (n: number) =>
			countEvents(many(n), now).find((r) => r.key === "failed_signin")?.level;
		expect(level(FAILED_SIGNIN_WARN - 1)).toBe("ok");
		expect(level(FAILED_SIGNIN_WARN)).toBe("warn");
		expect(level(FAILED_SIGNIN_WARN * 4)).toBe("bad");
	});

	it("jede Gruppe hat einen Text", () => {
		const keys = Object.keys(de.AdminSecurity);
		for (const k of SECURITY_EVENT_GROUP_KEYS) {
			expect(keys).toContain(`group_${k}`);
			expect(keys).toContain(`groupHint_${k}`);
		}
	});
});

const grant = (over: Partial<GrantLike>): GrantLike => ({
	scope: "view",
	targetUserId: null,
	status: "approved",
	requestedBy: "u1",
	requestedAt: ago(2),
	applyAfter: null,
	expiresAt: new Date(now.getTime() + 3600_000),
	revokedAt: null,
	emergencyCategory: null,
	reportDueAt: null,
	reportedAt: null,
	...over,
});

describe("admin security: Lockbox", () => {
	it("zählt aktive Freigaben, Notfälle, fällige Berichte und Anträge", () => {
		const s = lockboxSummary(
			[
				grant({}),
				grant({ status: "emergency", emergencyCategory: "security_incident" }),
				grant({
					status: "emergency",
					emergencyCategory: "legal_order",
					expiresAt: ago(1),
					reportDueAt: ago(0.5),
				}),
				grant({ status: "requested", expiresAt: null }),
			],
			now,
		);
		expect(s).toEqual({
			active: 2,
			emergencies: 1,
			reportsOverdue: 1,
			requested: 1,
			level: "bad",
		});
		expect(lockboxSummary([], now).level).toBe("ok");
	});
});

describe("admin security: Kette, Anker, Release", () => {
	it("Kettenprüfung: keine, gebrochen, alt, frisch", () => {
		expect(chainLevel(null, now).state).toBe("none");
		expect(
			chainLevel({ at: ago(1), checked: 5, broken: ["platform"] }, now),
		).toEqual({ level: "bad", state: "broken" });
		expect(
			chainLevel(
				{
					at: new Date(now.getTime() - CHAIN_CHECK_STALE_MS - 1),
					checked: 5,
					broken: [],
				},
				now,
			).state,
		).toBe("stale");
		expect(chainLevel({ at: ago(2), checked: 5, broken: [] }, now)).toEqual({
			level: "ok",
			state: "ok",
		});
	});

	it("Anker: keiner, alt, bestätigt, wartet", () => {
		expect(anchorLevel(null, now).state).toBe("none");
		expect(
			anchorLevel({ createdAt: ago(48), status: "confirmed" }, now),
		).toEqual({ level: "bad", state: "stale" });
		expect(
			anchorLevel({ createdAt: ago(1), status: "confirmed" }, now).state,
		).toBe("confirmed");
		expect(
			anchorLevel({ createdAt: ago(1), status: "pending" }, now).state,
		).toBe("pending");
	});

	it("Release-Stand als Kurzform", () => {
		expect(releaseLabel({ commit: null, tag: null })).toBeNull();
		expect(releaseLabel({ commit: "0123456789abcdef", tag: null })).toBe(
			"0123456789ab",
		);
		expect(
			releaseLabel({ commit: "0123456789abcdef", tag: "v2026.10.31" }),
		).toBe("v2026.10.31 (0123456789ab)");
	});
});
