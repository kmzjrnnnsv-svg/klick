import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
	grantableActions,
	sanitizePermissions,
} from "@/lib/auth/permission-catalog";
import { roleAllows } from "@/lib/auth/permissions";
import {
	isWalletUnlocked,
	passkeyOldEnough,
	WALLET_MIN_PASSKEY_AGE_MS,
	WALLET_UNLOCK_MS,
	walletUnlockRemainingMs,
} from "@/lib/auth/session-rules";
import { buildWalletNav } from "@/lib/nav";
import { walletReturnPath } from "@/lib/wallet/return-path";

const ORG = "org-a";
const now = Date.UTC(2026, 9, 22, 10, 0, 0);
const at = (msAgo: number) => new Date(now - msAgo);

describe("Wallet entsperren", () => {
	it("gilt 15 Minuten ab Bestätigung, nur in derselben Org", () => {
		const s = { walletUnlockedAt: at(60_000), walletUnlockOrgId: ORG };
		expect(isWalletUnlocked(s, ORG, now)).toBe(true);
		expect(isWalletUnlocked(s, "org-b", now)).toBe(false);
		expect(
			isWalletUnlocked(
				{ walletUnlockedAt: at(WALLET_UNLOCK_MS + 1), walletUnlockOrgId: ORG },
				ORG,
				now,
			),
		).toBe(false);
		expect(walletUnlockRemainingMs(s, ORG, now)).toBe(
			WALLET_UNLOCK_MS - 60_000,
		);
	});

	it("nie ohne Bestätigung, nie in einer Impersonation, nie aus der Zukunft", () => {
		expect(isWalletUnlocked({}, ORG, now)).toBe(false);
		expect(
			isWalletUnlocked(
				{
					walletUnlockedAt: at(1000),
					walletUnlockOrgId: ORG,
					impersonatedBy: "x",
				},
				ORG,
				now,
			),
		).toBe(false);
		expect(
			isWalletUnlocked(
				{ walletUnlockedAt: at(-60_000), walletUnlockOrgId: ORG },
				ORG,
				now,
			),
		).toBe(false);
		expect(walletUnlockRemainingMs({}, ORG, now)).toBe(0);
	});

	it("mit Echtgeld nur Passkeys ab 72 Stunden", () => {
		expect(passkeyOldEnough(at(1000), { liveEnabled: false }, now)).toBe(true);
		expect(passkeyOldEnough(at(1000), { liveEnabled: true }, now)).toBe(false);
		expect(
			passkeyOldEnough(
				at(WALLET_MIN_PASSKEY_AGE_MS),
				{ liveEnabled: true },
				now,
			),
		).toBe(true);
		expect(passkeyOldEnough(null, { liveEnabled: true }, now)).toBe(false);
	});
});

describe("Wallet-Rechte", () => {
	it("Inhaber:innen alles, Bearbeiter:innen lesen + anstoßen, Externe nichts", () => {
		expect(roleAllows("owner", { wallet: ["manage", "approve"] })).toBe(true);
		expect(roleAllows("editor", { wallet: ["read", "initiate"] })).toBe(true);
		expect(roleAllows("editor", { wallet: ["approve"] })).toBe(false);
		expect(roleAllows("editor", { wallet: ["manage"] })).toBe(false);
		for (const r of ["viewer", "auditor", "consultant"] as const)
			expect(roleAllows(r, { wallet: ["read"] }), r).toBe(false);
	});

	it("eigene Rollen: lesen, Auszahlung anlegen, Freigaben sehen — verwalten bleibt Inhaber:innen", () => {
		// seit Phase 2 prüfen Actions initiate/approve (Senden, Adressbuch)
		expect(grantableActions("wallet")).toEqual(["read", "initiate", "approve"]);
		expect(
			sanitizePermissions({
				wallet: ["read", "manage", "approve", "initiate"],
			}),
		).toEqual({ wallet: ["read", "initiate", "approve"] });
	});
});

describe("Wallet-Bereich", () => {
	it("Rückweg nach dem Entsperren nur auf Wallet-Seiten", () => {
		expect(walletReturnPath("/wallet")).toBe("/wallet");
		expect(walletReturnPath("/wallet/konten/abc-1")).toBe(
			"/wallet/konten/abc-1",
		);
		expect(walletReturnPath("/wallet/bewegungen?seite=2")).toBe(
			"/wallet/bewegungen?seite=2",
		);
		for (const bad of [
			"/heute",
			"//evil.example/wallet",
			"https://evil.example",
			"/wallet//evil",
			"/wallet/entsperren",
			"/walletx",
			"/wallet/../admin",
			undefined,
			42,
		])
			expect(walletReturnPath(bad), String(bad)).toBe("/wallet");
	});

	it("Navigation zeigt nur vorhandene Seiten im Wallet-Pfad", () => {
		const hrefs = buildWalletNav({ send: true }).flatMap((g) =>
			g.items.map((i) => i.href),
		);
		expect(hrefs.length).toBeGreaterThan(0);
		for (const h of hrefs) {
			expect(h.startsWith("/wallet")).toBe(true);
			const dir = h === "/wallet" ? "" : h.slice("/wallet".length);
			expect(existsSync(join("app/(wallet)/wallet", dir, "page.tsx")), h).toBe(
				true,
			);
		}
	});

	it("Senden, Auszahlungen, Adressbuch, Sicherheit nur mit eigenem Signer", () => {
		const hrefs = (send: boolean) =>
			buildWalletNav({ send }).flatMap((g) => g.items.map((i) => i.href));
		expect(hrefs(false)).not.toContain("/wallet/senden");
		expect(hrefs(true)).toEqual(
			expect.arrayContaining([
				"/wallet/senden",
				"/wallet/auszahlungen",
				"/wallet/adressbuch",
				"/wallet/sicherheit",
			]),
		);
	});
});
