import { describe, expect, it } from "vitest";
import { buildNav, countNavTargets } from "@/lib/nav";

const iso = [{ slug: "iso27001", name: "ISO 27001" }];
const casp = [
	{ slug: "iso27001", name: "ISO 27001" },
	{ slug: "dora", name: "DORA" },
	{ slug: "micar", name: "MiCAR" },
	{ slug: "zag", name: "ZAG" },
	{ slug: "gwg", name: "GwG" },
];

describe("buildNav", () => {
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
		expect(n).toBeLessThanOrEqual(28);
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
