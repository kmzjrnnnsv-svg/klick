import { describe, expect, it } from "vitest";
import { selectWorkflow } from "@/lib/approvals/route";
import { providerFactsOf, triggerForKind } from "@/lib/approvals/triggers";
import { FRAMEWORK_BY_SLUG } from "@/lib/compliance/catalog";
import {
	APPROVAL_DUTIES,
	dutyKeys,
	requiredDuties,
} from "@/lib/compliance/catalog/approval-duties";
import {
	APPROVAL_WORKFLOW_TEMPLATES,
	LEGACY_DESCRIPTIONS,
	WORKFLOW_BY_KIND,
} from "@/lib/compliance/catalog/approval-workflows";
import {
	DOCUMENT_TEMPLATES,
	defaultApproverFunction,
} from "@/lib/compliance/catalog/document-templates";

// Freigabe-Pflichten je Rahmenwerk (approval-duties.ts): eine Quelle für
// den Standard (einschalten) und den individuellen Modus (prüfen).

describe("Freigabe-Pflichten", () => {
	it("jede Pflicht hat eine Vorlage und nennt nur Katalog-Rahmenwerke", () => {
		for (const d of APPROVAL_DUTIES) {
			expect(WORKFLOW_BY_KIND.has(d.kind), d.kind).toBe(true);
			for (const slug of Object.keys(d.basis))
				expect(FRAMEWORK_BY_SLUG.has(slug), `${d.kind}: ${slug}`).toBe(true);
			expect(d.always || Object.keys(d.basis).length > 0, d.kind).toBe(true);
		}
	});

	it("der Standard-Seed erfüllt jede Pflicht", () => {
		for (const d of APPROVAL_DUTIES) {
			const t = WORKFLOW_BY_KIND.get(d.kind);
			const stellen = (t?.steps ?? []).flatMap((s) => [
				...(s.approvers ?? [s.approverRule]),
			]);
			for (const rule of d.requires)
				expect(stellen, `${d.kind}: ${rule}`).toContain(rule);
			if (d.everyone)
				expect(
					t?.steps.some((s) => s.everyone),
					d.kind,
				).toBe(true);
			if (d.always) expect(t?.defaultEnabled, d.kind).toBe(true);
		}
	});

	it("ISO 27001 verlangt die Freigabe des Geltungsbereichs", () => {
		const iso = requiredDuties(["iso27001"], 0);
		const scope = iso.find((d) => d.kind === "scope");
		expect(scope?.frameworks).toEqual(["iso27001"]);
		expect(scope?.basis).toEqual(["ISO 27001 Abschnitt 4.3"]);
		expect(requiredDuties(["dora"], 0).some((d) => d.kind === "scope")).toBe(
			false,
		);
	});

	it("„immer“-Pflichten gelten ohne Rahmenwerk, aber ohne Schlüssel", () => {
		const none = requiredDuties([], 0);
		expect(none.map((d) => d.kind)).toContain("role_appointment");
		expect(none.every((d) => d.frameworks.length === 0)).toBe(true);
		expect(none.flatMap(dutyKeys)).toEqual([]);
	});

	it("Auslagerung: DORA, MaRisk, KWG und MiCAR schalten Dienstleister ein", () => {
		for (const fw of ["dora", "zag-marisk", "kwg", "micar"]) {
			const kinds = requiredDuties([fw], 2).map((d) => d.kind);
			expect(kinds, fw).toContain("provider_intake");
			expect(kinds, fw).toContain("provider_intake_management");
			expect(kinds, fw).toContain("provider_onboarding");
		}
		const keys = requiredDuties(["dora", "micar"], 2)
			.filter((d) => d.kind === "provider_intake")
			.flatMap(dutyKeys);
		expect(keys).toEqual(["provider_intake@dora", "provider_intake@micar"]);
	});

	it("alte Beschreibungen gehören zu Vorlagen mit neuer Fassung", () => {
		for (const [kind, old] of Object.entries(LEGACY_DESCRIPTIONS)) {
			const t = WORKFLOW_BY_KIND.get(kind);
			expect(t, kind).toBeDefined();
			expect(t?.description, kind).not.toBe(old);
		}
	});
});

describe("Dienstleister-Fakten", () => {
	const base = {
		criticality: "standard" as const,
		category: "cloud",
		isIct: true,
		isOutsourcing: false,
		isMaterial: false,
	};
	it("Geschäftsleitung bei kritisch, wichtig oder wesentlicher Auslagerung", () => {
		expect(providerFactsOf(base).needsManagement).toBe(false);
		expect(
			providerFactsOf({ ...base, criticality: "critical" }).needsManagement,
		).toBe(true);
		expect(
			providerFactsOf({ ...base, criticality: "important" }).needsManagement,
		).toBe(true);
		expect(
			providerFactsOf({ ...base, isOutsourcing: true }).needsManagement,
		).toBe(false);
		expect(
			providerFactsOf({ ...base, isOutsourcing: true, isMaterial: true })
				.needsManagement,
		).toBe(true);
	});

	it("kritische Dienstleister laufen über die Variante mit Geschäftsleitung", () => {
		const seeded = APPROVAL_WORKFLOW_TEMPLATES.filter((t) =>
			t.kind.startsWith("provider_intake"),
		).map((t) => ({
			...t,
			trigger: t.trigger ?? triggerForKind(t.kind)?.key,
			enabled: true,
		}));
		const pick = (criticality: "critical" | "standard") =>
			selectWorkflow(
				seeded,
				"provider.create",
				providerFactsOf({ ...base, criticality }),
			)?.kind;
		expect(pick("critical")).toBe("provider_intake_management");
		expect(pick("standard")).toBe("provider_intake");
	});
});

describe("Dokumente: Freigabe je Vorlage", () => {
	it("Richtlinien gibt die Geschäftsleitung frei", () => {
		for (const t of DOCUMENT_TEMPLATES.filter((x) => x.type === "policy"))
			expect(t.approverFunction, t.code).toBe("management_body");
		expect(defaultApproverFunction("policy")).toBe("management_body");
		expect(defaultApproverFunction("procedure")).toBeNull();
	});

	it("Dokument veröffentlichen: Eigner:in, dann Freigabe-Funktion", () => {
		const steps = WORKFLOW_BY_KIND.get("document_publish")?.steps ?? [];
		expect(steps.map((s) => s.approverRule)).toEqual([
			"owner_of_entity",
			"approver_of_entity",
		]);
	});
});
