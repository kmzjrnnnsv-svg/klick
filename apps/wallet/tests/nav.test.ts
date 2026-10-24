import {
	activeWalletNav,
	activeWalletTab,
	settingsGroups,
	walletNav,
	walletTabs,
} from "@wallet/lib/nav";
import { describe, expect, it } from "vitest";

const all = { members: true, audit: true, exportManage: true };

describe("both.money Navigation (Apple HIG)", () => {
	it("fünf Tabs; Senden nur mit eigenem Signer, sonst Empfangen", () => {
		expect(walletTabs(true).map((t) => t.key)).toEqual([
			"overview",
			"accounts",
			"activity",
			"send",
			"settings",
		]);
		expect(walletTabs(false).map((t) => t.key)).toEqual([
			"overview",
			"accounts",
			"activity",
			"receive",
			"settings",
		]);
	});

	it("jede Seite ist über einen Tab oder die Liste unter /settings erreichbar", () => {
		for (const send of [true, false]) {
			const nav = walletNav({ send, ...all });
			const tabs = new Set(walletTabs(send).map((t) => t.href));
			const listed = new Set(
				settingsGroups(nav, send).flatMap((g) => g.items.map((i) => i.href)),
			);
			for (const item of nav.flatMap((g) => g.items))
				expect(tabs.has(item.href) || listed.has(item.href)).toBe(true);
			for (const href of listed) expect(tabs.has(href)).toBe(false);
		}
	});

	it("Rechte blenden Organisationseinträge aus", () => {
		const keys = walletNav({
			send: false,
			members: false,
			audit: true,
			exportManage: false,
		}).flatMap((g) => g.items.map((i) => i.key));
		expect(keys).toContain("audit");
		expect(keys).not.toContain("members");
		expect(keys).not.toContain("export");
		expect(keys).not.toContain("send");
	});

	it("aktiver Tab und Eintrag", () => {
		expect(activeWalletTab(true, "/")).toBe("overview");
		expect(activeWalletTab(true, "/accounts/abc")).toBe("accounts");
		expect(activeWalletTab(true, "/send")).toBe("send");
		expect(activeWalletTab(true, "/receive")).toBe("settings");
		expect(activeWalletTab(false, "/receive")).toBe("receive");
		expect(activeWalletTab(false, "/prices/btc-eur")).toBe("settings");
		expect(activeWalletTab(true, "/settings/export")).toBe("settings");
		expect(activeWalletTab(true, "/welcome/start")).toBeNull();
		const nav = walletNav({ send: true, ...all });
		expect(activeWalletNav(nav, "/")).toBe("overview");
		expect(activeWalletNav(nav, "/payouts/123")).toBe("payouts");
		expect(activeWalletNav(nav, "/settings/export")).toBe("export");
	});
});
