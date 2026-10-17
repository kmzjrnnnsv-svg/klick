import { describe, expect, it } from "vitest";
import { FRAMEWORK_SLUGS } from "@/lib/compliance/catalog/frameworks";
import { createAssessmentSchema } from "@/lib/validation/assessments";
import { auditSchema, objectiveSchema } from "@/lib/validation/governance";
import { addFrameworksSchema } from "@/lib/validation/grc";

// Rahmenwerk-Listen in Formularen: „alle auswählen“ muss mit dem ganzen
// Katalog funktionieren (QA-Fund: feste Grenze 20 brach mit dem CRA als 21.).
describe("Rahmenwerk-Auswahl in Schemas", () => {
	it("akzeptiert alle Rahmenwerke des Katalogs", () => {
		const all = [...FRAMEWORK_SLUGS];
		expect(all.length).toBeGreaterThan(20);
		expect(createAssessmentSchema.safeParse({ frameworks: all }).success).toBe(
			true,
		);
		expect(addFrameworksSchema.safeParse({ frameworks: all }).success).toBe(
			true,
		);
		expect(objectiveSchema.shape.frameworkIds.safeParse(all).success).toBe(
			true,
		);
		expect(auditSchema.shape.frameworkIds.safeParse(all).success).toBe(true);
	});
});
