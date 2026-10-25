import { describe, expect, it } from "vitest";
import { APPROVAL_WORKFLOW_TEMPLATES } from "@/lib/compliance/catalog/approval-workflows";
import { governanceChecks } from "@/lib/compliance/governance-checks";

// Pflichten prüfen statt erzwingen (ADR-024)

const ALL = [
	"iso27001",
	"dora",
	"gwg",
	"micar",
	"zag",
	"zag-marisk",
	"ccss",
	"cra",
];
const seed = () =>
	APPROVAL_WORKFLOW_TEMPLATES.map((t) => ({
		kind: t.kind,
		enabled: true,
		steps: t.steps,
	}));

describe("governanceChecks", () => {
	it("Standard-Seed erfüllt jede Pflicht", () => {
		expect(
			governanceChecks({ frameworks: ALL, stage: 2, workflows: seed() }),
		).toEqual([]);
	});

	it("ausgeschalteter Pflicht-Ablauf wird mit Fundstelle gemeldet", () => {
		const workflows = seed().map((w) =>
			w.kind === "scope" ? { ...w, enabled: false } : w,
		);
		const out = governanceChecks({
			frameworks: ["iso27001"],
			stage: 0,
			workflows,
		});
		expect(out).toEqual([
			expect.objectContaining({
				kind: "scope",
				problem: "off",
				basis: ["ISO 27001 Abschnitt 4.3"],
			}),
		]);
	});

	it("Bestellung ohne Geschäftsleitung verletzt ISO 27001 5.3", () => {
		const workflows = seed().map((w) =>
			w.kind === "role_appointment"
				? {
						...w,
						steps: [{ order: 1, approverRule: "function:compliance" }],
					}
				: w,
		);
		const out = governanceChecks({
			frameworks: ["iso27001"],
			stage: 0,
			workflows,
		});
		expect(out).toContainEqual(
			expect.objectContaining({
				kind: "role_appointment",
				problem: "missing_approver",
				missing: ["function:management_body"],
			}),
		);
	});

	it("Bestellung durch nur eine Person der GL statt aller", () => {
		const workflows = seed().map((w) =>
			w.kind === "role_appointment"
				? {
						...w,
						steps: [{ order: 1, approverRule: "function:management_body" }],
					}
				: w,
		);
		const out = governanceChecks({ frameworks: ["dora"], stage: 0, workflows });
		expect(out).toContainEqual(
			expect.objectContaining({
				kind: "role_appointment",
				problem: "not_everyone",
			}),
		);
	});

	it("ohne Rahmenwerk mit Fundstelle keine Befunde", () => {
		expect(
			governanceChecks({ frameworks: [], stage: 0, workflows: [] }),
		).toEqual([]);
	});
});
