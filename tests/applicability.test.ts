import { describe, expect, it } from "vitest";
import {
	deriveApplicability,
	inWorkQueue,
	mergeApplicability,
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

describe("deriveApplicability — CRA-Rollen aus dem Produktregister", () => {
	const mfr = {
		framework: "cra",
		code: "AnhI-2a",
		appliesToRoles: ["manufacturer" as const],
		effectiveFrom: "2027-12-11",
	};
	const imp = {
		framework: "cra",
		code: "Art.19",
		appliesToRoles: ["importer" as const],
		effectiveFrom: "2027-12-11",
	};
	const asOf = new Date("2028-01-01");

	it("ohne Produkte: alles Arbeitsgegenstand, auch ab Lizenzstufe 2", () => {
		const p = { ...base, licenceStage: "2_casp_zag" as const, asOf };
		expect(deriveApplicability(mfr, p).applicable).toBe(true);
		expect(deriveApplicability(imp, p).applicable).toBe(true);
	});

	it("mit Produkten: nur die eigenen Rollen, unabhängig von der Stufe", () => {
		const p = {
			...base,
			licenceStage: "2_casp_zag" as const,
			productRoles: ["manufacturer" as const],
			asOf,
		};
		expect(deriveApplicability(mfr, p).applicable).toBe(true);
		expect(deriveApplicability(imp, p)).toMatchObject({
			applicable: false,
			source: "stage",
		});
		// nur SaaS (nicht erfasst) → keine Herstellerpflichten
		expect(
			deriveApplicability(mfr, { ...base, productRoles: [], asOf }).applicable,
		).toBe(false);
		// künftige Pflicht bleibt im Arbeitsvorrat, solange die Rolle passt
		expect(inWorkQueue(mfr, { ...base, productRoles: ["manufacturer"] })).toBe(
			true,
		);
		expect(inWorkQueue(mfr, { ...base, productRoles: ["distributor"] })).toBe(
			false,
		);
	});
});

describe("mergeApplicability", () => {
	it("nur manuelle Zeilen überschreiben die frische Ableitung", () => {
		const derived = new Map([
			["amlr:Art.1", { applicable: true, source: "default" as const }],
			["iso27001:A.5.1", { applicable: true, source: "default" as const }],
			[
				"dora:Art.26",
				{ applicable: false, source: "rule" as const, note: "TLPT" },
			],
		]);
		const stored = new Map([
			// veralteter Schnappschuss aus initializeOrg
			["amlr:Art.1", { applicable: false, source: "rule", note: "Gilt ab …" }],
			[
				"iso27001:A.5.1",
				{ applicable: false, source: "manual", note: "Ausgelagert" },
			],
		]);
		const out = mergeApplicability(derived, stored);
		expect(out.get("amlr:Art.1")).toEqual({
			applicable: true,
			source: "default",
			note: null,
		});
		expect(out.get("iso27001:A.5.1")).toEqual({
			applicable: false,
			source: "manual",
			note: "Ausgelagert",
		});
		expect(out.get("dora:Art.26")?.note).toBe("TLPT");
	});
});

describe("inWorkQueue", () => {
	const future = {
		framework: "cra",
		code: "AnhI",
		effectiveFrom: "2027-12-11",
	};

	it("künftig geltende Anforderung gehört schon heute in den Arbeitsvorrat", () => {
		expect(deriveApplicability(future, base).applicable).toBe(false);
		expect(inWorkQueue(future, base)).toBe(true);
	});

	it("aufgehoben, ausgelaufen oder aus anderem Grund N/A bleibt draußen", () => {
		expect(
			inWorkQueue({ ...future, legalStatus: "repealed" as const }, base),
		).toBe(false);
		expect(
			inWorkQueue(
				{ framework: "gwg", code: "§1", effectiveUntil: "2026-01-01" },
				base,
			),
		).toBe(false);
		expect(
			inWorkQueue(
				{ ...future, framework: "micar", services: ["custody" as const] },
				base,
			),
		).toBe(false);
	});

	it("heute anwendbar → im Arbeitsvorrat", () => {
		expect(inWorkQueue({ framework: "iso27001", code: "A.5.1" }, base)).toBe(
			true,
		);
	});
});
