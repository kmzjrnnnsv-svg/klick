import type {
	AIProvider,
	ExtractedProfile,
	SuggestedJobRequirement,
} from "./types";

export class MockAIProvider implements AIProvider {
	readonly slug = "mock";

	async parseCv(bytes: Uint8Array, _mime: string): Promise<ExtractedProfile> {
		// Deterministic fake output so dev iteration is fast and offline-capable.
		// Vary lightly by file size so two test files don't look identical.
		const seed = bytes.length % 3;
		return {
			displayName: ["Maria Schmidt", "Jonas Müller", "Aylin Demir"][seed],
			headline: [
				"Senior Software Engineer",
				"Product Designer",
				"Data Engineer",
			][seed],
			location: ["Berlin, DE", "München, DE", "Hamburg, DE"][seed],
			yearsExperience: [7, 4, 9][seed],
			languages: ["de:native", "en:c1"],
			skills: [
				{ name: "TypeScript", level: 5 },
				{ name: "React", level: 4 },
				{ name: "PostgreSQL", level: 4 },
				{ name: "Docker", level: 3 },
			],
			experience: [
				{
					company: "Acme GmbH",
					role: "Senior Engineer",
					start: "2022-03",
					end: "present",
					description: "Plattformteam, Backend-Modernisierung.",
				},
				{
					company: "Beispiel AG",
					role: "Engineer",
					start: "2019-01",
					end: "2022-02",
					description: "Web-Frontend, A/B-Tests, Telemetry.",
				},
			],
			education: [
				{
					institution: "TU Berlin",
					degree: "M.Sc. Informatik",
					start: "2016-10",
					end: "2018-09",
				},
			],
			summary:
				"Mock-Profil für die Entwicklungs-Umgebung. Kein echter CV-Inhalt — setze ANTHROPIC_API_KEY für die echte Extraktion.",
		};
	}

	async suggestJobRequirements(input: {
		title: string;
		description: string;
	}): Promise<SuggestedJobRequirement[]> {
		// Pull a handful of common keywords out of the description as a fake AI.
		const VOCAB = [
			"TypeScript",
			"React",
			"Node.js",
			"PostgreSQL",
			"Python",
			"Docker",
			"Kubernetes",
			"AWS",
			"Figma",
			"Tailwind",
			"GraphQL",
			"REST",
			"PHP",
			"Laravel",
			"Java",
			"Kotlin",
		];
		const text = `${input.title} ${input.description}`.toLowerCase();
		const hits = VOCAB.filter((v) => text.includes(v.toLowerCase()));
		const chosen = hits.length > 0 ? hits : ["Communication", "Teamwork"];
		return chosen.slice(0, 6).map((name, i) => ({
			name,
			weight: i < 2 ? ("must" as const) : ("nice" as const),
			minLevel: i < 2 ? (3 as const) : undefined,
		}));
	}
}
