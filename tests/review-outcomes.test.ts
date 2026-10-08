import { describe, expect, it } from "vitest";
import {
	completeReviewSchema,
	resolutionSchema,
} from "@/lib/validation/governance";

const reviewId = "00000000-0000-4000-8000-000000000001";

describe("Managementbewertung → Ergebnisse", () => {
	it("Maßnahme ohne Art bleibt eine Aufgabe (Rückwärtskompatibilität)", () => {
		const r = completeReviewSchema.parse({
			reviewId,
			status: "held",
			actions: [{ title: "Backup-Konzept überarbeiten" }],
		});
		expect(r.actions?.[0]?.kind).toBe("task");
	});

	it("nimmt Beschluss und Abweichung mit Text an", () => {
		const r = completeReviewSchema.parse({
			reviewId,
			status: "done",
			actions: [
				{
					kind: "resolution",
					title: "Risikoappetit 2027",
					text: "Beschlossen: …",
				},
				{ kind: "nonconformity", title: "Lieferantenbewertung fehlt" },
			],
		});
		expect(r.actions?.map((a) => a.kind)).toEqual([
			"resolution",
			"nonconformity",
		]);
	});

	it("lehnt unbekannte Arten ab", () => {
		expect(
			completeReviewSchema.safeParse({
				reviewId,
				status: "held",
				actions: [{ kind: "memo", title: "x" }],
			}).success,
		).toBe(false);
	});

	it("Beschluss-Bezug nur auf bekannte Entitätsarten", () => {
		const base = {
			subject: "Freigabe Leitlinie",
			decisionText: "Die Leitlinie wird freigegeben.",
			date: "2026-10-08",
			linkedEntityId: reviewId,
		};
		expect(
			resolutionSchema.safeParse({
				...base,
				linkedEntityType: "management_review",
			}).success,
		).toBe(true);
		expect(
			resolutionSchema.safeParse({ ...base, linkedEntityType: "kantine" })
				.success,
		).toBe(false);
	});
});
