import { describe, expect, it } from "vitest";
import {
	accountStatus,
	isBanActive,
	magicLinkAllowed,
} from "@/lib/auth/account-status";

const NOW = new Date("2026-10-18T10:00:00Z");
const active = { banned: false, banExpires: null, pendingActivation: false };

describe("accountStatus", () => {
	it("aktiv, nicht aktiviert, gesperrt — Sperre geht vor", () => {
		expect(accountStatus(active, NOW)).toBe("active");
		expect(accountStatus({ ...active, pendingActivation: true }, NOW)).toBe(
			"pending",
		);
		expect(
			accountStatus({ ...active, banned: true, pendingActivation: true }, NOW),
		).toBe("blocked");
	});

	it("abgelaufene Sperre zählt als aufgehoben", () => {
		const past = new Date("2026-10-01T00:00:00Z");
		const future = new Date("2026-11-01T00:00:00Z");
		expect(isBanActive({ banned: true, banExpires: null }, NOW)).toBe(true);
		expect(isBanActive({ banned: true, banExpires: future }, NOW)).toBe(true);
		expect(isBanActive({ banned: true, banExpires: past }, NOW)).toBe(false);
		expect(isBanActive({ banned: null, banExpires: future }, NOW)).toBe(false);
		expect(
			accountStatus({ ...active, banned: true, banExpires: past }, NOW),
		).toBe("active");
	});
});

describe("magicLinkAllowed", () => {
	it("bestehende Konten nur aktiv, neue nur mit Einladung", () => {
		expect(
			magicLinkAllowed({ account: active, openInvitation: false }, NOW),
		).toBe(true);
		expect(
			magicLinkAllowed(
				{
					account: { ...active, pendingActivation: true },
					openInvitation: true,
				},
				NOW,
			),
		).toBe(false);
		expect(
			magicLinkAllowed(
				{ account: { ...active, banned: true }, openInvitation: false },
				NOW,
			),
		).toBe(false);
		expect(magicLinkAllowed({ account: null, openInvitation: true }, NOW)).toBe(
			true,
		);
		expect(
			magicLinkAllowed({ account: null, openInvitation: false }, NOW),
		).toBe(false);
	});
});
