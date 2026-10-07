import { describe, expect, it } from "vitest";
import {
	deriveApplicability,
	type OrgProfile,
	orgRolesFor,
} from "@/lib/compliance/applicability";

const base: OrgProfile = {
	sector: "casp",
	licenceStage: "0_vorbereitung",
	caspServices: ["transfer"],
	selectedFrameworks: ["iso27001", "dora", "nis2"],
	asOf: new Date("2026-10-07"),
};

describe("deriveApplicability", () => {
	it("Standard: anwendbar", () => {
		expect(
			deriveApplicability({ framework: "iso27001", code: "A.5.1" }, base),
		).toEqual({ applicable: true, source: "default" });
	});

	it("CASP mit DORA: NIS2 Art. 20/21/23 lex specialis, Registrierung bleibt", () => {
		expect(
			deriveApplicability({ framework: "nis2", code: "Art.21(2)(h)" }, base)
				.source,
		).toBe("lex_specialis");
		expect(
			deriveApplicability({ framework: "nis2", code: "Art.23" }, base)
				.applicable,
		).toBe(false);
		expect(
			deriveApplicability({ framework: "nis2", code: "Art.27" }, base)
				.applicable,
		).toBe(true);
		expect(
			deriveApplicability({ framework: "nis2", code: "Art.2-3" }, base)
				.applicable,
		).toBe(true);
	});

	it("Nicht-Finanz-Org ohne DORA: NIS2 voll anwendbar", () => {
		const p: OrgProfile = {
			...base,
			sector: "other",
			selectedFrameworks: ["iso27001", "nis2"],
		};
		expect(
			deriveApplicability({ framework: "nis2", code: "Art.21(2)(h)" }, p)
				.applicable,
		).toBe(true);
	});

	it("TLPT nur bei Benennung", () => {
		const r = { framework: "dora", code: "Art.26" };
		expect(deriveApplicability(r, base)).toMatchObject({
			applicable: false,
			source: "rule",
		});
		expect(
			deriveApplicability(r, { ...base, tlptDesignated: true }).applicable,
		).toBe(true);
	});

	it("Dienste: Verwahrungs-Anforderung ohne custody → N/A", () => {
		const r = {
			framework: "micar",
			code: "Art.75",
			services: ["custody" as const],
		};
		expect(deriveApplicability(r, base)).toMatchObject({
			applicable: false,
			source: "services",
		});
		expect(
			deriveApplicability(r, { ...base, caspServices: ["custody"] }).applicable,
		).toBe(true);
	});

	it("Rollen greifen erst ab Stufe 1: Agent trägt MiCAR-Institutspflichten nicht", () => {
		const r = {
			framework: "micar",
			code: "Art.67",
			appliesToRoles: ["financial_entity" as const],
		};
		expect(deriveApplicability(r, base).applicable).toBe(true);
		expect(
			deriveApplicability(r, { ...base, licenceStage: "1_agent" }),
		).toMatchObject({ applicable: false, source: "stage" });
		expect(
			deriveApplicability(r, { ...base, licenceStage: "2_casp_zag" })
				.applicable,
		).toBe(true);
	});

	it("Stufe: KWG ab Stufe 4", () => {
		const r = {
			framework: "kwg",
			code: "§25a",
			appliesFromStage: "4_bank" as const,
		};
		expect(
			deriveApplicability(r, { ...base, licenceStage: "2_casp_zag" }).source,
		).toBe("stage");
		expect(deriveApplicability(r, base).applicable).toBe(true);
	});

	it("Stichtag: AMLR erst ab 10.07.2027, GwG-Teile bis dahin", () => {
		const amlr = {
			framework: "amlr",
			code: "Art.10",
			effectiveFrom: "2027-07-10",
		};
		expect(deriveApplicability(amlr, base).applicable).toBe(false);
		expect(
			deriveApplicability(amlr, { ...base, asOf: new Date("2027-08-01") })
				.applicable,
		).toBe(true);
		const gwg = { framework: "gwg", code: "§5", effectiveUntil: "2027-07-09" };
		expect(deriveApplicability(gwg, base).applicable).toBe(true);
		expect(
			deriveApplicability(gwg, { ...base, asOf: new Date("2027-08-01") })
				.applicable,
		).toBe(false);
	});

	it("Aufgehoben (BAIT/ZAIT) nie anwendbar", () => {
		expect(
			deriveApplicability(
				{ framework: "marisk", code: "BAIT", legalStatus: "repealed" },
				base,
			),
		).toMatchObject({ applicable: false, source: "rule" });
	});

	it("orgRolesFor leitet Rollen aus Stufe und Token-Emission ab", () => {
		expect(orgRolesFor(base)).toEqual(["any"]);
		expect(orgRolesFor({ ...base, licenceStage: "1_agent" })).toContain(
			"agent",
		);
		expect(orgRolesFor({ ...base, licenceStage: "2_casp_zag" })).toContain(
			"financial_entity",
		);
		expect(orgRolesFor({ ...base, issuesTokens: "emt" })).toContain("issuer");
	});
});
