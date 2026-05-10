import { describe, expect, it } from "vitest";
import type { CandidateProfile } from "@/db/schema";
import {
	isVisibleAt,
	redactProfile,
	visibilityFor,
} from "@/lib/profile/visibility";

const baseProfile = {
	userId: "u1",
	displayName: "Kai Sommer",
	headline: "Senior Frontend",
	location: "Berlin",
	yearsExperience: 7,
	salaryMin: 75000,
	salaryDesired: 90000,
	canBeContactedBy: "all",
	openToOffers: true,
	openToOffersUntil: null,
	languages: ["de", "en"],
	skills: [{ name: "TypeScript" }],
	experience: [],
	education: [
		{ institution: "TU München", degree: "M.Sc. Informatik" },
	],
	summary: "Frontend-Spezialist mit Fokus auf Design-Systeme.",
	industries: ["Fintech"],
	awards: ["Best Paper 2023"],
	certificationsMentioned: null,
	mobility: null,
	preferredRoleLevel: null,
	maxCommuteMinutes: null,
	transportMode: null,
	addressLat: null,
	addressLng: null,
	visibility: "matches_only",
	onboardingCompletedAt: null,
	insights: null,
	insightsUpdatedAt: null,
	careerAnalysis: null,
	careerAnalysisAt: null,
	publicShareToken: "abcdef0123456789xyz",
	profileLanguageOrigin: null,
	translations: null,
	translationsUpdatedAt: null,
	publications: [{ title: "A talk" }],
	projects: [{ name: "klick" }],
	volunteering: [],
	drivingLicenses: ["B"],
	availability: { status: "immediate" as const },
	socialLinks: { github: "https://github.com/kai" },
	workPermitStatus: "eu" as const,
	sectionVisibility: null,
	updatedAt: new Date(),
} as unknown as CandidateProfile;

describe("visibilityFor", () => {
	it("liefert matches_only-Default wenn nichts gesetzt", () => {
		expect(visibilityFor("education", null)).toBe("matches_only");
	});

	it("salary ist per Default privat", () => {
		expect(visibilityFor("salary", null)).toBe("private");
	});

	it("respektiert die Map", () => {
		expect(visibilityFor("education", { education: "public" })).toBe("public");
	});
});

describe("isVisibleAt", () => {
	it("public-Sektion ist im public scope sichtbar", () => {
		expect(isVisibleAt("education", { education: "public" }, "public")).toBe(
			true,
		);
	});

	it("matches-only-Sektion ist im public scope NICHT sichtbar", () => {
		expect(isVisibleAt("education", null, "public")).toBe(false);
	});

	it("matches-only-Sektion ist im matches scope sichtbar", () => {
		expect(isVisibleAt("education", null, "matches")).toBe(true);
	});

	it("private-Sektion ist nirgends sichtbar", () => {
		expect(
			isVisibleAt("education", { education: "private" }, "public"),
		).toBe(false);
		expect(
			isVisibleAt("education", { education: "private" }, "matches"),
		).toBe(false);
	});
});

describe("redactProfile", () => {
	it("public scope versteckt alles ohne explizite public-Markierung", () => {
		const out = redactProfile(baseProfile, "public");
		expect(out.education).toBeNull();
		expect(out.publications).toBeNull();
		expect(out.salaryMin).toBeNull();
	});

	it("public scope zeigt was explizit public ist", () => {
		const out = redactProfile(
			{
				...baseProfile,
				sectionVisibility: {
					education: "public",
					publications: "public",
					basics: "public",
				},
			},
			"public",
		);
		expect(out.education).not.toBeNull();
		expect(out.publications).not.toBeNull();
		expect(out.displayName).toBe("Kai Sommer");
		// Salary bleibt private (Default)
		expect(out.salaryMin).toBeNull();
	});

	it("matches scope zeigt matches_only-Default-Sektionen, blendet Salary aus", () => {
		const out = redactProfile(baseProfile, "matches");
		expect(out.education).not.toBeNull();
		expect(out.summary).not.toBeNull();
		expect(out.salaryMin).toBeNull(); // salary default = private
	});
});
