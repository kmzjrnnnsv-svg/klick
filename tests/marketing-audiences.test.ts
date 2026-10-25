import { describe, expect, it } from "vitest";
import { CATALOG_FRAMEWORKS } from "@/lib/compliance/catalog";
import {
	type Sector,
	type SetupProfile,
	suggestFrameworks,
} from "@/lib/compliance/company-profile";
import {
	AUDIENCES,
	type Audience,
	audienceViews,
	frameworkLabel,
} from "@/lib/marketing/audiences";

// „Was gilt für dich?“ auf /funktionen: nur Rahmenwerke aus dem Katalog, und
// die Pflichten stimmen mit dem überein, was die Einrichtung in Klick
// vorschlägt — Website und App sollen nicht auseinanderlaufen.

const SLUGS = new Set(CATALOG_FRAMEWORKS.map((f) => f.slug));

function suggested(sector: Sector, hasProducts = false) {
	const profile: SetupProfile = {
		sector,
		licenceStage: sector === "bank" ? "4_bank" : "2_casp_zag",
		caspServices: [],
		issuesTokens: "none",
		hasProducts,
		entity: { employees: 30, personalData: ["kunden"] },
	};
	return suggestFrameworks(profile);
}

const SECTORS: Record<Audience["key"], Sector[]> = {
	it: ["other"],
	product: ["other"],
	payment: ["payment", "emi"],
	casp: ["casp"],
	bank: ["bank"],
};

describe("Was gilt für dich?", () => {
	it("nennt nur Rahmenwerke aus dem Katalog, jedes einmal je Gruppe", () => {
		for (const a of AUDIENCES) {
			const slugs = a.entries.map((e) => e.slug);
			expect(new Set(slugs).size, a.key).toBe(slugs.length);
			for (const slug of slugs) expect(SLUGS.has(slug), slug).toBe(true);
			expect(
				a.entries.some((e) => e.level === "must"),
				a.key,
			).toBe(true);
			for (const e of a.entries) {
				expect(e.why.length, e.slug).toBeGreaterThan(20);
				expect(frameworkLabel(e.slug), e.slug).not.toBe(e.slug);
			}
		}
	});

	it("Pflichten stimmen mit der Einrichtung überein", () => {
		for (const a of AUDIENCES) {
			const must = a.entries
				.filter((e) => e.level === "must")
				.map((e) => e.slug);
			for (const sector of SECTORS[a.key]) {
				const s = suggested(sector, a.key === "product");
				const all = s.map((x) => x.slug);
				for (const slug of must)
					expect(all, `${a.key}/${sector}: ${slug}`).toContain(slug);
				if (a.key === "it" || a.key === "product") continue;
				// jeder vorgewählte Vorschlag einer Finanzgruppe steht auch hier
				const listed = new Set(a.entries.map((e) => e.slug));
				for (const x of s.filter((y) => y.recommended))
					expect(listed.has(x.slug), `${a.key}/${sector}: ${x.slug}`).toBe(
						true,
					);
			}
		}
	});

	it("gruppiert nach Stufe in fester Reihenfolge, ohne leere Stufen", () => {
		const it = audienceViews().find((a) => a.key === "it");
		expect(it?.groups.map((g) => g.level)).toEqual([
			"must",
			"depends",
			"indirect",
			"voluntary",
		]);
		const bank = audienceViews().find((a) => a.key === "bank");
		expect(bank?.groups.map((g) => g.level)).not.toContain("indirect");
		expect(bank?.groups[0]?.entries[0]?.label).toBe("KWG");
	});
});
