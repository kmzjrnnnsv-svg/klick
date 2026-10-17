import { describe, expect, it } from "vitest";
import { productMeasures } from "@/lib/assessments/measures";
import { productQuestions } from "@/lib/assessments/product-template";
import type { AnswerState } from "@/lib/assessments/score";
import { CONTROL_BY_CODE } from "@/lib/compliance/catalog";
import { mandatoryTemplatesFor } from "@/lib/compliance/catalog/document-templates";
import {
	conformityRoute,
	craBlockers,
	nextProductCode,
	type ProductForCra,
	productCraStatus,
	productRolesFrom,
	supportPeriodCheck,
} from "@/lib/compliance/cra";

const base: ProductForCra = {
	id: "p1",
	code: "PRD-001",
	name: "App",
	role: "manufacturer",
	craInScope: true,
	craClass: "default",
	classReason: null,
	isFoss: false,
	harmonisedStandards: false,
	placedOnMarketAt: "2026-01-01",
	supportUntil: "2032-01-01",
	supportReason: null,
	vulnContact: "https://example.com/.well-known/security.txt",
	sbomSummary: {
		format: "cyclonedx",
		specVersion: "1.6",
		generatedAt: "2026-10-01T00:00:00Z",
		primaryComponent: "app 1.0",
		components: 10,
		fields: {
			version: 100,
			identifier: 100,
			license: 90,
			hash: 90,
			supplier: 90,
		},
		dependencies: true,
		issues: [],
		ok: true,
		checkedAt: "2026-10-01T00:00:00Z",
	},
	riskDocumentId: "d1",
	techDocDocumentId: "d2",
	declarationAt: "2026-02-01",
	ceMarked: true,
	notifiedBody: null,
	status: "on_market",
};
const now = new Date("2026-10-17T12:00:00Z");

describe("conformityRoute (Art. 32)", () => {
	it("Standard → Modul A, wichtig I ohne Normen → benannte Stelle", () => {
		expect(conformityRoute(base).route).toBe("A");
		const i1 = conformityRoute({ ...base, craClass: "important_1" });
		expect(i1).toMatchObject({ route: "BC_H", thirdParty: true });
		expect(
			conformityRoute({
				...base,
				craClass: "important_1",
				harmonisedStandards: true,
			}).route,
		).toBe("A");
	});

	it("FOSS darf bei wichtigen Produkten Modul A nutzen, kritisch → EUCC", () => {
		expect(
			conformityRoute({ ...base, craClass: "important_2", isFoss: true }).route,
		).toBe("A");
		expect(
			conformityRoute({ ...base, craClass: "important_2" }).thirdParty,
		).toBe(true);
		expect(conformityRoute({ ...base, craClass: "critical" }).route).toBe(
			"EUCC",
		);
		expect(conformityRoute({ ...base, role: "importer" }).route).toBe("none");
	});
});

describe("supportPeriodCheck (Art. 13 Abs. 8)", () => {
	it("fehlend, zu kurz, begründet kurz, endet bald, abgelaufen", () => {
		expect(supportPeriodCheck({ ...base, supportUntil: null }, now).state).toBe(
			"missing",
		);
		const short = { ...base, supportUntil: "2028-01-01" };
		expect(supportPeriodCheck(short, now)).toMatchObject({
			state: "too_short",
			years: 2,
		});
		expect(
			supportPeriodCheck(
				{ ...short, supportReason: "Nutzungsdauer 2 Jahre" },
				now,
			).state,
		).toBe("ok");
		expect(
			supportPeriodCheck(
				{ ...base, placedOnMarketAt: "2021-01-01", supportUntil: "2027-03-01" },
				now,
			).state,
		).toBe("ending_soon");
		expect(
			supportPeriodCheck({ ...base, supportUntil: "2026-01-01" }, now).state,
		).toBe("ended");
	});
});

describe("productCraStatus", () => {
	it("vollständiger Hersteller ist bereit, nicht erfasst endet nach der Bewertung", () => {
		expect(productCraStatus(base, now)).toMatchObject({
			state: "ready",
			percent: 100,
		});
		const out = productCraStatus({ ...base, craInScope: false }, now);
		expect(out.state).toBe("out_of_scope");
		expect(out.checks.map((c) => c.key)).toEqual(["scope"]);
		expect(productCraStatus({ ...base, craInScope: null }, now).state).toBe(
			"unassessed",
		);
	});

	it("Lücken: veraltete SBOM, fehlende Doku, benannte Stelle bei Klasse II", () => {
		const s = productCraStatus(
			{
				...base,
				craClass: "important_2",
				classReason: "Firewall",
				techDocDocumentId: null,
				sbomSummary: base.sbomSummary
					? { ...base.sbomSummary, generatedAt: "2025-01-01T00:00:00Z" }
					: null,
			},
			now,
		);
		const failed = s.checks.filter((c) => !c.ok).map((c) => c.key);
		expect(failed).toEqual(["sbom", "tech_doc", "notified_body"]);
		expect(s.checks.find((c) => c.key === "sbom")?.detail).toBe("stale");
		expect(s.state).toBe("gaps");
	});

	it("Einführer prüft nur Herstellerunterlagen", () => {
		const s = productCraStatus(
			{ ...base, role: "importer", ceMarked: false },
			now,
		);
		expect(s.checks.map((c) => c.key)).toEqual([
			"scope",
			"class",
			"supplier_docs",
		]);
		expect(s.done).toBe(2);
	});
});

describe("craBlockers", () => {
	it("vor dem Stichtag milder, zurückgezogene Produkte zählen nicht", () => {
		const gap = { ...base, vulnContact: null, riskDocumentId: null };
		const before = craBlockers([gap], now);
		// Meldekontakt gilt seit 11.09.2026 → kritisch; Risikobewertung erst ab 11.12.2027
		expect(before.find((b) => b.ref === "p1:vuln_contact")?.severity).toBe(
			"critical",
		);
		expect(before.find((b) => b.ref === "p1:risk_assessment")?.severity).toBe(
			"high",
		);
		const after = craBlockers([gap], new Date("2028-01-01"));
		expect(after.find((b) => b.ref === "p1:risk_assessment")?.severity).toBe(
			"critical",
		);
		expect(craBlockers([{ ...gap, status: "withdrawn" }], now)).toEqual([]);
		expect(before.every((b) => b.href === "/produkte/p1")).toBe(true);
	});
});

describe("productRolesFrom", () => {
	it("ohne Produkte undefined, sonst Rollen der erfassten Produkte", () => {
		expect(productRolesFrom([])).toBeUndefined();
		expect(
			productRolesFrom([
				{ role: "manufacturer", craInScope: false, status: "on_market" },
			]),
		).toEqual([]);
		expect(
			productRolesFrom([
				{ role: "manufacturer", craInScope: null, status: "development" },
				{ role: "distributor", craInScope: true, status: "on_market" },
				{ role: "importer", craInScope: true, status: "withdrawn" },
			]),
		).toEqual(["manufacturer", "distributor"]);
	});

	it("nextProductCode zählt hoch", () => {
		expect(nextProductCode([])).toBe("PRD-001");
		expect(nextProductCode(["PRD-001", "PRD-007", "X-9"])).toBe("PRD-008");
	});
});

describe("productQuestions (CRA-Checkliste)", () => {
	it("Hersteller: Anhang I/II, K.-o.-Punkte, kein Einführer-Teil", () => {
		const qs = productQuestions("manufacturer");
		const codes = qs.map((q) => q.code);
		expect(codes).toContain("AnhI-2a");
		expect(codes).toContain("AnhI-II-1");
		expect(codes).not.toContain("Art.19");
		expect(qs.find((q) => q.code === "AnhI-2a")?.critical).toBe(true);
		// keine Frage hängt an einem Control (Antworten gelten nur fürs Produkt)
		expect(qs.every((q) => q.controlCode === undefined)).toBe(true);
		for (const q of qs) {
			expect(q.mapsTo?.requirement).toBe(`cra:${q.code}`);
			if (q.mapsTo?.control)
				expect(CONTROL_BY_CODE.has(q.mapsTo.control)).toBe(true);
		}
	});

	it("Einführer: nur eigene Prüfpflichten", () => {
		const codes = productQuestions("importer").map((q) => q.code);
		expect(codes).toContain("Art.19");
		expect(codes).toContain("Art.21-22");
		expect(codes).not.toContain("Art.20");
		expect(codes).not.toContain("AnhI-2a");
	});

	it("Maßnahmen: K.-o.-Punkte zuerst, je Frage", () => {
		const qs = productQuestions("manufacturer");
		const st = (answer: AnswerState["answer"], evidenceCount = 0) => ({
			answer,
			evidenceCount,
			reviewerAnswer: null,
		});
		const answers = new Map<string, AnswerState>([
			["Art.13(8)", st("no")],
			["AnhI-2a", st("partial")],
			["AnhII", st("yes", 1)],
			["AnhVII", st("yes", 0)],
		]);
		const m = productMeasures({ questions: qs, answers });
		expect(m[0]?.controlCode).toBe("AnhI-2a");
		expect(m.find((x) => x.controlCode === "Art.13(8)")?.kind).toBe(
			"implement",
		);
		expect(m.find((x) => x.controlCode === "AnhVII")?.kind).toBe("evidence");
		expect(m.some((x) => x.controlCode === "AnhII")).toBe(false);
		expect(m.find((x) => x.controlCode === "AnhI-II-1")?.kind).toBe("clarify");
	});
});

describe("Pflichtdokumente CRA", () => {
	it("erst ab 11.12.2027 Pflicht, Vorlagen zeigen auf Produkt-Controls", () => {
		expect(mandatoryTemplatesFor("cra", now)).toEqual([]);
		const later = mandatoryTemplatesFor(
			"cra",
			new Date("2027-12-11T12:00:00Z"),
		);
		expect(later.map((t) => t.code)).toEqual([
			"RL-CVD",
			"RL-SUPPORTZEITRAUM",
			"VL-PRODUKT-RISIKO",
			"VL-TECHDOK",
			"VL-NUTZERINFO",
		]);
		for (const t of later)
			expect(t.controls.some((c) => c.startsWith("CC-PRD-"))).toBe(true);
		// andere Rahmenwerke unverändert
		expect(mandatoryTemplatesFor("nis2", now).length).toBe(4);
	});
});
