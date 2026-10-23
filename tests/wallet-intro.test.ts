import { describe, expect, it } from "vitest";
import {
	INTRO_STEPS,
	introNeighbours,
	isIntroStep,
	laterStep,
	resumeStep,
	shouldShowIntro,
} from "@/lib/wallet/intro";

describe("Wallet-Einführung", () => {
	it("Nachbarn an den Rändern", () => {
		expect(introNeighbours("willkommen")).toEqual({
			prev: null,
			next: "sicherheit",
		});
		expect(introNeighbours("einzahlung")).toEqual({
			prev: "kurse",
			next: null,
		});
	});

	it("setzt nach dem zuletzt abgeschlossenen Schritt fort", () => {
		expect(resumeStep(null)).toBe("willkommen");
		expect(resumeStep("quatsch")).toBe("willkommen");
		expect(resumeStep("netz")).toBe("konto");
		expect(resumeStep("einzahlung")).toBe("einzahlung");
	});

	it("zeigt sich, bis abgeschlossen oder verschoben", () => {
		const none = { introCompletedAt: null, introDeferredAt: null };
		expect(shouldShowIntro(none)).toBe(true);
		expect(shouldShowIntro({ ...none, introDeferredAt: new Date() })).toBe(
			false,
		);
		expect(shouldShowIntro({ ...none, introCompletedAt: new Date() })).toBe(
			false,
		);
	});

	it("Stand läuft nie rückwärts", () => {
		expect(laterStep(null, "sicherheit")).toBe("sicherheit");
		expect(laterStep("kurse", "netz")).toBe("kurse");
		expect(laterStep("netz", "kurse")).toBe("kurse");
	});

	it("Schritte sind URL-taugliche Slugs", () => {
		for (const s of INTRO_STEPS) {
			expect(isIntroStep(s)).toBe(true);
			expect(s).toMatch(/^[a-z]+$/);
		}
	});
});
