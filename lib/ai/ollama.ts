import { applyExtractionPostprocessing } from "./normalize";
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

// ─── Ollama-Provider ──────────────────────────────────────────────────────
// Self-hosted Open-Source-LLMs als drop-in-Ersatz für Claude. Identisches
// AIProvider-Interface — die App merkt nichts davon. Wird gewählt sobald
// AI_PROVIDER=ollama oder OLLAMA_URL gesetzt sind.
//
// Empfehlung für Modell-Wahl (Stand Mai 2026):
//   - qwen2.5:32b-instruct          → Text-Tasks, sehr gut bei JSON/Tools
//   - llama3.3:70b                  → mehr Power, braucht 48 GB+ VRAM
//   - llama3.2-vision:11b           → multimodal, für CV-Parse aus Bildern
//
// PDFs werden vorher zu Text gerippt (extractPdfText), Vision-Modelle
// nutzen wir nur für Bilder. So bleibt der Pfad einfach und schnell.

type OllamaChatRequest = {
	model: string;
	messages: { role: "system" | "user" | "assistant"; content: string }[];
	stream: false;
	format?: object | "json";
	options?: { temperature?: number; num_ctx?: number };
};

type OllamaChatResponse = {
	model: string;
	message: { role: string; content: string };
	done: boolean;
};

export class OllamaAIProvider implements AIProvider {
	readonly slug = "ollama";

	private host: string;
	private model: string;
	private visionModel: string;
	private timeoutMs: number;

	constructor() {
		this.host = (process.env.OLLAMA_URL ?? "http://localhost:11434").replace(
			/\/$/,
			"",
		);
		this.model = process.env.OLLAMA_MODEL ?? "qwen2.5:32b-instruct";
		this.visionModel = process.env.OLLAMA_MODEL_VISION ?? "llama3.2-vision:11b";
		this.timeoutMs = Number(process.env.OLLAMA_TIMEOUT_MS ?? "120000");
	}

	// ─── Low-level Chat-Wrapper mit JSON-Schema ───────────────────────────
	private async chat<T>(
		systemPrompt: string,
		userPrompt: string,
		jsonSchema?: object,
	): Promise<T> {
		const body: OllamaChatRequest = {
			model: this.model,
			messages: [
				{ role: "system", content: systemPrompt },
				{ role: "user", content: userPrompt },
			],
			stream: false,
			options: { temperature: 0.2, num_ctx: 8192 },
		};
		if (jsonSchema) {
			body.format = jsonSchema;
		}

		const ctrl = new AbortController();
		const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);
		try {
			const res = await fetch(`${this.host}/api/chat`, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify(body),
				signal: ctrl.signal,
			});
			if (!res.ok) {
				throw new Error(`ollama ${res.status}: ${await res.text()}`);
			}
			const data = (await res.json()) as OllamaChatResponse;
			const content = data.message?.content ?? "";
			if (jsonSchema) {
				try {
					return JSON.parse(content) as T;
				} catch (e) {
					throw new Error(
						`ollama json parse failed: ${content.slice(0, 200)} (${(e as Error).message})`,
					);
				}
			}
			return content as unknown as T;
		} finally {
			clearTimeout(timer);
		}
	}

	// Multimodal-Variante für Bilder (CV-Scans). Modell muss vision-fähig sein.
	private async chatVision<T>(
		systemPrompt: string,
		userPrompt: string,
		imageBase64: string,
		jsonSchema?: object,
	): Promise<T> {
		const body = {
			model: this.visionModel,
			messages: [
				{ role: "system", content: systemPrompt },
				{ role: "user", content: userPrompt, images: [imageBase64] },
			],
			stream: false,
			format: jsonSchema,
			options: { temperature: 0.2 },
		};
		const ctrl = new AbortController();
		const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);
		try {
			const res = await fetch(`${this.host}/api/chat`, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify(body),
				signal: ctrl.signal,
			});
			if (!res.ok) {
				throw new Error(`ollama vision ${res.status}: ${await res.text()}`);
			}
			const data = (await res.json()) as OllamaChatResponse;
			const content = data.message?.content ?? "";
			if (jsonSchema) {
				return JSON.parse(content) as T;
			}
			return content as unknown as T;
		} finally {
			clearTimeout(timer);
		}
	}

	// ─── parseCv ──────────────────────────────────────────────────────────
	async parseCv(bytes: Uint8Array, mime: string): Promise<ExtractedProfile> {
		const isImage = [
			"image/jpeg",
			"image/png",
			"image/gif",
			"image/webp",
		].includes(mime);
		const isPdf = mime === "application/pdf";
		if (!isImage && !isPdf) {
			throw new Error(`Unsupported MIME type for CV parse: ${mime}`);
		}

		const schema = {
			type: "object",
			properties: {
				displayName: { type: "string" },
				headline: { type: "string" },
				location: { type: "string" },
				yearsExperience: { type: "integer" },
				languages: { type: "array", items: { type: "string" } },
				skills: {
					type: "array",
					items: {
						type: "object",
						properties: {
							name: { type: "string" },
							level: { type: "integer", minimum: 1, maximum: 5 },
						},
						required: ["name"],
					},
				},
				experience: {
					type: "array",
					items: {
						type: "object",
						properties: {
							company: { type: "string" },
							role: { type: "string" },
							start: { type: "string" },
							end: { type: "string" },
							description: { type: "string" },
						},
						required: ["company", "role", "start"],
					},
				},
				education: {
					type: "array",
					items: {
						type: "object",
						properties: {
							institution: { type: "string" },
							degree: { type: "string" },
							start: { type: "string" },
							end: { type: "string" },
							completed: { type: "boolean" },
							degreeType: {
								type: "string",
								enum: [
									"school",
									"apprenticeship",
									"bachelor",
									"master",
									"phd",
									"mba",
									"other",
								],
							},
							grade: { type: "string" },
							thesisTitle: { type: "string" },
							focus: { type: "string" },
						},
						required: ["institution", "degree"],
					},
				},
				publications: {
					type: "array",
					items: {
						type: "object",
						properties: {
							title: { type: "string" },
							year: { type: "string" },
							kind: {
								type: "string",
								enum: ["article", "talk", "patent", "book", "other"],
							},
							venue: { type: "string" },
							url: { type: "string" },
						},
						required: ["title"],
					},
				},
				projects: {
					type: "array",
					items: {
						type: "object",
						properties: {
							name: { type: "string" },
							role: { type: "string" },
							url: { type: "string" },
							description: { type: "string" },
						},
						required: ["name"],
					},
				},
				volunteering: {
					type: "array",
					items: {
						type: "object",
						properties: {
							organization: { type: "string" },
							role: { type: "string" },
							start: { type: "string" },
							end: { type: "string" },
							description: { type: "string" },
						},
						required: ["organization", "role"],
					},
				},
				drivingLicenses: { type: "array", items: { type: "string" } },
				availability: {
					type: "object",
					properties: {
						status: {
							type: "string",
							enum: ["immediate", "notice", "date", "unknown"],
						},
						noticeWeeks: { type: "integer" },
						availableFrom: { type: "string" },
					},
				},
				socialLinks: {
					type: "object",
					properties: {
						github: { type: "string" },
						linkedin: { type: "string" },
						xing: { type: "string" },
						website: { type: "string" },
					},
				},
				workPermitStatus: {
					type: "string",
					enum: ["eu", "permit", "requires_sponsorship", "unknown"],
				},
				summary: {
					type: "string",
					description:
						"Kurzprofil in 2-4 Sätzen. IMMER ausfüllen — wenn der CV keinen Profil-Text enthält, selbst formulieren aus Titel + Top-Skills + jüngster Erfahrung.",
				},
				industries: { type: "array", items: { type: "string" } },
				certificationsMentioned: {
					type: "array",
					items: {
						type: "object",
						properties: {
							name: { type: "string" },
							issuer: { type: "string" },
							year: { type: "string" },
							status: {
								type: "string",
								enum: [
									"obtained",
									"in_preparation",
									"course_completed",
									"unknown",
								],
							},
							verbatim: { type: "string" },
						},
						required: ["name"],
					},
				},
			},
		};

		const systemPrompt =
			"Du extrahierst strukturierte Profile aus Lebensläufen. Halte dich strikt an das JSON-Schema. " +
			"Bei Zertifikaten verwende offizielle Anbieter-Bezeichnungen (z.B. 'Microsoft Certified: Azure Administrator Associate' statt 'AZ-104'); wenn nicht zuordenbar, nimm den CV-Wortlaut + verbatim-Feld. " +
			"Bei `education`: KEINE Status-Zusätze in den `degree`-Titel schreiben — wenn das Studium abgebrochen wurde, setze `completed=false`. Klassifiziere `degreeType` (school/apprenticeship/bachelor/master/phd/mba/other). Übernimm `grade` (Endnote im Originalformat) und `thesisTitle` (Bachelor-/Master-/Doktorarbeits-Titel) wenn genannt. `focus` für Vertiefungsrichtung. " +
			"Falls der CV es nennt: `publications`, `projects`, `volunteering`, `drivingLicenses`, `availability`, `socialLinks`, `workPermitStatus` ausfüllen. Niemals raten. " +
			"`summary` IMMER ausfüllen (2-4 Sätze). Wenn der CV keinen Profil-Text enthält, selbst aus Headline + Top-Skills + jüngster Rolle formulieren.";

		if (isImage) {
			const base64 = Buffer.from(bytes).toString("base64");
			const raw = await this.chatVision<ExtractedProfile>(
				systemPrompt,
				"Extrahiere das Profil aus diesem Lebenslauf-Bild.",
				base64,
				schema,
			);
			return applyExtractionPostprocessing(raw);
		}

		// PDF → Text. pdf-parse ist erst eine Runtime-Dep wenn der Provider
		// aktiv ist; dynamischer Import vermeidet Build-Failures wenn das
		// Paket fehlt.
		const pdfText = await extractPdfText(bytes);
		const raw = await this.chat<ExtractedProfile>(
			systemPrompt,
			`Lebenslauf-Volltext:\n\n${pdfText}\n\nExtrahiere das Profil.`,
			schema,
		);
		return applyExtractionPostprocessing(raw);
	}

	async extractDocument(
		bytes: Uint8Array,
		mime: string,
		hint: "cv" | "certificate" | "badge" | "id_doc" | "other",
	): Promise<ExtractedDocument> {
		if (hint === "cv") {
			try {
				const data = await this.parseCv(bytes, mime);
				return { kind: "cv", data };
			} catch {
				return { kind: "other", data: { sizeBytes: bytes.length } };
			}
		}
		// Andere Typen: Mock-ähnlicher Stub. Echte Implementierung kann nach
		// Bedarf nachgezogen werden — die meisten Apps brauchen das nicht.
		return { kind: "other", data: { sizeBytes: bytes.length } };
	}

	// ─── suggestJobRequirements ──────────────────────────────────────────
	async suggestJobRequirements(input: {
		title: string;
		description: string;
		locale?: "de" | "en";
	}): Promise<SuggestedJobRequirement[]> {
		const targetLang = input.locale === "en" ? "Englisch" : "Deutsch";
		const schema = {
			type: "object",
			properties: {
				requirements: {
					type: "array",
					items: {
						type: "object",
						properties: {
							name: { type: "string" },
							weight: { type: "string", enum: ["must", "nice"] },
							minLevel: { type: "integer", minimum: 1, maximum: 5 },
						},
						required: ["name", "weight"],
					},
				},
			},
		};
		const out = await this.chat<{ requirements: SuggestedJobRequirement[] }>(
			`Du schlägst Skill-Anforderungen für Stellen vor. ALLE Skill-Namen müssen in ${targetLang} sein. Verwende reale, im ${targetLang}-Sprachgebrauch belegte Begriffe; keine erfundenen Komposita. Etablierte Fachbegriffe (TypeScript, AWS, ISO 27001) sprach-neutral lassen.`,
			`Titel: ${input.title}\n\nBeschreibung:\n${input.description}\n\nGib bis zu 8 Skills auf ${targetLang} zurück.`,
			schema,
		);
		return out.requirements ?? [];
	}

	async extractJobPosting(
		bytes: Uint8Array,
		mime: string,
	): Promise<ExtractedJobPosting> {
		// Wir delegieren an parseCv-ähnliche Logik mit einem Job-Schema.
		const isImage = [
			"image/jpeg",
			"image/png",
			"image/gif",
			"image/webp",
		].includes(mime);
		const text = isImage
			? "(Bild — vision-Pfad nicht implementiert für Stellen-Postings)"
			: await extractPdfText(bytes);
		const schema = {
			type: "object",
			properties: {
				title: { type: "string" },
				description: { type: "string" },
				location: { type: "string" },
				remotePolicy: {
					type: "string",
					enum: ["onsite", "hybrid", "remote"],
				},
				employmentType: {
					type: "string",
					enum: ["fulltime", "parttime", "contract", "internship"],
				},
				salaryMin: { type: "integer" },
				salaryMax: { type: "integer" },
				yearsExperienceMin: { type: "integer" },
				languages: { type: "array", items: { type: "string" } },
			},
		};
		return await this.chat<ExtractedJobPosting>(
			"Extrahiere die strukturierten Felder aus dieser Stellenausschreibung.",
			text,
			schema,
		);
	}

	// ─── matchRationale + summarize + … ───────────────────────────────────
	async matchRationale(input: MatchRationaleInput): Promise<string> {
		return await this.chat<string>(
			"Du erklärst in 2 sachlichen Sätzen warum ein/e Bewerber:in zu einer Stelle passt. Keine Floskeln, keine Wertungen wie 'exzellent'.",
			`Stelle: ${input.jobTitle}\n${input.jobDescription.slice(0, 800)}\n\n` +
				`Bewerber:in: ${input.candidateHeadline ?? "—"}\n` +
				`Erfahrung: ${input.yearsExperience ?? "?"} Jahre (gefordert: ${input.yearsRequired ?? "?"})\n` +
				`Skills passt: ${input.matchedSkills.join(", ")}\n` +
				`Skills fehlt: ${input.missingSkills.join(", ")}`,
		);
	}

	async summarizeCandidate(
		input: CandidateNarrativeInput,
	): Promise<CandidateNarrative> {
		const schema = {
			type: "object",
			properties: {
				summary: { type: "string", maxLength: 280 },
				workStyle: { type: "array", items: { type: "string" }, maxItems: 5 },
				strengths: { type: "array", items: { type: "string" }, maxItems: 4 },
			},
			required: ["summary", "workStyle", "strengths"],
		};
		return await this.chat<CandidateNarrative>(
			"Du schreibst sachliche Kandidaten-Zusammenfassungen für Arbeitgeber. Keine Floskeln. Bei Jahres-Angaben: 'insgesamt X Jahre' nicht 'zuvor X Jahre' — die GESAMT-Berufsjahre enthalten die aktuelle Rolle bereits.",
			`Headline: ${input.headline ?? "—"}\n` +
				`GESAMT-Jahre (inkl. aktueller Rolle, Stand ${input.asOf}): ${input.yearsActive}\n` +
				`Davor (vor aktueller Rolle): ${input.previousYearsBeforeCurrent} Jahre\n` +
				`Aktuell: ${input.currentRole?.role ?? "—"} bei ${input.currentRole?.company ?? "—"}\n` +
				`Skills: ${input.skills.join(", ")}\n` +
				`Stationen: ${input.totalRoles}, Lücken: ${input.gaps}`,
			schema,
		);
	}

	async benchmarkSalary(input: SalaryBenchmarkInput): Promise<SalaryBenchmark> {
		const schema = {
			type: "object",
			properties: {
				low: { type: "integer" },
				high: { type: "integer" },
				currency: { type: "string", enum: ["EUR"] },
				rationale: { type: "string", maxLength: 200 },
			},
			required: ["low", "high", "currency", "rationale"],
		};
		return await this.chat<SalaryBenchmark>(
			"Du schätzt marktübliche Gehaltsbänder für Stellen in Deutschland. Annahme: Bruttojahresgehalt in EUR.",
			`Titel: ${input.title}\n` +
				`Standort: ${input.location ?? "DE"}\n` +
				`Geforderte Jahre: ${input.yearsRequired}\n` +
				`Skills: ${input.requirements.join(", ")}\n` +
				`Remote: ${input.remote}`,
			schema,
		);
	}

	async assessMatch(input: MatchAssessmentInput): Promise<MatchAssessment> {
		const schema = {
			type: "object",
			properties: {
				pros: { type: "array", items: { type: "string" }, maxItems: 4 },
				cons: { type: "array", items: { type: "string" }, maxItems: 4 },
				experienceVerdict: { type: "string", maxLength: 80 },
			},
			required: ["pros", "cons", "experienceVerdict"],
		};
		return await this.chat<MatchAssessment>(
			"Du erstellst Pro/Contra-Listen für Match-Bewertungen. 2-4 Punkte je Seite. Sachlich.",
			`Stelle: ${input.jobTitle}\n` +
				`Bewerber:in: ${input.candidateHeadline ?? "—"}, ${input.candidateYears ?? "?"} Jahre (${input.yearsRequired} gefordert)\n` +
				`Skills passt: ${input.matchedSkills.join(", ")}\n` +
				`Skills fehlt: ${input.missingSkills.join(", ")}\n` +
				`Adjacent: ${input.adjacentSkills.join(", ")}`,
			schema,
		);
	}

	async gradeOpenAnswer(input: {
		question: string;
		rubric: string | null;
		answer: string;
		maxPoints: number;
	}): Promise<{ pointsEarned: number; feedback: string }> {
		const schema = {
			type: "object",
			properties: {
				pointsEarned: {
					type: "integer",
					minimum: 0,
					maximum: input.maxPoints,
				},
				feedback: { type: "string", maxLength: 400 },
			},
			required: ["pointsEarned", "feedback"],
		};
		return await this.chat<{ pointsEarned: number; feedback: string }>(
			"Du bewertest offene Antworten gegen eine Rubric. Fair, knapp, evidenz-basiert.",
			`Frage: ${input.question}\nRubric: ${input.rubric ?? "—"}\n\nAntwort: ${input.answer}`,
			schema,
		);
	}

	async suggestAssessmentQuestions(input: {
		title: string;
		description: string;
		requirements: { name: string; weight: "must" | "nice" }[];
	}) {
		const schema = {
			type: "object",
			properties: {
				questions: {
					type: "array",
					maxItems: 5,
					items: {
						type: "object",
						properties: {
							kind: { type: "string", enum: ["mc", "open"] },
							body: { type: "string" },
							choices: {
								type: "array",
								items: {
									type: "object",
									properties: {
										text: { type: "string" },
										weight: { type: "integer" },
									},
									required: ["text", "weight"],
								},
							},
							correctChoice: { type: "integer" },
							rubric: { type: "string" },
							maxPoints: { type: "integer" },
						},
						required: ["kind", "body", "maxPoints"],
					},
				},
			},
			required: ["questions"],
		};
		const out = await this.chat<{
			questions: Array<
				| {
						kind: "mc";
						body: string;
						choices: { text: string; weight: number }[];
						correctChoice: number;
						maxPoints: number;
				  }
				| { kind: "open"; body: string; rubric: string; maxPoints: number }
			>;
		}>(
			"Du erzeugst Mini-Assessment-Fragen für eine Stelle. Mix aus 3 MC + 2 offenen.",
			`Titel: ${input.title}\nMUSS-Skills: ${input.requirements
				.filter((r) => r.weight === "must")
				.map((r) => r.name)
				.join(", ")}\n\n${input.description}`,
			schema,
		);
		return out.questions ?? [];
	}

	async analyzeCareerProspects(input: {
		profile: ExtractedProfile;
		yearsActive?: number;
		insights?: unknown;
		locale?: "de" | "en";
	}): Promise<CareerAnalysis> {
		const locale: "de" | "en" = input.locale ?? "de";
		const languageName = locale === "en" ? "English" : "German";
		const schema = {
			type: "object",
			properties: {
				headline: { type: "string", maxLength: 400 },
				strengths: {
					type: "array",
					minItems: 3,
					maxItems: 5,
					items: { type: "string", maxLength: 140 },
				},
				growthAreas: {
					type: "array",
					minItems: 3,
					maxItems: 5,
					items: { type: "string", maxLength: 140 },
				},
				salary: {
					type: "object",
					properties: {
						low: { type: "integer" },
						mid: { type: "integer" },
						high: { type: "integer" },
						currency: { type: "string" },
						rationale: { type: "string", maxLength: 300 },
					},
					required: ["low", "mid", "high", "currency", "rationale"],
				},
				primaryIndustries: {
					type: "array",
					minItems: 2,
					maxItems: 5,
					items: { type: "string", maxLength: 40 },
				},
				adjacentIndustries: {
					type: "array",
					minItems: 2,
					maxItems: 4,
					items: {
						type: "object",
						properties: {
							name: { type: "string", maxLength: 40 },
							rationale: { type: "string", maxLength: 180 },
						},
						required: ["name", "rationale"],
					},
				},
				certificationSuggestions: {
					type: "array",
					minItems: 2,
					maxItems: 4,
					items: {
						type: "object",
						properties: {
							name: { type: "string", maxLength: 80 },
							issuer: { type: "string", maxLength: 40 },
							why: { type: "string", maxLength: 180 },
							effortHours: { type: "integer" },
						},
						required: ["name", "issuer", "why", "effortHours"],
					},
				},
				roleSuggestions: {
					type: "array",
					minItems: 3,
					maxItems: 5,
					items: {
						type: "object",
						properties: {
							title: { type: "string", maxLength: 60 },
							rationale: { type: "string", maxLength: 180 },
							obvious: { type: "boolean" },
						},
						required: ["title", "rationale", "obvious"],
					},
				},
				hiringPros: {
					type: "array",
					minItems: 3,
					maxItems: 4,
					items: { type: "string", maxLength: 140 },
				},
				hiringCons: {
					type: "array",
					minItems: 2,
					maxItems: 4,
					items: { type: "string", maxLength: 140 },
				},
				marketContext: {
					type: "object",
					properties: {
						demand: { type: "string", enum: ["high", "medium", "low"] },
						notes: { type: "string", maxLength: 300 },
					},
					required: ["demand", "notes"],
				},
			},
			required: [
				"headline",
				"strengths",
				"growthAreas",
				"salary",
				"primaryIndustries",
				"adjacentIndustries",
				"certificationSuggestions",
				"roleSuggestions",
				"hiringPros",
				"hiringCons",
				"marketContext",
			],
		};
		const insightsStr = input.insights
			? `\n\nBERECHNETE INSIGHTS:\n${JSON.stringify(input.insights).slice(0, 4000)}`
			: "";
		const out = await this.chat<CareerAnalysis>(
			`You are an experienced career coach with DACH market knowledge as of 2026. ` +
				`MOST IMPORTANT: ALL prose fields MUST be written in ${languageName}. ` +
				`You MUST fill EVERY field — never leave any list empty. ` +
				`If a field looks thin, derive plausible values from the available skills/experience/education. ` +
				`Reply EXCLUSIVELY with valid JSON matching the schema. No filler, no buzzwords. ` +
				`Concrete strengths (years, domain, tool). Salary in EUR for DACH market.`,
			`PROFIL:\n${JSON.stringify(input.profile).slice(0, 5000)}` +
				(input.yearsActive
					? `\nGESAMT-Berufsjahre: ${input.yearsActive}`
					: "") +
				insightsStr +
				`\n\nPflicht: 3-5 strengths, 3-5 growthAreas, 2-5 primaryIndustries, ` +
				`2-4 adjacentIndustries, 2-4 certificationSuggestions, 3-5 roleSuggestions ` +
				`(mix aus obvious=true/false), 3-4 hiringPros, 2-4 hiringCons. ` +
				`marketContext mit demand-Level + notes. salary low/mid/high in EUR + rationale.`,
			schema,
		);
		return { ...out, language: locale };
	}

	async assessJobPostingQuality(input: {
		title: string;
		description: string;
		requirements: { name: string; weight: "must" | "nice" }[];
		salaryMin: number | null;
		salaryMax: number | null;
		remotePolicy: string;
	}): Promise<JobPostingQuality> {
		const schema = {
			type: "object",
			properties: {
				score: { type: "integer", minimum: 0, maximum: 100 },
				completeness: { type: "integer", minimum: 0, maximum: 100 },
				clarity: { type: "integer", minimum: 0, maximum: 100 },
				redFlags: { type: "array", items: { type: "string" } },
				suggestions: { type: "array", items: { type: "string" } },
			},
			required: ["score", "completeness", "clarity", "redFlags", "suggestions"],
		};
		return await this.chat<JobPostingQuality>(
			"Du bewertest die Qualität einer Stellenausschreibung. Konkret, ehrlich, mit klaren Verbesserungs-Hinweisen.",
			JSON.stringify(input),
			schema,
		);
	}

	async translateProfile(
		input: ProfileTranslationInput,
	): Promise<ProfileTranslationOutput> {
		if (input.from === input.to) {
			return {
				headline: input.headline ?? undefined,
				summary: input.summary ?? undefined,
				industries: input.industries ?? undefined,
				skills: input.skills ?? undefined,
				experience: input.experience
					? input.experience.map((e) => ({
							role: e.role,
							description: e.description ?? undefined,
						}))
					: undefined,
				education: input.education ?? undefined,
				awards: input.awards ?? undefined,
				mobility: input.mobility ?? undefined,
			};
		}
		const targetLang = input.to === "de" ? "Deutsch" : "Englisch";
		const schema = {
			type: "object",
			properties: {
				headline: { type: "string" },
				summary: { type: "string" },
				industries: { type: "array", items: { type: "string" } },
				skills: {
					type: "array",
					items: {
						type: "object",
						properties: {
							name: { type: "string" },
							level: { type: "integer" },
						},
						required: ["name"],
					},
				},
				experience: {
					type: "array",
					items: {
						type: "object",
						properties: {
							role: { type: "string" },
							description: { type: "string" },
						},
						required: ["role"],
					},
				},
				education: {
					type: "array",
					items: {
						type: "object",
						properties: { degree: { type: "string" } },
						required: ["degree"],
					},
				},
				awards: { type: "array", items: { type: "string" } },
				mobility: { type: "string" },
			},
		};
		try {
			return await this.chat<ProfileTranslationOutput>(
				`Du übersetzt Profilfelder ins ${targetLang}. Eigennamen, Firmen, Standorte UNVERÄNDERT lassen. Feststehende Bezeichnungen (ISO 27001, AWS, AZ-104, ITIL) UNVERÄNDERT lassen. Skill-Levels nicht verändern.`,
				JSON.stringify(input),
				schema,
			);
		} catch (e) {
			console.warn("[ai] ollama translateProfile failed", e);
			return {
				headline: input.headline ?? undefined,
				summary: input.summary ?? undefined,
				industries: input.industries ?? undefined,
				skills: input.skills ?? undefined,
				experience: input.experience
					? input.experience.map((e) => ({
							role: e.role,
							description: e.description ?? undefined,
						}))
					: undefined,
				education: input.education ?? undefined,
				awards: input.awards ?? undefined,
				mobility: input.mobility ?? undefined,
			};
		}
	}

	async recommendCandidateSalary(input: {
		profile: ExtractedProfile;
		country: string;
		currency: string;
	}): Promise<{
		low: number;
		mid: number;
		high: number;
		currency: string;
		rationale: string;
	}> {
		const schema = {
			type: "object",
			properties: {
				low: { type: "integer", minimum: 0 },
				mid: { type: "integer", minimum: 0 },
				high: { type: "integer", minimum: 0 },
				currency: { type: "string" },
				rationale: { type: "string" },
			},
			required: ["low", "mid", "high", "currency", "rationale"],
		};
		const sys =
			"Du kennst DACH/EU/UK/US Gehaltsmärkte (Stand 2026). Antworte STRIKT als JSON nach Schema. Keine Buzzwords.";
		const user = `Profil: ${JSON.stringify(input.profile)}\nLand: ${input.country}\nWährung: ${input.currency}\nGib das empfohlene Brutto-Jahresband (low/mid/high) + 1-2 Sätze Rationale.`;
		return await this.chat<{
			low: number;
			mid: number;
			high: number;
			currency: string;
			rationale: string;
		}>(sys, user, schema);
	}

	async translateTexts(input: {
		texts: string[];
		from: "de" | "en";
		to: "de" | "en";
		context?: string;
	}): Promise<string[]> {
		if (input.texts.length === 0) return [];
		if (input.from === input.to) return input.texts;
		const targetLang = input.to === "de" ? "Deutsch" : "Englisch";
		const schema = {
			type: "object",
			properties: {
				translations: { type: "array", items: { type: "string" } },
			},
			required: ["translations"],
		};
		try {
			const out = await this.chat<{ translations: string[] }>(
				`Du übersetzt ins ${targetLang}. Eigennamen / Firmen / Standorte / Skill-Bezeichnungen (ISO 27001, AWS, …) UNVERÄNDERT lassen. Reihenfolge = Eingabe-Reihenfolge.`,
				(input.context ? `Kontext: ${input.context}\n\n` : "") +
					`Übersetze:\n${JSON.stringify(input.texts)}`,
				schema,
			);
			if (!Array.isArray(out?.translations)) return input.texts;
			return input.texts.map((orig, i) => {
				const t = out.translations[i];
				return typeof t === "string" && t.length > 0 ? t : orig;
			});
		} catch (e) {
			console.warn("[ollama] translateTexts failed", e);
			return input.texts;
		}
	}
}

// ─── PDF-Text-Extraktion ──────────────────────────────────────────────────
// pdf-parse ist eine optionale Runtime-Dep. Wenn nicht installiert, fallen
// wir auf einen Hinweis im Text zurück.
//
// WICHTIG: Wir importieren `pdf-parse/lib/pdf-parse.js` direkt statt
// `pdf-parse`. Der Top-Level-Index der Lib hat eine if-Klausel die
// versucht eine Test-PDF zu laden wenn kein require.main vorhanden ist —
// das knallt unter Next.js/Turbopack mit "TypeError: d is not a function".
// Der direkte Lib-Pfad umgeht das.
async function extractPdfText(bytes: Uint8Array): Promise<string> {
	try {
		// String-Konkatenation: TypeScript soll das Modul nicht statisch
		// auflösen, damit der Build ohne pdf-parse durchgeht. Die magic
		// comments sagen Webpack + Turbopack zusätzlich, dass sie diesen
		// Aufruf gar nicht erst zu resolven versuchen sollen.
		const modPath = "pdf" + "-parse/lib/pdf-parse.js";
		// biome-ignore lint/suspicious/noExplicitAny: optional runtime dep
		const mod: any = await import(
			/* webpackIgnore: true */ /* turbopackIgnore: true */ modPath
		).catch(() => null);
		if (!mod) {
			return "(pdf-parse nicht installiert — pnpm add pdf-parse)";
		}
		const fn = typeof mod === "function" ? mod : (mod.default ?? mod);
		if (typeof fn !== "function") {
			console.warn(
				"[ollama] pdf-parse export is not a function:",
				Object.keys(mod),
			);
			return "(pdf-parse Modul-Export unerwartet — ggf. Version inkompatibel)";
		}
		const result = await fn(Buffer.from(bytes));
		return (result?.text as string) ?? "";
	} catch (e) {
		console.warn("[ollama] pdf-parse failed", e);
		return "(PDF-Text konnte nicht extrahiert werden)";
	}
}
