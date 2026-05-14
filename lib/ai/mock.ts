import type {
	AIProvider,
	CandidateNarrative,
	CandidateNarrativeInput,
	CareerAnalysis,
	ExtractedDocument,
	ExtractedJobPosting,
	ExtractedProfile,
	JobPostingQuality,
	MatchAssessment,
	MatchAssessmentInput,
	MatchRationaleInput,
	ProfileTranslationInput,
	ProfileTranslationOutput,
	SalaryBenchmark,
	SalaryBenchmarkInput,
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
		const en = input.locale === "en";
		const tags: string[] = [];
		if (input.totalRoles >= 4) tags.push(en ? "versatile" : "vielseitig");
		if (input.yearsContinuous >= 3) tags.push(en ? "reliable" : "verlässlich");
		if (input.certificatePattern === "steady")
			tags.push(en ? "eager to learn" : "lernfreudig");
		if (input.certificatePattern === "burst")
			tags.push(en ? "goal-driven" : "zielstrebig");
		if (input.skills.length >= 5)
			tags.push(en ? "broad skill set" : "breites Skill-Set");
		if (input.gaps >= 2)
			tags.push(en ? "independent phases" : "eigenständige Phasen");
		if (tags.length === 0) tags.push(en ? "focused" : "fokussiert");

		const strengths: string[] = [];
		if (input.skills[0])
			strengths.push(
				en
					? `Core strength: ${input.skills[0]}`
					: `Kernstärke: ${input.skills[0]}`,
			);
		if (input.yearsActive >= 5)
			strengths.push(
				en
					? `${input.yearsActive} years of practice in total`
					: `Insgesamt ${input.yearsActive} Jahre Praxis`,
			);
		if (input.certificateCount > 0)
			strengths.push(
				en
					? `${input.certificateCount} certificates`
					: `${input.certificateCount} Zertifikate`,
			);
		if (strengths.length === 0)
			strengths.push(en ? "Solid foundation" : "Solider Einstieg");

		const role = input.currentRole?.role ?? input.headline ?? "Profi";
		const currentRoleYears = input.currentRole
			? Math.round(input.currentRole.monthsOngoing / 12)
			: 0;
		// Bewusst "insgesamt" statt "zuvor" — yearsActive enthält die
		// aktuelle Rolle bereits.
		const summary =
			currentRoleYears > 0 && input.previousYearsBeforeCurrent > 0
				? en
					? `${role} for ${currentRoleYears} years, with ${input.previousYearsBeforeCurrent} years of prior experience — ${input.yearsActive} years in total.`
					: `Seit ${currentRoleYears} Jahren als ${role}, davor ${input.previousYearsBeforeCurrent} Jahre weitere Berufserfahrung — insgesamt ${input.yearsActive} Jahre.`
				: en
					? `${role} with ${input.yearsActive} years of professional experience in total.`
					: `${role} mit insgesamt ${input.yearsActive} Jahren Berufserfahrung.`;

		return {
			summary,
			workStyle: tags.slice(0, 5),
			strengths: strengths.slice(0, 4),
		};
	}

	async translateProfile(
		input: ProfileTranslationInput,
	): Promise<ProfileTranslationOutput> {
		// Mock-Provider übersetzt nicht — er gibt einfach die Eingabe 1:1
		// zurück. Echte Übersetzung erfordert ANTHROPIC_API_KEY.
		return {
			headline: input.headline ?? undefined,
			summary: input.summary ?? undefined,
			industries: input.industries ?? undefined,
			languages: input.languages ?? undefined,
			skills: input.skills ?? undefined,
			experience: input.experience
				? input.experience.map((e) => ({
						role: e.role,
						description: e.description ?? undefined,
					}))
				: undefined,
			education: input.education
				? input.education.map((e) => ({
						degree: e.degree,
						thesisTitle: e.thesisTitle ?? undefined,
						focus: e.focus ?? undefined,
					}))
				: undefined,
			awards: input.awards ?? undefined,
			mobility: input.mobility ?? undefined,
			projects: input.projects
				? input.projects.map((p) => ({
						name: p.name,
						role: p.role ?? undefined,
						description: p.description ?? undefined,
					}))
				: undefined,
			publications: input.publications
				? input.publications.map((p) => ({
						title: p.title,
						venue: p.venue ?? undefined,
					}))
				: undefined,
			volunteering: input.volunteering
				? input.volunteering.map((v) => ({
						organization: v.organization,
						role: v.role,
						description: v.description ?? undefined,
					}))
				: undefined,
		};
	}

	async extractJobPosting(
		bytes: Uint8Array,
		_mime: string,
	): Promise<ExtractedJobPosting> {
		const seed = bytes.length % 2;
		return {
			title: [
				"Senior Frontend Engineer (m/w/d)",
				"Product Designer — Design Systems",
			][seed],
			description:
				"Mock-Stellenanzeige für die Entwicklungs-Umgebung. Setze ANTHROPIC_API_KEY für echte Extraktion. Aufgaben: Design-System weiter ausbauen, Performance optimieren, im Cross-Functional-Team treiben. Stack: TypeScript, React, Next.js, Tailwind.",
			location: ["Berlin", "Remote / EU"][seed],
			remotePolicy: ["hybrid", "remote"][seed] as "hybrid" | "remote",
			employmentType: "fulltime",
			salaryMin: 75000,
			salaryMax: 95000,
			yearsExperienceMin: 4,
			languages: ["Deutsch", "Englisch"],
			requirements: [
				{ name: "TypeScript", weight: "must", minLevel: 4 },
				{ name: "React", weight: "must", minLevel: 4 },
				{ name: "Next.js", weight: "nice", minLevel: 3 },
				{ name: "Tailwind CSS", weight: "nice" },
			],
		};
	}

	async benchmarkSalary(input: SalaryBenchmarkInput): Promise<SalaryBenchmark> {
		// Heuristic: base + per-year bump + level adjustment.
		const base = 45000;
		const years = Math.max(0, Math.min(20, input.yearsRequired));
		const yearBump = years * 4500;
		const lvlBump =
			input.level === "principal"
				? 25000
				: input.level === "lead"
					? 18000
					: input.level === "senior"
						? 10000
						: input.level === "mid"
							? 4000
							: 0;
		const remoteBump = input.remote === "remote" ? -3000 : 0;
		const center = Math.max(35000, base + yearBump + lvlBump + remoteBump);
		const low = Math.round((center - 6000) / 1000) * 1000;
		const high = Math.round((center + 12000) / 1000) * 1000;
		return {
			low,
			high,
			currency: "EUR",
			rationale: `Mock-Schätzung: ${input.title} · ${years} J. Erfahrung · ${input.remote}. Setze ANTHROPIC_API_KEY für echte Markteinschätzung.`,
		};
	}

	async assessMatch(input: MatchAssessmentInput): Promise<MatchAssessment> {
		const pros: string[] = [];
		const cons: string[] = [];
		if (input.matchedSkills.length > 0) {
			pros.push(`Bringt ${input.matchedSkills.slice(0, 3).join(", ")} mit.`);
		}
		if (input.adjacentSkills.length > 0) {
			pros.push(
				`Quereinstieg über ${input.adjacentSkills.slice(0, 2).join(", ")} möglich.`,
			);
		}
		const yrs = input.candidateYears ?? 0;
		if (yrs >= input.yearsRequired + 3) {
			pros.push(`${yrs} Jahre — komfortabel über dem Anforderungs-Minimum.`);
		}
		if (input.missingSkills.length > 0) {
			cons.push(`Fehlt: ${input.missingSkills.slice(0, 3).join(", ")}.`);
		}
		if (yrs > 0 && yrs < input.yearsRequired) {
			cons.push(
				`Erfahrung knapp: ${yrs} statt geforderte ${input.yearsRequired}.`,
			);
		}
		if (cons.length === 0) cons.push("Keine offensichtlichen Schwächen.");
		const verdict =
			yrs >= input.yearsRequired
				? `${yrs} J. — ${yrs - input.yearsRequired >= 0 ? `+${yrs - input.yearsRequired}` : ""} ggü. gefordert.`
				: `${yrs} J. — ${input.yearsRequired - yrs} unter Mindest.`;
		return { pros, cons, experienceVerdict: verdict };
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

	async gradeOpenAnswer(input: {
		question: string;
		rubric: string | null;
		answer: string;
		maxPoints: number;
	}): Promise<{ pointsEarned: number; feedback: string }> {
		// Deterministic mock — count meaningful words; cap at maxPoints.
		const words = input.answer.trim().split(/\s+/).filter(Boolean).length;
		const ratio = Math.max(0, Math.min(1, words / 60));
		const pointsEarned = Math.round(ratio * input.maxPoints);
		return {
			pointsEarned,
			feedback:
				words < 10
					? "Sehr knapp — mehr Detail zur Lösungsstrategie würde helfen."
					: words < 40
						? "Solide Antwort, könnte konkreter werden (Tools, Zahlen, Beispiele)."
						: "Ausführlich, mit Kontext und Trade-offs. Gute Antwort.",
		};
	}

	async suggestAssessmentQuestions(input: {
		title: string;
		description: string;
		requirements: { name: string; weight: "must" | "nice" }[];
	}) {
		// Pick the first two must-have skills and build deterministic prompts.
		const musts = input.requirements.filter((r) => r.weight === "must");
		const a = musts[0]?.name ?? "TypeScript";
		const b = musts[1]?.name ?? "PostgreSQL";
		return [
			{
				kind: "mc" as const,
				body: `In welchem Szenario ist ${a} klar die bessere Wahl?`,
				choices: [
					{
						text: `Wenn Typsicherheit über Zeit erhalten bleiben muss`,
						weight: 2,
					},
					{ text: `Bei reinen Prototypen ohne Tests`, weight: 0 },
					{ text: `Wenn das Team Erfahrung in Python hat`, weight: 0 },
				],
				correctChoice: 0,
				maxPoints: 2,
			},
			{
				kind: "mc" as const,
				body: `Welche Aussage zu ${b} stimmt?`,
				choices: [
					{
						text: `MVCC erlaubt parallele Lese- und Schreib-Transaktionen ohne Lese-Locks`,
						weight: 2,
					},
					{ text: `Alle Indexe sind clustered`, weight: 0 },
					{ text: `Es kennt keine Foreign Keys`, weight: 0 },
				],
				correctChoice: 0,
				maxPoints: 2,
			},
			{
				kind: "open" as const,
				body: `Beschreibe in 4-6 Sätzen, wie du ein Performance-Problem in einer ${input.title}-Codebase angehen würdest.`,
				rubric: `Pluspunkte: Messen vor Optimieren, klares Bottleneck-Hypothese, konkrete Tools, Trade-offs reflektiert. Minuspunkte: Generische Phrasen, "Cache überall", keine Hypothese.`,
				maxPoints: 4,
			},
			{
				kind: "open" as const,
				body: `Nenne ein konkretes Projekt, in dem du ${a} eingesetzt hast — was war die größte Herausforderung?`,
				rubric: `Pluspunkte: konkrete Zahlen oder Kontext, eigene Verantwortung sichtbar, Trade-offs benannt. Minuspunkte: vage Aussagen ohne Beispiel.`,
				maxPoints: 3,
			},
			{
				kind: "mc" as const,
				body: `Wann lehnst du eine Anforderung des Auftraggebers begründet ab?`,
				choices: [
					{
						text: `Wenn sie das Produkt mittelfristig schadet und ich Alternativen anbiete`,
						weight: 2,
					},
					{ text: `Wenn ich keine Lust habe`, weight: 0 },
					{ text: `Niemals — der Kunde hat immer recht`, weight: 0 },
				],
				correctChoice: 0,
				maxPoints: 1,
			},
		];
	}

	async analyzeCareerProspects(input: {
		profile: ExtractedProfile;
		yearsActive?: number;
		insights?: unknown;
		locale?: "de" | "en";
	}): Promise<CareerAnalysis> {
		// Künstliche Latenz im Mock-Modus, damit die Progress-Animation
		// im UI was zu zeigen hat — sonst snappt sie sofort auf 100%.
		await new Promise((r) => setTimeout(r, 1500));
		const skills = input.profile.skills?.map((s) => s.name) ?? [];
		const years = input.yearsActive ?? input.profile.yearsExperience ?? 3;
		const level = input.profile.preferredRoleLevel ?? "mid";
		const baseSalary =
			level === "principal" || level === "exec"
				? 120000
				: level === "lead"
					? 105000
					: level === "senior"
						? 85000
						: level === "mid"
							? 65000
							: 50000;
		const isTech = skills.some((s) =>
			["TypeScript", "React", "Python", "Go", "Java", "AWS"].some((k) =>
				s.toLowerCase().includes(k.toLowerCase()),
			),
		);
		const isDesign = skills.some((s) =>
			["Figma", "Sketch", "Design"].some((k) =>
				s.toLowerCase().includes(k.toLowerCase()),
			),
		);
		const primary = isTech
			? ["SaaS", "FinTech", "E-Commerce"]
			: isDesign
				? ["Agency", "Brand Studios", "Product"]
				: ["Industry"];
		const adjacent = isTech
			? [
					{
						name: "Public Sector / GovTech",
						rationale:
							"Wachsende Digitalisierung, dein Profil passt — wenig Konkurrenz, dafür stabilere Anstellungen.",
					},
					{
						name: "Climate Tech",
						rationale:
							"Hoher Talent-Mangel, Generalisten mit deinem Stack sind wertvoll. Sinn-Plus.",
					},
				]
			: [
					{
						name: "Consulting (Boutique)",
						rationale:
							"Kombination aus Domänen-Expertise + Mandats-Vielfalt. Höheres Tagessatz-Niveau möglich.",
					},
				];
		return {
			headline: `${level === "senior" || level === "lead" ? "Erfahrene:r" : "Solide:r"} ${input.profile.headline ?? "Profi"} mit ${years} Jahren Praxis. Deutliche ${
				skills[0] ?? "Generalist"
			}-Stärke, gute Kombination aus Hands-on und Reflexion. Markt: aktiv. Mock-Analyse — setze ANTHROPIC_API_KEY für echten Bericht.`,
			strengths: [
				skills[0] ? `Tiefe in ${skills[0]}` : "Solider Generalist",
				`${years} Jahre Praxis ohne längere Lücken`,
				"Mix aus Tech und Kommunikation",
			],
			growthAreas: [
				"Klarere Architektur-Story (mit Zahlen!)",
				"Sichtbarkeit nach außen — Talks, Posts, OSS",
				"Cross-funktionale Erfahrung mit Sales/Marketing",
			],
			salary: {
				low: Math.round(baseSalary * 0.9),
				mid: baseSalary,
				high: Math.round(baseSalary * 1.2),
				currency: "EUR",
				rationale: `Basis: Level=${level}, ${years} Jahre, deutscher Markt. Remote oder Headhunter-Vermittlung kann +10% bringen.`,
			},
			primaryIndustries: primary,
			adjacentIndustries: adjacent,
			certificationSuggestions: isTech
				? [
						{
							name: "AWS Solutions Architect — Associate",
							issuer: "AWS",
							why: "Standard-Anker für Backend/Infra, schnell ROI in Bewerbungen.",
							effortHours: 60,
						},
						{
							name: "CKA (Certified Kubernetes Administrator)",
							issuer: "CNCF",
							why: "Selten sichtbar, wenn vorhanden klares Differenzierungs-Signal.",
							effortHours: 80,
						},
					]
				: [
						{
							name: "Scrum Master Professional",
							issuer: "Scrum.org",
							why: "Hebt das Profil bei Senior-Generalisten heraus.",
							effortHours: 30,
						},
					],
			roleSuggestions: [
				{
					title: input.profile.headline ?? "Senior Engineer",
					rationale: "Direkter Match zum aktuellen Profil.",
					obvious: true,
				},
				{
					title: isTech ? "Solutions Engineer" : "Product Owner",
					rationale: isTech
						? "Tech-Verständnis + Kunden-Kontakt — oft 15-20% mehr Gehalt."
						: "Domänen-Wissen + Roadmap-Verantwortung passen zu deinem Profil.",
					obvious: false,
				},
				{
					title: isTech ? "Developer Advocate" : "Operations Lead",
					rationale: isTech
						? "Wenn dir Schreiben/Sprechen Spaß macht — Top-Markt 2026."
						: "Schnittstelle zu Engineering, gefragter Quereinstieg.",
					obvious: false,
				},
			],
			hiringPros: [
				"Glaubwürdige Praxisnähe ohne Buzzword-Bingo",
				"Eigeninitiative — eigene Projekte/Studien sichtbar",
			],
			hiringCons: [
				"Wenige Lead-/Mentoring-Erfahrungen sichtbar",
				"Reine MitarbeiterIn-Geschichte ohne Skalierungs-Story",
			],
			marketContext: {
				demand: isTech ? "high" : "medium",
				notes: isTech
					? "Senior Engineers im DACH stark nachgefragt; Headhunter-Quote ~30%."
					: "Stabiler Markt, kein Bonus mehr für reines digital affin.",
			},
		};
	}

	async assessJobPostingQuality(input: {
		title: string;
		description: string;
		requirements: { name: string; weight: "must" | "nice" }[];
		salaryMin: number | null;
		salaryMax: number | null;
		remotePolicy: string;
	}): Promise<JobPostingQuality> {
		const desc = input.description.trim();
		const wordCount = desc.split(/\s+/).length;
		const hasSalary = input.salaryMin !== null && input.salaryMax !== null;
		const mustCount = input.requirements.filter(
			(r) => r.weight === "must",
		).length;
		const niceCount = input.requirements.filter(
			(r) => r.weight === "nice",
		).length;

		const completeness = Math.min(
			100,
			(wordCount > 80 ? 30 : Math.round((wordCount / 80) * 30)) +
				(hasSalary ? 25 : 0) +
				(input.remotePolicy ? 15 : 0) +
				(mustCount >= 2 ? 15 : mustCount * 7) +
				(niceCount >= 2 ? 15 : niceCount * 7),
		);
		const clarity = Math.min(
			100,
			(desc.includes("Aufgaben") || desc.includes("Verantwortung") ? 30 : 0) +
				(desc.match(/\b(\d+%|\d+ Jahre|\d+ Tage)\b/) ? 25 : 0) +
				(wordCount > 120 ? 25 : Math.round((wordCount / 120) * 25)) +
				(mustCount > 0 && mustCount <= 5 ? 20 : 10),
		);
		const redFlags: string[] = [];
		const suggestions: string[] = [];
		if (!hasSalary) {
			redFlags.push("Kein Gehaltsband angegeben");
			suggestions.push(
				"Gehaltsband nennen — Stellen mit Range bekommen +40% Bewerbungen.",
			);
		}
		if (mustCount > 6) {
			redFlags.push("Über 6 Pflicht-Skills — schreckt Bewerbende ab");
			suggestions.push(
				"Reduziere Muss-Skills auf max 4-5; verschiebe den Rest zu Nice-to-have.",
			);
		}
		if (wordCount < 80) {
			suggestions.push(
				"Beschreibung zu kurz. Was ist die Mission, das Team, die ersten 90 Tage?",
			);
		}
		if (
			desc.toLowerCase().includes("rockstar") ||
			desc.toLowerCase().includes("ninja")
		) {
			redFlags.push(
				"Buzzwords wie 'Rockstar' oder 'Ninja' wirken unprofessionell",
			);
		}

		const score = Math.round((completeness + clarity) / 2);
		return { score, completeness, clarity, redFlags, suggestions };
	}

	async recommendCandidateSalary(input: {
		profile: ExtractedProfile;
		country: string;
		currency: string;
		priorEvaluations?: {
			low: number;
			mid: number;
			high: number;
			currency: string;
			rationale: string;
		}[];
	}): Promise<{
		low: number;
		mid: number;
		high: number;
		currency: string;
		rationale: string;
	}> {
		// Deterministischer Mock — basiert auf yearsExperience und Country-Multiplier.
		const years = input.profile.yearsExperience ?? 5;
		// Sehr grobe Multipliers, nur als Demo-Daten.
		const m: Record<string, number> = {
			DE: 1.0,
			AT: 0.92,
			CH: 1.45,
			NL: 1.05,
			GB: 1.1,
			US: 1.6,
			FR: 0.95,
			IT: 0.8,
			ES: 0.75,
			PL: 0.6,
		};
		const mult = m[input.country] ?? 1.0;
		const baseMid = (40000 + years * 6000) * mult;
		const low = Math.round((baseMid * 0.85) / 1000) * 1000;
		const high = Math.round((baseMid * 1.2) / 1000) * 1000;
		const mid = Math.round(baseMid / 1000) * 1000;
		return {
			low,
			mid,
			high,
			currency: input.currency,
			rationale: `Mock-Empfehlung für ${input.country} basierend auf ${years} Jahren Erfahrung. Setze ANTHROPIC_API_KEY oder OLLAMA_URL für echte Markt-Daten.`,
		};
	}

	async translateTexts(input: {
		texts: string[];
		from: "de" | "en";
		to: "de" | "en";
		context?: string;
	}): Promise<string[]> {
		// Mock: prefixiert mit "[de]"/"[en]" — sichtbar als Hinweis dass
		// Mock läuft, aber Reihenfolge bleibt.
		if (input.from === input.to) return input.texts;
		return input.texts.map((t) => (t ? `[${input.to}] ${t}` : t));
	}
}
