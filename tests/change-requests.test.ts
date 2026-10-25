import { describe, expect, it } from "vitest";
import { WORKFLOW_BY_KIND } from "@/lib/compliance/catalog/approval-workflows";
import { nextChangeCode } from "@/lib/compliance/change-requests";

// Neu-Produkt-Prozess (MaRisk AT 8, /aenderungen)
describe("Änderungsanträge", () => {
	it("nummeriert fortlaufend und überspringt Fremdes", () => {
		expect(nextChangeCode([])).toBe("AE-001");
		expect(nextChangeCode(["AE-001", "AE-007", "X-9"])).toBe("AE-008");
	});

	it("IKT-Risikokontrolle prüft nur IT-Änderungen; die GL entfällt für sich selbst", () => {
		const steps = WORKFLOW_BY_KIND.get("change")?.steps ?? [];
		expect(steps.map((s) => s.approverRule)).toEqual([
			"function:ict_risk_function",
			"function:risk_control",
			"function:compliance",
			"function:management_body",
		]);
		expect(steps[0]?.onlyIf).toEqual([
			{ field: "changeKind", op: "eq", value: "it_change" },
		]);
		expect(steps[3]?.skipIf).toEqual(["function:management_body"]);
	});
});
