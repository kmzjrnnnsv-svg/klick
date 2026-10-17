import { describe, expect, it } from "vitest";
import {
	accessDaysFor,
	isExternal,
	membershipAllowed,
	pickActiveMembership,
	primaryMembershipCount,
	roleLabel,
} from "@/lib/auth/memberships";

const now = new Date("2026-10-17T10:00:00Z").getTime();
const day = 86_400_000;
const row = (
	organizationId: string,
	role: string,
	ageDays: number,
	accessUntil: Date | null = null,
) => ({
	organizationId,
	role,
	createdAt: new Date(now - ageDays * day),
	accessUntil,
});

describe("Mehr-Org-Zugang (ADR-018)", () => {
	it("eine eigene Mitgliedschaft, Berater-Zugänge beliebig viele", () => {
		expect(membershipAllowed([], "owner").ok).toBe(true);
		expect(membershipAllowed(["owner"], "editor")).toEqual({
			ok: false,
			reason: "primary_exists",
		});
		expect(membershipAllowed(["owner"], "auditor").ok).toBe(false);
		expect(membershipAllowed(["owner", "consultant"], "consultant").ok).toBe(
			true,
		);
		// nur Berater-Zugänge: eigene Org ist noch frei
		expect(membershipAllowed(["consultant", "consultant"], "owner").ok).toBe(
			true,
		);
		expect(primaryMembershipCount(["consultant", "editor", "consultant"])).toBe(
			1,
		);
	});

	it("extern sind Prüfer:innen und Berater:innen, beide befristet", () => {
		expect(isExternal("auditor")).toBe(true);
		expect(isExternal("consultant")).toBe(true);
		expect(isExternal("editor")).toBe(false);
		expect(accessDaysFor("consultant")).toBe(90);
		expect(accessDaysFor("auditor")).toBe(42);
		expect(accessDaysFor("owner")).toBeNull();
		expect(roleLabel("consultant")).toBe("Berater:in (extern)");
	});

	it("aktive Org: eigene vor Berater-Zugang, sonst der jüngste gültige", () => {
		const own = row("own", "owner", 300);
		const a = row("a", "consultant", 20, new Date(now + 30 * day));
		const b = row("b", "consultant", 5, new Date(now + 60 * day));
		const old = row("old", "consultant", 1, new Date(now - day));
		expect(pickActiveMembership([a, own, b], now)).toBe("own");
		expect(pickActiveMembership([a, b, old], now)).toBe("b");
		// alles abgelaufen: trotzdem eine — der Guard meldet access_expired
		expect(pickActiveMembership([old], now)).toBe("old");
		expect(pickActiveMembership([], now)).toBeNull();
	});
});
