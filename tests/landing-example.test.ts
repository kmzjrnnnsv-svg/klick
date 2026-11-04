import { describe, expect, it } from "vitest";
import {
	EDGES_BY_CONTROL,
	splitRequirementKey,
} from "@/lib/compliance/catalog";
import {
	LANDING_EXAMPLE_CONTROL,
	landingExample,
} from "@/lib/marketing/landing-example";

describe("Beispiel auf der Startseite", () => {
	it("zählt nur Rahmenwerke, die das Control ganz tragen", () => {
		const ex = landingExample();
		expect(ex.title).not.toBe("");
		expect(ex.frameworks.length).toBeGreaterThanOrEqual(10);
		const full = new Set(
			(EDGES_BY_CONTROL.get(LANDING_EXAMPLE_CONTROL) ?? [])
				.filter((e) => e.coverage === "full")
				.map((e) => splitRequirementKey(e.requirement).framework),
		);
		// Ein Rahmenwerk, das die Maßnahme nur teilweise trägt, steht nicht im Beispiel.
		expect(ex.frameworks.length).toBe(full.size);
	});

	it("nimmt keine Maßnahme, deren Inhalt je Rahmenwerk verschieden ist", () => {
		// Schulungen: gleiches Programm, aber andere Inhalte je Rahmenwerk.
		expect(LANDING_EXAMPLE_CONTROL).not.toBe("CC-HR-03");
	});
});
