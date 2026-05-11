import { describe, expect, it } from "vitest";
import {
	buildSummaryFallback,
	normalizeEducationDegree,
	normalizeEducationList,
} from "@/lib/ai/normalize";

describe("normalizeEducationDegree", () => {
	it("liest sauberen Titel ohne Markierung als completed=true", () => {
		expect(normalizeEducationDegree("M.Sc. Informatik")).toEqual({
			degree: "M.Sc. Informatik",
			completed: true,
		});
	});

	it("strippt '(ohne Abschluss)' und setzt completed=false", () => {
		expect(normalizeEducationDegree("Informatik (ohne Abschluss)")).toEqual({
			degree: "Informatik",
			completed: false,
		});
	});

	it("strippt 'Elektrotechnik (ohne Abschluss)'", () => {
		expect(normalizeEducationDegree("Elektrotechnik (ohne Abschluss)")).toEqual(
			{
				degree: "Elektrotechnik",
				completed: false,
			},
		);
	});

	it("strippt unklammerte Variante mit Bindestrich", () => {
		expect(
			normalizeEducationDegree("M.Sc. Informatik – ohne Abschluss"),
		).toEqual({
			degree: "M.Sc. Informatik",
			completed: false,
		});
	});

	it("erkennt 'abgebrochen'", () => {
		expect(normalizeEducationDegree("BWL (abgebrochen)")).toEqual({
			degree: "BWL",
			completed: false,
		});
	});

	it("erkennt 'no degree'", () => {
		expect(normalizeEducationDegree("Computer Science (no degree)")).toEqual({
			degree: "Computer Science",
			completed: false,
		});
	});
});

describe("normalizeEducationList", () => {
	it("respektiert ein bereits gesetztes completed-Flag", () => {
		const out = normalizeEducationList([
			{
				institution: "TU",
				degree: "Informatik (ohne Abschluss)",
				completed: true,
			},
		]);
		expect(out?.[0]).toMatchObject({
			degree: "Informatik",
			completed: true,
		});
	});

	it("setzt completed=false aus Titel-Suffix wenn keine Angabe vom Modell", () => {
		const out = normalizeEducationList([
			{ institution: "TU", degree: "Informatik (ohne Abschluss)" },
		]);
		expect(out?.[0]).toMatchObject({
			degree: "Informatik",
			completed: false,
		});
	});
});

describe("buildSummaryFallback", () => {
	it("baut Mini-Pitch aus Headline + Years + Skills", () => {
		const text = buildSummaryFallback({
			headline: "Senior Frontend Engineer",
			yearsExperience: 7,
			skills: [{ name: "TypeScript" }, { name: "React" }, { name: "Next.js" }],
		});
		expect(text).toContain("Senior Frontend Engineer");
		expect(text).toContain("7 Jahren");
		expect(text).toContain("TypeScript");
	});

	it("gibt undefined wenn nichts Brauchbares da ist", () => {
		expect(buildSummaryFallback({})).toBeUndefined();
	});
});
