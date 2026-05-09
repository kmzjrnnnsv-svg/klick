import { describe, expect, it } from "vitest";
import type { CandidateProfile, Job } from "@/db/schema";
import { scoreMatch } from "@/lib/match/engine";

const baseJob: Job = {
	id: "job-1",
	employerId: "emp-1",
	title: "Senior Frontend Engineer",
	description: "TypeScript + React",
	location: "Berlin",
	remotePolicy: "hybrid",
	employmentType: "fulltime",
	salaryMin: 70000,
	salaryMax: 90000,
	yearsExperienceMin: 4,
	languages: ["de"],
	requirements: [
		{ name: "TypeScript", weight: "must", minLevel: 4 },
		{ name: "React", weight: "must", minLevel: 4 },
		{ name: "Tailwind CSS", weight: "nice" },
	],
	status: "published",
	locationLat: 52.52,
	locationLng: 13.405,
	salaryBenchmarkLow: 75000,
	salaryBenchmarkHigh: 95000,
	salaryFairness: "fair",
	salaryDeltaPct: -2,
	teamSize: null,
	growthStage: null,
	techStackDetail: null,
	decisionProcess: null,
	remoteOnsiteRatio: null,
	mustReasoning: null,
	first90DaysGoals: null,
	postingQuality: null,
	templateId: null,
	honestPostingFlag: "open",
	createdAt: new Date(),
	updatedAt: new Date(),
};

const baseProfile: CandidateProfile = {
	userId: "u-1",
	displayName: "Test Candidate",
	headline: "Senior Frontend Engineer",
	location: "Berlin",
	yearsExperience: 6,
	salaryMin: 75000,
	salaryDesired: null,
	canBeContactedBy: "all",
	openToOffers: true,
	openToOffersUntil: null,
	languages: ["de:native", "en:c1"],
	skills: [
		{ name: "TypeScript", level: 5 },
		{ name: "React", level: 5 },
		{ name: "Tailwind CSS", level: 3 },
	],
	experience: null,
	education: null,
	summary: null,
	industries: null,
	awards: null,
	certificationsMentioned: null,
	mobility: null,
	preferredRoleLevel: "senior",
	maxCommuteMinutes: 60,
	transportMode: "car",
	addressLat: 52.52,
	addressLng: 13.405,
	visibility: "matches_only",
	onboardingCompletedAt: new Date(),
	insights: null,
	insightsUpdatedAt: null,
	careerAnalysis: null,
	careerAnalysisAt: null,
	publicShareToken: null,
	updatedAt: new Date(),
};

describe("scoreMatch", () => {
	it("passes a strong direct match with all must-haves", () => {
		const r = scoreMatch(baseJob, baseProfile);
		expect(r.hardPass).toBe(true);
		expect(r.matchedSkills).toContain("TypeScript");
		expect(r.matchedSkills).toContain("React");
		expect(r.softScore).toBeGreaterThan(50);
	});

	it("rejects a candidate missing a must-have skill (no adjacency)", () => {
		const profile = {
			...baseProfile,
			skills: [{ name: "PHP", level: 5 as const }],
		};
		const r = scoreMatch(baseJob, profile);
		expect(r.hardPass).toBe(false);
		expect(r.missingSkills.length).toBeGreaterThan(0);
	});

	it("rejects a candidate with too few years", () => {
		const profile = { ...baseProfile, yearsExperience: 1 };
		const r = scoreMatch(baseJob, profile);
		expect(r.hardPass).toBe(false);
	});

	it("rejects a candidate when no shared language", () => {
		const profile = { ...baseProfile, languages: ["fr:native"] };
		const r = scoreMatch(baseJob, profile);
		expect(r.hardPass).toBe(false);
	});

	it("recovers Quereinstieg via skill cluster (Vue → React)", () => {
		// Vue dev applying for React role — adjacent in different cluster?
		// Actually Vue and React are in *different* clusters in our taxonomy,
		// so this should fail. Use a real adjacency: Java → Kotlin.
		const javaJob: Job = {
			...baseJob,
			requirements: [
				{ name: "Kotlin", weight: "must", minLevel: 4 },
				{ name: "Spring Boot", weight: "must" },
			],
		};
		const javaProfile = {
			...baseProfile,
			skills: [
				{ name: "Java", level: 5 as const },
				{ name: "Spring Boot", level: 4 as const },
			],
		};
		const r = scoreMatch(javaJob, javaProfile);
		expect(r.hardPass).toBe(true);
		expect(r.adjacentSkills).toContain("Kotlin");
	});

	it("computes commute distance for non-remote job + flags exceedsLimit", () => {
		// Job in Frankfurt, candidate in Berlin → ~430 km, exceeds 60 min.
		const ffJob = {
			...baseJob,
			remotePolicy: "hybrid" as const,
			locationLat: 50.11,
			locationLng: 8.68,
		};
		const r = scoreMatch(ffJob, baseProfile);
		expect(r.commute).not.toBeNull();
		expect(r.commute?.km).toBeGreaterThan(400);
		expect(r.commute?.exceedsLimit).toBe(true);
		expect(r.hardPass).toBe(false);
	});

	it("skips commute computation for remote jobs", () => {
		const remoteJob = { ...baseJob, remotePolicy: "remote" as const };
		const r = scoreMatch(remoteJob, baseProfile);
		expect(r.commute).toBeNull();
		expect(r.hardPass).toBe(true);
	});

	it("applies soft penalty for long commutes within limit", () => {
		// Candidate ~25km west of Berlin, ~25 min by car (well within 60 min).
		const profileMid = {
			...baseProfile,
			addressLat: 52.52,
			addressLng: 13.04,
			maxCommuteMinutes: 60,
		};
		const r = scoreMatch(baseJob, profileMid);
		const profileNear = {
			...baseProfile,
			addressLat: baseJob.locationLat ?? 52.52,
			addressLng: baseJob.locationLng ?? 13.405,
		};
		const rNear = scoreMatch(baseJob, profileNear);
		expect(r.commute?.exceedsLimit).toBe(false);
		expect(r.softScore).toBeLessThanOrEqual(rNear.softScore);
	});
});
