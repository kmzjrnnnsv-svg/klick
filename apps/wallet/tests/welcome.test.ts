import { stepFromSlug, WELCOME_SLUG, welcomeHref } from "@wallet/lib/welcome";
import { describe, expect, it } from "vitest";
import { INTRO_STEPS } from "@/lib/wallet/intro";

describe("Einführung: englische Adressen", () => {
	it("jeder Schritt hat eine eigene Adresse und kommt zurück", () => {
		const slugs = INTRO_STEPS.map((s) => WELCOME_SLUG[s]);
		expect(new Set(slugs).size).toBe(INTRO_STEPS.length);
		for (const s of INTRO_STEPS)
			expect(stepFromSlug(welcomeHref(s).split("/").pop() ?? "")).toBe(s);
	});

	it("unbekannte oder deutsche Adressen gibt es nicht", () => {
		expect(stepFromSlug("willkommen")).toBeNull();
		expect(stepFromSlug("")).toBeNull();
		expect(welcomeHref("willkommen")).toBe("/welcome/start");
	});
});
