import type {
	AIProvider,
	ExtractedDocument,
	ExtractedProfile,
	MatchRationaleInput,
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

	async extractDocument(
		bytes: Uint8Array,
		mime: string,
		hint: "cv" | "certificate" | "badge" | "id_doc" | "other",
	): Promise<ExtractedDocument> {
		// Deterministic fake metadata. Real provider hits the model with the file.
		switch (hint) {
			case "cv": {
				const data = await this.parseCv(bytes, mime);
				return { kind: "cv", data };
			}
			case "certificate":
				return {
					kind: "certificate",
					data: {
						title: "Beispiel-Zertifikat",
						issuer: "Demo-Akademie",
						issuedAt: "2024-06",
						grade: "1,7",
					},
				};
			case "id_doc":
				return {
					kind: "id_doc",
					data: { docType: "id_card", fullName: undefined },
				};
			case "badge":
				return {
					kind: "badge",
					data: {
						name: "Mock Open Badge",
						issuerName: "Demo Issuer",
						issuedAt: "2025-03",
					},
				};
			default:
				return { kind: "other", data: { sizeBytes: bytes.length } };
		}
	}

	async matchRationale(input: MatchRationaleInput): Promise<string> {
		const head = input.candidateHeadline ?? "Kandidat:in";
		const matched = input.matchedSkills.slice(0, 3).join(", ");
		const missing = input.missingSkills.slice(0, 2).join(", ");
		const yrs = input.yearsExperience ?? 0;
		if (input.matchedSkills.length === 0 && input.missingSkills.length === 0) {
			return `${head}, ${yrs} Jahre Erfahrung — passt grundsätzlich zur Stelle.`;
		}
		const parts = [
			`${head} (${yrs} Jahre)`,
			matched ? `bringt ${matched} mit` : null,
			missing ? `noch offen: ${missing}` : null,
		].filter(Boolean);
		return `${parts.join(", ")}.`;
	}
}
