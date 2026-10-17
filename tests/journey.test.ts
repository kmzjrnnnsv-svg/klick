import { describe, expect, it } from "vitest";
import {
	COVERAGE_TARGET_PCT,
	deriveJourney,
	type JourneyFacts,
} from "@/lib/compliance/journey";

const empty: JourneyFacts = {
	memberCount: 1,
	invitationCount: 0,
	rolesRequired: 4,
	rolesGaps: 4,
	workflowGaps: 2,
	appetiteConfirmed: false,
	controlsTotal: 120,
	controlsWithOwner: 0,
	controlsStarted: 0,
	controlsImplemented: 0,
	implementedWithoutEvidence: 0,
	documentsValid: 0,
	providers: 0,
	risksAssessed: 0,
	processesLinked: 0,
	trainingRequirements: 10,
	trainingAssignments: 0,
	coverageMinPct: 0,
	resolutionsRequired: 5,
	resolutionsGaps: 5,
	auditProgrammes: 0,
	managementReviewsDone: 0,
};

const full: JourneyFacts = {
	...empty,
	memberCount: 3,
	rolesGaps: 0,
	workflowGaps: 0,
	appetiteConfirmed: true,
	controlsWithOwner: 120,
	controlsStarted: 40,
	controlsImplemented: 30,
	documentsValid: 5,
	providers: 3,
	risksAssessed: 4,
	processesLinked: 2,
	trainingAssignments: 12,
	coverageMinPct: COVERAGE_TARGET_PCT + 5,
	resolutionsGaps: 0,
	auditProgrammes: 1,
	managementReviewsDone: 1,
};

describe("Etappen", () => {
	it("leere Org: Etappe 1, erster Schritt ist das Team", () => {
		const j = deriveJourney(empty);
		expect(j.current).toBe(0);
		expect(j.next?.key).toBe("team");
		expect(j.next?.stage).toBe("startklar");
		expect(j.badges).toEqual([]);
		expect(j.pct).toBe(0);
	});

	it("NIS2/TLPT-Schritte nur, wenn gewählt", () => {
		const keys = (f: JourneyFacts) =>
			deriveJourney(f).stages[0]?.steps.map((s) => s.key);
		expect(keys(empty)).not.toContain("nis2");
		expect(keys({ ...empty, nis2: { checked: false } })).toContain("nis2");
		expect(keys({ ...empty, tlpt: { confirmed: true } })).toContain("tlpt");
	});

	it("Etappe 1 fertig → Abzeichen, nächster Schritt in Etappe 2", () => {
		const j = deriveJourney({
			...empty,
			memberCount: 2,
			rolesGaps: 0,
			workflowGaps: 0,
			appetiteConfirmed: true,
		});
		expect(j.badges).toEqual(["startklar"]);
		expect(j.current).toBe(1);
		expect(j.next).toMatchObject({ key: "owners", stage: "fundament" });
		expect(j.next?.count).toEqual({ done: 0, total: 120 });
	});

	it("alles erledigt: kein nächster Schritt (Seite fällt auf den Synergie-Plan zurück)", () => {
		const j = deriveJourney(full);
		expect(j.next).toBeNull();
		expect(j.current).toBe(4);
		expect(j.pct).toBe(100);
		expect(j.badges).toHaveLength(4);
	});

	it("Nachweis-Schritt erst erfüllt, wenn umgesetzte Controls belegt sind", () => {
		const step = (f: JourneyFacts) =>
			deriveJourney(f).stages[2]?.steps.find((s) => s.key === "evidence");
		expect(step({ ...full, implementedWithoutEvidence: 3 })?.done).toBe(false);
		expect(step({ ...full, controlsImplemented: 0 })?.done).toBe(false);
		expect(step(full)?.done).toBe(true);
	});
});
