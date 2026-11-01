import { describe, expect, it } from "vitest";
import {
	CONTROLS_STARTED_MIN,
	type NextStepFacts,
	nextSteps,
} from "@/lib/compliance/next-steps";
import de from "@/messages/de.json";

// „Als Nächstes“ (S2): höchstens fünf Schritte, geordnet nach Wirkung.

const done: NextStepFacts = {
	setup: null,
	gap: { open: null, startCount: 0 },
	overdueObligations: 0,
	roleGaps: 0,
	overdueNonconformities: 0,
	sodBlocks: 0,
	resolutionGaps: 0,
	blocker: null,
	controlsStarted: 50,
	processesWithoutAccountable: 0,
	riskProposals: 0,
	teamInvited: true,
	appetiteConfirmed: true,
	hasDocuments: true,
	hasProviders: true,
	processLinked: true,
};

const keys = (f: Partial<NextStepFacts>, limit?: number) =>
	nextSteps({ ...done, ...f }, limit).map((s) => s.key);

describe("nextSteps", () => {
	it("leer, wenn alles erledigt ist", () => {
		expect(nextSteps(done)).toEqual([]);
	});

	it("neue Org: Einrichtung zuerst, dann Gap-Analyse, höchstens fünf", () => {
		const steps = nextSteps({
			...done,
			setup: { next: "unternehmen", done: 1, total: 6 },
			gap: { open: null, startCount: 120 },
			controlsStarted: 0,
			teamInvited: false,
			appetiteConfirmed: false,
			hasDocuments: false,
			hasProviders: false,
			processLinked: false,
		});
		expect(steps.map((s) => s.key)).toEqual([
			"setup",
			"gap_start",
			"controls_start",
			"team",
			"appetite",
		]);
		expect(steps[0]?.href).toBe("/einrichtung/unternehmen");
		expect(steps[2]?.values).toEqual({
			count: 0,
			min: CONTROLS_STARTED_MIN,
		});
	});

	it("laufende Gap-Analyse statt einer neuen", () => {
		const k = keys({
			gap: {
				open: { id: "a1", title: "Gap 2026", answered: 3, total: 9 },
				startCount: 120,
			},
		});
		expect(k).toEqual(["gap_continue"]);
	});

	it("Fristen und Besetzung vor Blockern der Prüfungsreife", () => {
		const k = keys({
			blocker: {
				kind: "evidence_missing",
				severity: "high",
				label: "Zugriffsrechte",
				href: "/controls/CC-IAM-01",
				gain: 4.2,
			},
			roleGaps: 2,
			overdueObligations: 1,
			resolutionGaps: 1,
		});
		expect(k).toEqual([
			"obligations_overdue",
			"roles",
			"resolutions",
			"readiness",
		]);
	});

	it("kritischer Blocker vor Beschlüssen, leichter danach", () => {
		const blocker = (severity: "critical" | "low") => ({
			kind: "control_not_implemented" as const,
			severity,
			label: "Backup",
			href: "/controls/CC-BCM-03",
			gain: 2,
		});
		expect(keys({ resolutionGaps: 1, blocker: blocker("critical") })).toEqual([
			"readiness",
			"resolutions",
		]);
		expect(keys({ resolutionGaps: 1, blocker: blocker("low") })).toEqual([
			"resolutions",
			"readiness",
		]);
	});

	it("jede Art hat Titel und Satz in den Texten", () => {
		const all = nextSteps(
			{
				setup: { next: "rollen", done: 0, total: 6 },
				gap: { open: null, startCount: 1 },
				overdueObligations: 1,
				roleGaps: 1,
				overdueNonconformities: 1,
				sodBlocks: 1,
				resolutionGaps: 1,
				blocker: {
					kind: "nc_open",
					severity: "medium",
					label: "x",
					href: "/abweichungen",
					gain: 1,
				},
				controlsStarted: 0,
				processesWithoutAccountable: 1,
				riskProposals: 1,
				teamInvited: false,
				appetiteConfirmed: false,
				hasDocuments: false,
				hasProviders: false,
				processLinked: false,
			},
			99,
		);
		const texts = de.NextSteps as Record<string, string>;
		expect(all.length).toBe(16);
		for (const s of all) {
			expect(texts[`step_${s.key}`], s.key).toBeTruthy();
			expect(texts[`detail_${s.key}`], s.key).toBeTruthy();
		}
		// gap_continue tritt nur ohne gap_start auf
		expect(texts.step_gap_continue).toBeTruthy();
		expect(texts.detail_gap_continue).toBeTruthy();
	});
});
