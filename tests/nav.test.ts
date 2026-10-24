import { describe, expect, it } from "vitest";
import {
	activeNavKey,
	activeNavTab,
	buildNav,
	buildWalletNav,
	countNavTargets,
	navTabs,
} from "@/lib/nav";

const iso = [{ slug: "iso27001", name: "ISO 27001" }];
const casp = [
	{ slug: "iso27001", name: "ISO 27001" },
	{ slug: "dora", name: "DORA" },
	{ slug: "micar", name: "MiCAR" },
	{ slug: "zag", name: "ZAG" },
	{ slug: "gwg", name: "GwG" },
];

describe("buildNav", () => {
	it("Produkte nur mit aktivem CRA", () => {
		const keys = (frameworks: { slug: string; name: string }[]) =>
			buildNav({
				frameworks,
				licenceStage: "0_vorbereitung",
				caspServices: [],
				role: "owner",
			}).flatMap((g) => g.items.map((i) => i.key));
		expect(keys(iso)).not.toContain("products");
		expect(keys([...iso, { slug: "cra", name: "CRA" }])).toContain("products");
	});
	it("Krypto (both.money) nur mit Verbindung, auch ohne CASP-Rahmenwerk", () => {
		const keys = (
			frameworks: { slug: string; name: string }[],
			walletLinked: boolean,
		) =>
			buildNav({
				frameworks,
				licenceStage: "0_vorbereitung",
				caspServices: [],
				role: "owner",
				walletLinked,
			}).flatMap((g) => g.items.map((i) => i.key));
		expect(keys(iso, false)).not.toContain("krypto");
		expect(keys(iso, true)).toContain("krypto");
		expect(keys(casp, true).filter((k) => k === "krypto")).toHaveLength(1);
	});
	it("ISO-only-Org: keine CASP-Gruppe, rund 20 Ziele", () => {
		const groups = buildNav({
			frameworks: iso,
			licenceStage: "0_vorbereitung",
			caspServices: [],
			role: "owner",
		});
		expect(groups.find((g) => g.key === "casp")).toBeUndefined();
		const n = countNavTargets(groups);
		expect(n).toBeGreaterThanOrEqual(18);
		expect(n).toBeLessThanOrEqual(30);
	});
	it("CASP-Org: CASP-Gruppe mit AML, Eigenmittel, Kryptowerte, Beschwerden, Antrag", () => {
		const groups = buildNav({
			frameworks: casp,
			licenceStage: "2_casp_zag",
			caspServices: ["transfer"],
			role: "owner",
		});
		const caspGroup = groups.find((g) => g.key === "casp");
		expect(caspGroup?.items.map((i) => i.key)).toEqual([
			"aml",
			"ownFunds",
			"cryptoAssets",
			"complaints",
			"application",
		]);
		expect(countNavTargets(groups)).toBeGreaterThanOrEqual(28);
	});
	it("nur GwG ohne Finanz-Rahmenwerk: AML, aber keine Eigenmittel", () => {
		const groups = buildNav({
			frameworks: [{ slug: "gwg", name: "GwG" }],
			licenceStage: "0_vorbereitung",
			caspServices: [],
			role: "owner",
		});
		expect(
			groups.find((g) => g.key === "casp")?.items.map((i) => i.key),
		).toEqual(["aml"]);
	});
	it("Prüfer:in sieht eine reduzierte Navigation ohne Team und CASP", () => {
		const groups = buildNav({
			frameworks: casp,
			licenceStage: "2_casp_zag",
			caspServices: [],
			role: "auditor",
		});
		expect(groups.find((g) => g.key === "casp")).toBeUndefined();
		const keys = groups.flatMap((g) => g.items.map((i) => i.key));
		expect(keys).not.toContain("team");
		expect(keys).not.toContain("resolutions");
		expect(keys).toContain("audits");
		expect(keys).toContain("evidence");
	});
	it("Berater:in sieht die Navigation wie Bearbeiter:in", () => {
		const input = {
			frameworks: casp,
			licenceStage: "2_casp_zag" as const,
			caspServices: [],
		};
		const keys = (role: "editor" | "consultant") =>
			buildNav({ ...input, role }).flatMap((g) => g.items.map((i) => i.key));
		expect(keys("consultant")).toEqual(keys("editor"));
	});
	it("Heute trägt den Zähler, Rahmenwerke werden als Einträge geführt", () => {
		const groups = buildNav({
			frameworks: iso,
			licenceStage: "0_vorbereitung",
			caspServices: [],
			role: "editor",
			counts: { today: 3 },
		});
		expect(groups[0].items[0].count).toBe(3);
		expect(
			groups
				.find((g) => g.key === "frameworks")
				?.items.some((i) => i.href === "/rahmenwerke/iso27001"),
		).toBe(true);
	});
});

describe("buildNav: Verwahrung", () => {
	it("nur mit Verwahrdienst oder CCSS", () => {
		const keys = (
			caspServices: string[],
			fws: { slug: string; name: string }[],
		) =>
			buildNav({
				frameworks: fws,
				licenceStage: "0_vorbereitung",
				caspServices,
				role: "owner",
			}).flatMap((g) => g.items.map((i) => i.key));
		expect(keys(["custody"], [])).toContain("custody");
		expect(keys([], [{ slug: "ccss", name: "CCSS" }])).toContain("custody");
		expect(keys(["transfer"], [])).not.toContain("custody");
	});
});

describe("activeNavKey", () => {
	const wallet = buildWalletNav();
	it("der spezifischste Pfad gewinnt", () => {
		expect(activeNavKey(wallet, "/wallet")).toBe("wallet-home");
		expect(activeNavKey(wallet, "/wallet/kurse")).toBe("wallet-quotes");
		expect(activeNavKey(wallet, "/wallet/konten/abc")).toBe("wallet-accounts");
	});
	it("Zusatzpfade (Detailseiten) markieren ihren Eintrag", () => {
		expect(activeNavKey(wallet, "/wallet/kurs/btc-eur")).toBe("wallet-quotes");
		expect(activeNavKey(wallet, "/wallet/kursx")).toBe("wallet-home");
	});
	it("fremde Pfade markieren nichts", () => {
		expect(activeNavKey(wallet, "/heute")).toBeNull();
	});
});

describe("Tab-Leiste (Apple HIG)", () => {
	const groups = buildNav({
		frameworks: casp,
		licenceStage: "2_casp_zag",
		caspServices: ["custody"],
		role: "owner",
		walletLinked: true,
	});

	it("höchstens fünf Tabs, jeder Eintrag in genau einem Tab", () => {
		const tabs = navTabs(groups);
		expect(tabs.map((t) => t.key)).toEqual([
			"heute",
			"umsetzen",
			"register",
			"steuerung",
			"suche",
		]);
		const inTabs = tabs.flatMap((t) =>
			t.groups.flatMap((g) => g.items.map((i) => i.key)),
		);
		const all = groups.flatMap((g) => g.items.map((i) => i.key));
		expect([...inTabs].sort()).toEqual([...all].sort());
		expect(new Set(inTabs).size).toBe(inTabs.length);
	});

	it("CASP und Team/Einstellungen unter Steuerung, Rahmenwerke unter Umsetzen", () => {
		const tabs = navTabs(groups);
		const keys = (k: string) =>
			tabs
				.find((t) => t.key === k)
				?.groups.flatMap((g) => g.items.map((i) => i.key)) ?? [];
		expect(keys("steuerung")).toEqual(
			expect.arrayContaining(["aml", "krypto", "team", "settings"]),
		);
		expect(keys("umsetzen")).toEqual(
			expect.arrayContaining(["overview", "controls", "fw-micar"]),
		);
	});

	it("aktiver Tab aus Detailseiten, Bereichslisten und Suche", () => {
		expect(activeNavTab(groups, "/heute/aufgaben")).toBe("heute");
		expect(activeNavTab(groups, "/risiken/123")).toBe("register");
		expect(activeNavTab(groups, "/rahmenwerke/dora/Art.5")).toBe("umsetzen");
		expect(activeNavTab(groups, "/einstellungen")).toBe("steuerung");
		expect(activeNavTab(groups, "/bereich/register")).toBe("register");
		expect(activeNavTab(groups, "/bereich/unbekannt")).toBeNull();
		expect(activeNavTab(groups, "/suche")).toBe("suche");
		expect(activeNavTab(groups, "/onboarding")).toBeNull();
	});

	it("Prüfer:innen: höchstens fünf Tabs, Register bleibt", () => {
		const auditor = navTabs(
			buildNav({
				frameworks: iso,
				licenceStage: "0_vorbereitung",
				caspServices: [],
				role: "auditor",
			}),
		);
		expect(auditor.map((t) => t.key)).toContain("register");
		expect(auditor.length).toBeLessThanOrEqual(5);
	});

	it("Wallet-Bereich (alte Navigation) hat keine Tabs", () => {
		expect(navTabs(buildWalletNav({ send: true }))).toEqual([]);
	});
});
