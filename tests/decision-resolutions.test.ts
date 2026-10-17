import { describe, expect, it } from "vitest";
import {
	frameworkRefs,
	isManagementDecision,
	nextDecisionCode,
	resolutionFromDecision,
} from "@/lib/compliance/decision-resolutions";

describe("resolutionFromDecision", () => {
	it("Leitlinie freigegeben → Beschluss mit Pflichtbeschluss RES-ISMS-POLICY", () => {
		const r = resolutionFromDecision({
			workflowKind: "document_publish",
			workflowName: "Dokument veröffentlichen",
			entityType: "document",
			entityLabel: "RL-001 Informationssicherheitsleitlinie",
			outcome: "approved",
			note: "Gültig ab 1.11.",
			documentTemplateCode: "RL-ISMS-LEITLINIE",
		});
		expect(r).toEqual({
			subject:
				"Dokument veröffentlichen: RL-001 Informationssicherheitsleitlinie",
			decisionText: "Die Geschäftsleitung gibt frei. Gültig ab 1.11.",
			requiredCode: "RES-ISMS-POLICY",
		});
	});
	it("Ablehnung erfüllt keinen Pflichtbeschluss; Anfrage nimmt die Frage als Gegenstand", () => {
		expect(
			resolutionFromDecision({
				workflowKind: "management_decision",
				workflowName: "Managemententscheidung",
				entityType: "decision_request",
				entityLabel: "ME-2026-01",
				question: "Wechsel auf Cloud-Anbieter X?",
				outcome: "rejected",
			}),
		).toEqual({
			subject: "Wechsel auf Cloud-Anbieter X?",
			decisionText: "Die Geschäftsleitung lehnt ab.",
			requiredCode: null,
		});
	});
	it("wesentliche Auslagerung → RES-DORA-TPR", () => {
		expect(
			resolutionFromDecision({
				workflowKind: "provider_onboarding",
				workflowName: "Dienstleister freigeben",
				entityType: "provider_rating",
				entityLabel: "LB-001 Cloud AG",
				outcome: "approved",
				providerMaterial: true,
			}).requiredCode,
		).toBe("RES-DORA-TPR");
	});
});

describe("isManagementDecision", () => {
	it("Stufe Geschäftsleitung oder Person in der Funktion, nie Beschluss-Freigaben", () => {
		expect(
			isManagementDecision({
				approverRule: "function:management_body",
				deciderIsTopManagement: false,
				entityType: "risk",
			}),
		).toBe(true);
		expect(
			isManagementDecision({
				approverRule: "function:department_head",
				deciderIsTopManagement: false,
				entityType: "risk",
			}),
		).toBe(false);
		expect(
			isManagementDecision({
				approverRule: "function:management_body",
				deciderIsTopManagement: true,
				entityType: "resolution",
			}),
		).toBe(false);
	});
});

describe("frameworkRefs / nextDecisionCode", () => {
	it("nur aktive Rahmenwerke, Rahmenwerke aus Schlüsseln", () => {
		expect(
			frameworkRefs(
				["dora:Art. 28", "nis2:§ 30", "dora:Art. 28"],
				["dora"],
				["iso27001"],
			),
		).toEqual({ frameworks: ["dora"], requirementKeys: ["dora:Art. 28"] });
	});
	it("zählt je Jahr hoch", () => {
		expect(
			nextDecisionCode(["ME-2026-01", "ME-2026-07", "ME-2025-09"], 2026),
		).toBe("ME-2026-08");
		expect(nextDecisionCode([], 2027)).toBe("ME-2027-01");
	});
});
