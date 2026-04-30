import type {
	AIProvider,
	CandidateNarrative,
	CandidateNarrativeInput,
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
					employmentType: "employee",
				},
				{
					company: "Demir Studios (eigene Gründung)",
					role: "Co-Founder & CTO",
					start: "2020-04",
					end: "2022-02",
					description: "B2B-SaaS für KMU. Eigene Gründung, Pre-Seed Round.",
					employmentType: "founder",
				},
				{
					company: "Beispiel AG",
					role: "Engineer",
					start: "2019-01",
					end: "2020-03",
					description: "Web-Frontend, A/B-Tests, Telemetry.",
					employmentType: "employee",
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
			industries: ["SaaS", "Fintech"],
			awards: ["Best Paper @ Demo-Conf 2023"],
			certificationsMentioned: [
				{
					name: "AWS Solutions Architect — Associate",
					issuer: "AWS",
					year: "2023",
				},
			],
			mobility: "Hybrid Berlin / 2 Tage Office",
			preferredRoleLevel: "senior",
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

	async summarizeCandidate(
		input: CandidateNarrativeInput,
	): Promise<CandidateNarrative> {
		const tags: string[] = [];
		if (input.totalRoles >= 4) tags.push("vielseitig");
		if (input.yearsContinuous >= 3) tags.push("verlässlich");
		if (input.certificatePattern === "steady") tags.push("lernfreudig");
		if (input.certificatePattern === "burst") tags.push("zielstrebig");
		if (input.skills.length >= 5) tags.push("breites Skill-Set");
		if (input.gaps >= 2) tags.push("eigenständige Phasen");
		if (tags.length === 0) tags.push("fokussiert");

		const strengths: string[] = [];
		if (input.skills[0]) strengths.push(`Kernstärke: ${input.skills[0]}`);
		if (input.yearsActive >= 5)
			strengths.push(`${input.yearsActive} Jahre Praxis`);
		if (input.certificateCount > 0)
			strengths.push(`${input.certificateCount} Zertifikate`);
		if (strengths.length === 0) strengths.push("Solider Einstieg");

		const role = input.currentRole?.role ?? input.headline ?? "Profi";
		const summary =
			`${role} mit ${input.yearsActive} Jahren Berufserfahrung. ` +
			`Mock-Narrative — setze ANTHROPIC_API_KEY für eine echte KI-Zusammenfassung.`;

		return {
			summary,
			workStyle: tags.slice(0, 5),
			strengths: strengths.slice(0, 4),
		};
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
