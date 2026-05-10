import Anthropic from "@anthropic-ai/sdk";
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

const PROFILE_TOOL_SCHEMA = {
	type: "object" as const,
	properties: {
		displayName: { type: "string", description: "Full name as on the CV" },
		headline: {
			type: "string",
			description: "Current or most recent job title",
		},
		location: { type: "string", description: "City, country" },
		yearsExperience: {
			type: "integer",
			minimum: 0,
			description: "Total years of professional work experience",
		},
		languages: {
			type: "array",
			items: {
				type: "string",
				pattern: "^[a-z]{2}:(native|c2|c1|b2|b1|a2|a1)$",
			},
			description: "Format like 'de:native' or 'en:c1'",
		},
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
					start: { type: "string", description: "YYYY-MM" },
					end: { type: "string", description: "YYYY-MM or 'present'" },
					description: { type: "string" },
					employmentType: {
						type: "string",
						enum: [
							"employee",
							"self_employed",
							"freelance",
							"founder",
							"internship",
							"other",
						],
						description:
							"Working relationship for this row. Use 'founder' ONLY for entrepreneurial roles where the candidate built or co-founded the company (Gründer:in, Co-Founder, CEO own startup). 'self_employed' for sole proprietor / Inhaber:in / Geschäftsführer:in own established business that wasn't a fresh founding. 'freelance' for freelance / contractor work without permanent role. 'employee' for permanent employment. 'internship' for Praktikum / Werkstudent. 'other' otherwise. Skip if unclear.",
					},
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
					degree: {
						type: "string",
						description:
							"Studien-/Ausbildungs-Bezeichnung OHNE Status-Zusätze. NICHT '(ohne Abschluss)' oder ähnliches in den Titel schreiben — dafür `completed=false` setzen.",
					},
					start: { type: "string" },
					end: { type: "string" },
					completed: {
						type: "boolean",
						description:
							"true wenn der/die Bewerber:in den Abschluss erlangt hat. false wenn der CV 'abgebrochen', 'ohne Abschluss', 'kein Abschluss', 'nicht abgeschlossen', 'discontinued' o.Ä. nennt. Im Zweifel true. Niemals raten.",
					},
				},
				required: ["institution", "degree"],
			},
		},
		summary: {
			type: "string",
			maxLength: 500,
			description:
				"Kurzprofil in 2-4 Sätzen, geschrieben in der Sprache des CVs. IMMER ausfüllen: wenn der CV keinen Profiltext enthält, formuliere selbst aus Titel + Top-Skills + Erfahrung einen sachlichen Mini-Pitch. Niemals leer lassen.",
		},
		industries: {
			type: "array",
			items: { type: "string", maxLength: 60 },
			description:
				"Industries / domains the candidate worked in. 1-5 short labels in the CV's language (e.g. ['Fintech', 'Healthcare', 'E-Commerce']).",
		},
		awards: {
			type: "array",
			items: { type: "string", maxLength: 200 },
			description:
				"Awards, prizes, publications, talks, hackathon wins. One line each. Only if explicit in the CV.",
		},
		certificationsMentioned: {
			type: "array",
			items: {
				type: "object",
				properties: {
					name: {
						type: "string",
						description:
							"OFFIZIELLE Bezeichnung wie der Anbieter sie nennt. Beispiele: 'ISO/IEC 27001:2022 Lead Implementer' (PECB), 'Microsoft Certified: Azure Administrator Associate' statt 'Microsoft Azure Administrator (AZ-104)', 'ITIL® 4 Foundation' statt 'ITIL V4'. Wenn die offizielle Bezeichnung NICHT eindeutig erkennbar ist, übernimm den Wortlaut aus dem CV unverändert — nicht raten.",
					},
					issuer: {
						type: "string",
						description:
							"Offizieller Aussteller/Anbieter falls erkennbar (ISACA, PECB, Microsoft, AXELOS, ISC2, BSI, …). Leer lassen wenn nicht klar zuordenbar.",
					},
					year: { type: "string", description: "YYYY" },
					status: {
						type: "string",
						enum: ["obtained", "in_preparation", "course_completed", "unknown"],
						description:
							"obtained = Prüfung bestanden / Zertifikat ausgestellt; in_preparation = Bewerber bereitet sich vor; course_completed = Lehrgang absolviert aber Prüfung nicht (oder noch nicht) abgelegt; unknown = nicht ableitbar.",
					},
					verbatim: {
						type: "string",
						description:
							"Wortlaut wie er im CV steht — wird NUR gespeichert wenn der offizielle Name vom CV-Wortlaut abweicht. Hilft bei Zweifeln nachzuvollziehen woher die Normalisierung kam.",
					},
				},
				required: ["name"],
			},
			description:
				"Certifications cited in the CV body (the candidate may or may not have uploaded the file). Normalisiere auf den offiziellen Anbieter-Wortlaut, falls erkennbar; sonst CV-Original behalten.",
		},
		mobility: {
			type: "string",
			maxLength: 80,
			description:
				"Working-style preference if explicitly stated: 'remote', 'hybrid Berlin', 'open to relocation'. Don't infer.",
		},
		preferredRoleLevel: {
			type: "string",
			enum: ["junior", "mid", "senior", "lead", "principal", "exec"],
			description:
				"Inferred career level based on titles + years. Skip if unclear.",
		},
	},
};

const SUPPORTED_IMAGE_MIME = new Set([
	"image/jpeg",
	"image/png",
	"image/gif",
	"image/webp",
]);

export class ClaudeAIProvider implements AIProvider {
	readonly slug = "claude";
	private client: Anthropic;

	constructor() {
		this.client = new Anthropic(); // reads ANTHROPIC_API_KEY from env
	}

	async parseCv(bytes: Uint8Array, mime: string): Promise<ExtractedProfile> {
		const isImage = SUPPORTED_IMAGE_MIME.has(mime);
		const isPdf = mime === "application/pdf";
		if (!isImage && !isPdf) {
			throw new Error(`Unsupported MIME type for CV parse: ${mime}`);
		}

		const base64 = Buffer.from(bytes).toString("base64");
		const documentBlock = isImage
			? {
					type: "image" as const,
					source: {
						type: "base64" as const,
						media_type: mime as
							| "image/jpeg"
							| "image/png"
							| "image/gif"
							| "image/webp",
						data: base64,
					},
				}
			: {
					type: "document" as const,
					source: {
						type: "base64" as const,
						media_type: "application/pdf" as const,
						data: base64,
					},
				};

		const result = await this.client.messages.create({
			model: "claude-sonnet-4-6",
			max_tokens: 4096,
			tools: [
				{
					name: "save_profile",
					description: "Save the structured profile extracted from the CV.",
					input_schema: PROFILE_TOOL_SCHEMA,
				},
			],
			tool_choice: { type: "tool", name: "save_profile" },
			messages: [
				{
					role: "user",
					content: [
						documentBlock,
						{
							type: "text" as const,
							text:
								"Extract the structured profile from this CV.\n\n" +
								"Be thorough: comb through the document for every relevant field, including:\n" +
								"- skills (with self-rated levels if mentioned)\n" +
								"- every employment row with start/end dates\n" +
								"- every education entry\n" +
								"- industries / domains worked in (e.g. Fintech, Healthcare)\n" +
								"- awards, prizes, talks, publications, certifications cited in the body\n" +
								"- mobility preferences if explicitly stated (remote / hybrid X / relocation)\n" +
								"- inferred role level (junior … exec) based on titles + years\n\n" +
								"Zertifikats-Regel:\n" +
								"  Verwende für `certificationsMentioned.name` die OFFIZIELLE Bezeichnung wie der Anbieter sie nennt, falls erkennbar. Beispiele:\n" +
								"  - 'ISO 27001 Lead Implementer' → 'ISO/IEC 27001 Lead Implementer' + issuer 'PECB' (oder TÜV Rheinland je nach Kontext)\n" +
								"  - 'Microsoft Azure Administrator (AZ-104)' → 'Microsoft Certified: Azure Administrator Associate' + issuer 'Microsoft'\n" +
								"  - 'ITIL V4' → 'ITIL® 4 Foundation' (oder höhere Stufe wenn im CV) + issuer 'AXELOS / PeopleCert'\n" +
								"  - 'CISM' → 'Certified Information Security Manager (CISM)' + issuer 'ISACA'\n" +
								"  Wenn die offizielle Bezeichnung NICHT eindeutig zuordenbar ist (generische oder firmen-interne Lehrgänge), übernimm den Wortlaut aus dem CV UNVERÄNDERT und setze status='unknown'. Niemals raten.\n" +
								"  Setze `status`: obtained / in_preparation / course_completed / unknown — basiert auf Worten wie 'absolviert', 'bestanden', 'in Vorbereitung', 'Lehrgang' im CV.\n" +
								"  Setze `verbatim` mit dem Original-Wortlaut nur wenn `name` davon abweicht.\n\n" +
								"Bei `education` schreibe NIEMALS Status-Zusätze wie '(ohne Abschluss)' in den `degree`-Titel. Wenn das Studium abgebrochen wurde, setze `completed=false`. Sonst `completed=true` (oder weglassen).\n\n" +
								"Be conservative on identity / private fields: omit rather than guess.\n" +
								"`summary` IMMER befüllen — 2-4 Sätze, Sprache des CVs. Falls der CV keinen Profil-Text enthält, formuliere selbst aus Headline + Top-Skills + jüngster Erfahrung einen sachlichen Mini-Pitch.\n" +
								"Call save_profile.",
						},
					],
				},
			],
		});

		const toolUse = result.content.find((b) => b.type === "tool_use");
		if (!toolUse || toolUse.type !== "tool_use") {
			throw new Error("Claude did not return a tool_use block");
		}
		return applyExtractionPostprocessing(toolUse.input as ExtractedProfile);
	}

	async extractDocument(
		bytes: Uint8Array,
		mime: string,
		hint: "cv" | "certificate" | "badge" | "id_doc" | "other",
	): Promise<ExtractedDocument> {
		const isImage = SUPPORTED_IMAGE_MIME.has(mime);
		const isPdf = mime === "application/pdf";
		if (!isImage && !isPdf) {
			// Non-visual files (json, plain text, etc.) — let the heuristic stand;
			// we'd need a different prompt path to handle these.
			return { kind: hint, data: {} } as ExtractedDocument;
		}

		// CV path is fully implemented elsewhere — reuse it for the rich shape.
		if (hint === "cv") {
			const data = await this.parseCv(bytes, mime);
			return { kind: "cv", data };
		}

		const base64 = Buffer.from(bytes).toString("base64");
		const documentBlock = isImage
			? {
					type: "image" as const,
					source: {
						type: "base64" as const,
						media_type: mime as
							| "image/jpeg"
							| "image/png"
							| "image/gif"
							| "image/webp",
						data: base64,
					},
				}
			: {
					type: "document" as const,
					source: {
						type: "base64" as const,
						media_type: "application/pdf" as const,
						data: base64,
					},
				};

		const schemaByHint: Record<string, Record<string, unknown>> = {
			certificate: {
				type: "object",
				properties: {
					title: { type: "string" },
					issuer: { type: "string" },
					subject: { type: "string" },
					grade: { type: "string" },
					issuedAt: { type: "string", description: "YYYY-MM(-DD)" },
					expiresAt: { type: "string" },
					credentialId: { type: "string" },
				},
			},
			id_doc: {
				type: "object",
				properties: {
					docType: {
						type: "string",
						enum: ["passport", "id_card", "drivers_license", "other"],
					},
					fullName: { type: "string" },
					expiresAt: { type: "string" },
				},
			},
			badge: {
				type: "object",
				properties: {
					name: { type: "string" },
					issuerName: { type: "string" },
					issuedAt: { type: "string" },
					criteriaUrl: { type: "string" },
					imageUrl: { type: "string" },
				},
			},
			other: {
				type: "object",
				properties: {
					title: { type: "string" },
					summary: { type: "string", maxLength: 300 },
				},
			},
		};

		const promptByHint: Record<string, string> = {
			certificate:
				"Extrahiere die Eckdaten dieses Zertifikats / Zeugnisses. Nur was klar im Dokument steht. Keine Vermutungen.",
			id_doc:
				"Erkenne nur den Dokumenttyp (Pass / Ausweis / Führerschein) und ggf. das Ablaufdatum. KEINE biometrischen oder MRZ-Daten ausgeben.",
			badge:
				"Extrahiere Name, Aussteller und Ausstellungsdatum dieses Open Badges. Falls Bild- oder Kriterien-URL erkennbar, mit angeben.",
			other:
				"Erkenne grob, was das für ein Dokument ist. Liefere Titel + 1-2 Sätze Zusammenfassung.",
		};

		const result = await this.client.messages.create({
			model: "claude-sonnet-4-6",
			max_tokens: 1024,
			tools: [
				{
					name: "save_metadata",
					description:
						"Save the structured metadata extracted from the document.",
					input_schema: schemaByHint[hint] as never,
				},
			],
			tool_choice: { type: "tool", name: "save_metadata" },
			messages: [
				{
					role: "user",
					content: [
						documentBlock,
						{ type: "text" as const, text: promptByHint[hint] },
					],
				},
			],
		});

		const toolUse = result.content.find((b) => b.type === "tool_use");
		const data =
			toolUse && toolUse.type === "tool_use"
				? (toolUse.input as Record<string, unknown>)
				: {};
		return { kind: hint, data } as ExtractedDocument;
	}

	async suggestJobRequirements(input: {
		title: string;
		description: string;
	}): Promise<SuggestedJobRequirement[]> {
		const result = await this.client.messages.create({
			model: "claude-sonnet-4-6",
			max_tokens: 1024,
			tools: [
				{
					name: "save_requirements",
					description:
						"Save the suggested job requirements as a structured list.",
					input_schema: {
						type: "object" as const,
						properties: {
							requirements: {
								type: "array",
								items: {
									type: "object",
									properties: {
										name: { type: "string" },
										weight: { type: "string", enum: ["must", "nice"] },
										minLevel: {
											type: "integer",
											minimum: 1,
											maximum: 5,
										},
									},
									required: ["name", "weight"],
								},
							},
						},
						required: ["requirements"],
					},
				},
			],
			tool_choice: { type: "tool", name: "save_requirements" },
			messages: [
				{
					role: "user",
					content:
						`Extract concrete, testable skill requirements from this job posting. ` +
						`Mark up to 4 as "must" (truly essential), the rest as "nice". ` +
						`Use 1-5 levels for must-haves where seniority is implied.\n\n` +
						`Title: ${input.title}\n\n${input.description}`,
				},
			],
		});

		const toolUse = result.content.find((b) => b.type === "tool_use");
		if (!toolUse || toolUse.type !== "tool_use") {
			throw new Error("Claude did not return a tool_use block");
		}
		const out = toolUse.input as { requirements: SuggestedJobRequirement[] };
		return out.requirements ?? [];
	}

	async summarizeCandidate(
		input: CandidateNarrativeInput,
	): Promise<CandidateNarrative> {
		const result = await this.client.messages.create({
			model: "claude-sonnet-4-6",
			max_tokens: 600,
			tools: [
				{
					name: "save_narrative",
					description:
						"Save the holistic candidate narrative read by the employer.",
					input_schema: {
						type: "object" as const,
						properties: {
							summary: {
								type: "string",
								maxLength: 280,
								description:
									"Two short sentences in German. Style: confident, factual, no fluff. Reference the strongest signal (current role, longest tenure, top skill).",
							},
							workStyle: {
								type: "array",
								maxItems: 5,
								items: { type: "string", maxLength: 30 },
								description:
									"3-5 short tags in German lowercase, e.g. 'verlässlich', 'eigenverantwortlich', 'cross-funktional', 'detailorientiert'. No fluff.",
							},
							strengths: {
								type: "array",
								maxItems: 4,
								items: { type: "string", maxLength: 60 },
								description:
									"2-4 short concrete phrases (e.g. '7 Jahre TypeScript', 'mehrere Zertifikate in Cloud', 'lange Tenure bei Acme').",
							},
						},
						required: ["summary", "workStyle", "strengths"],
					},
				},
			],
			tool_choice: { type: "tool", name: "save_narrative" },
			messages: [
				{
					role: "user",
					content:
						`Erstelle eine Kandidaten-Zusammenfassung für eine:n Arbeitgeber:in. Datenbasis (alles berechnet, keine Selbstbeschreibung):\n\n` +
						`- Aktueller Titel: ${input.headline ?? "—"}\n` +
						`- Selbst-Summary: ${input.summary?.slice(0, 400) ?? "—"}\n` +
						`- GESAMT-Berufsjahre (inkl. aktueller Rolle, Stand ${input.asOf}): ${input.yearsActive}\n` +
						`- Davon vor der aktuellen Rolle: ${input.previousYearsBeforeCurrent} Jahre\n` +
						`- Längste durchgehende Phase: ${input.yearsContinuous} Jahre\n` +
						`- Anzahl Stationen: ${input.totalRoles}\n` +
						(input.currentRole
							? `- Aktuelle Rolle: ${input.currentRole.role} bei ${input.currentRole.company} seit ${Math.round(
									input.currentRole.monthsOngoing / 12,
								)} Jahren (Teil der GESAMT-Jahre)\n`
							: "") +
						(input.firstJobYear
							? `- Erster Job: ${input.firstJobYear}\n`
							: "") +
						`- Lücken im Werdegang: ${input.gaps}\n` +
						`- Top-Skills: ${input.skills.slice(0, 8).join(", ") || "—"}\n` +
						`- Zertifikate gesamt: ${input.certificateCount} (Muster: ${input.certificatePattern})\n\n` +
						`WICHTIG zur Jahres-Semantik:\n` +
						`  Die "GESAMT-Berufsjahre" enthalten die aktuelle Rolle bereits.\n` +
						`  Wenn du sie erwähnst, schreibe "insgesamt X Jahre", NIEMALS "zuvor X Jahre".\n` +
						`  Nur die "${input.previousYearsBeforeCurrent} Jahre vor der aktuellen Rolle" dürfen als "davor"/"zuvor" formuliert werden.\n` +
						`  Beispiel richtig: "Seit 3 Jahren als ISO bei VDMA, davor 7 Jahre weitere IT-Erfahrung — insgesamt 10 Jahre."\n` +
						`  Beispiel FALSCH: "Seit 3 Jahren als ISO, zuvor 10 Jahre IT-Erfahrung." (das würde 13 implizieren)\n\n` +
						`Schreibe sachlich, ohne Floskeln. Keine "Teamplayer"-Phrasen ohne Beleg. Wenn Daten dünn sind, sag das. ` +
						`Vermeide Wertungen wie "exzellent". Speichere via save_narrative.`,
				},
			],
		});

		const toolUse = result.content.find((b) => b.type === "tool_use");
		if (!toolUse || toolUse.type !== "tool_use") {
			// Graceful fallback: return a minimal, honest narrative.
			return {
				summary: "Profil-Zusammenfassung gerade nicht verfügbar.",
				workStyle: [],
				strengths: [],
			};
		}
		return toolUse.input as CandidateNarrative;
	}

	async extractJobPosting(
		bytes: Uint8Array,
		mime: string,
	): Promise<ExtractedJobPosting> {
		const isImage = SUPPORTED_IMAGE_MIME.has(mime);
		const isPdf = mime === "application/pdf";
		if (!isImage && !isPdf) {
			throw new Error(`Unsupported MIME for job posting: ${mime}`);
		}
		const base64 = Buffer.from(bytes).toString("base64");
		const documentBlock = isImage
			? {
					type: "image" as const,
					source: {
						type: "base64" as const,
						media_type: mime as
							| "image/jpeg"
							| "image/png"
							| "image/gif"
							| "image/webp",
						data: base64,
					},
				}
			: {
					type: "document" as const,
					source: {
						type: "base64" as const,
						media_type: "application/pdf" as const,
						data: base64,
					},
				};

		const result = await this.client.messages.create({
			model: "claude-sonnet-4-6",
			max_tokens: 4096,
			tools: [
				{
					name: "save_job",
					description:
						"Save the structured job posting extracted from the document.",
					input_schema: {
						type: "object" as const,
						properties: {
							title: { type: "string", maxLength: 200 },
							description: {
								type: "string",
								maxLength: 6000,
								description:
									"Full role description in the document's language. Keep formatting if helpful (bullets ok). Strip company-confidential parts.",
							},
							location: { type: "string", maxLength: 120 },
							remotePolicy: {
								type: "string",
								enum: ["onsite", "hybrid", "remote"],
							},
							employmentType: {
								type: "string",
								enum: ["fulltime", "parttime", "contract", "internship"],
							},
							salaryMin: {
								type: "integer",
								description:
									"Annual € minimum if stated. Convert ranges. Skip if not in document.",
							},
							salaryMax: { type: "integer" },
							yearsExperienceMin: {
								type: "integer",
								minimum: 0,
								maximum: 40,
							},
							languages: {
								type: "array",
								items: { type: "string", maxLength: 40 },
							},
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
						required: ["title", "description"],
					},
				},
			],
			tool_choice: { type: "tool", name: "save_job" },
			messages: [
				{
					role: "user",
					content: [
						documentBlock,
						{
							type: "text" as const,
							text:
								"Extract this job posting into structured fields.\n\n" +
								"- title + description always required\n" +
								"- For requirements, mark hard skills explicit in the doc as 'must', " +
								"nice-to-haves as 'nice'. Up to ~8 entries — be concrete (frameworks, " +
								"languages, tools), not buzzwords.\n" +
								"- salary fields only when an explicit € amount is stated\n" +
								"- skip fields that aren't clearly in the document",
						},
					],
				},
			],
		});

		const toolUse = result.content.find((b) => b.type === "tool_use");
		if (!toolUse || toolUse.type !== "tool_use") {
			throw new Error("Claude did not return a tool_use block for job posting");
		}
		return toolUse.input as ExtractedJobPosting;
	}

	async benchmarkSalary(input: SalaryBenchmarkInput): Promise<SalaryBenchmark> {
		const result = await this.client.messages.create({
			model: "claude-sonnet-4-6",
			max_tokens: 600,
			tools: [
				{
					name: "save_benchmark",
					description: "Save the estimated annual salary range in EUR.",
					input_schema: {
						type: "object" as const,
						properties: {
							low: {
								type: "integer",
								minimum: 20000,
								description: "Lower bound, EUR/yr gross.",
							},
							high: {
								type: "integer",
								description: "Upper bound, EUR/yr gross.",
							},
							rationale: {
								type: "string",
								maxLength: 200,
								description:
									"Eine deutsche Sentence: warum dieser Bereich plausibel ist. Hinweis auf Unsicherheit, falls Daten dünn.",
							},
						},
						required: ["low", "high", "rationale"],
					},
				},
			],
			tool_choice: { type: "tool", name: "save_benchmark" },
			messages: [
				{
					role: "user",
					content:
						"Schätze den marktüblichen Brutto-Jahresgehalt-Bereich in EUR für folgende Stelle. " +
						"Berücksichtige Region, Erfahrungsstufe, Stack, Remote-Anteil. Gib einen 25.-/75.-Percentil-Range, keinen Median.\n\n" +
						`Titel: ${input.title}\n` +
						`Beschreibung-Auszug: ${input.description.slice(0, 500)}\n` +
						`Standort: ${input.location ?? "—"}\n` +
						`Modus: ${input.remote}\n` +
						`Mindest-Erfahrung: ${input.yearsRequired} Jahre\n` +
						`Level: ${input.level ?? "—"}\n` +
						`Skills: ${input.requirements.join(", ") || "—"}\n\n` +
						"Schreib die rationale auf Deutsch, sachlich, max 1 Satz. Speichere via save_benchmark.",
				},
			],
		});

		const toolUse = result.content.find((b) => b.type === "tool_use");
		if (!toolUse || toolUse.type !== "tool_use") {
			return {
				low: 0,
				high: 0,
				currency: "EUR",
				rationale: "Schätzung gerade nicht verfügbar.",
			};
		}
		const out = toolUse.input as {
			low: number;
			high: number;
			rationale: string;
		};
		return { ...out, currency: "EUR" };
	}

	async assessMatch(input: MatchAssessmentInput): Promise<MatchAssessment> {
		const result = await this.client.messages.create({
			model: "claude-sonnet-4-6",
			max_tokens: 600,
			tools: [
				{
					name: "save_assessment",
					description: "Save the pro/con assessment of this match.",
					input_schema: {
						type: "object" as const,
						properties: {
							pros: {
								type: "array",
								maxItems: 4,
								items: { type: "string", maxLength: 140 },
								description:
									"2-4 konkrete Pro-Punkte auf Deutsch. Belege mit Skills, Jahren, Erfahrung. Keine Floskeln.",
							},
							cons: {
								type: "array",
								maxItems: 4,
								items: { type: "string", maxLength: 140 },
								description:
									"2-4 ehrliche Bedenken oder Lücken. Wenn nichts wirklich fehlt: 'Keine offensichtlichen Schwächen.'",
							},
							experienceVerdict: {
								type: "string",
								maxLength: 80,
								description:
									"Ein Satz: Erfahrungs-Vergleich. Z. B. '9 J. — 3 mehr als gefordert' oder '4 J. — 2 unter Anforderung'.",
							},
						},
						required: ["pros", "cons", "experienceVerdict"],
					},
				},
			],
			tool_choice: { type: "tool", name: "save_assessment" },
			messages: [
				{
					role: "user",
					content:
						"Bewerte diesen Match aus Arbeitgeber-Sicht. Pro/Con + 1-Satz-Erfahrungsverdict.\n\n" +
						`Stelle: ${input.jobTitle}\n` +
						`Stelle-Beschreibung: ${input.jobDescription.slice(0, 400)}\n` +
						`Mindest-Erfahrung: ${input.yearsRequired} Jahre\n` +
						`Kandidat: ${input.candidateHeadline ?? "—"}\n` +
						`Kandidat-Summary: ${input.candidateSummary ?? "—"}\n` +
						`Kandidat-Erfahrung: ${input.candidateYears ?? 0} Jahre\n` +
						`Match-Skills: ${input.matchedSkills.join(", ") || "—"}\n` +
						`Adjacent (Quereinstieg): ${input.adjacentSkills.join(", ") || "—"}\n` +
						`Fehlt: ${input.missingSkills.join(", ") || "—"}\n\n` +
						"Sei direkt. Floskeln raus. Speichere via save_assessment.",
				},
			],
		});
		const toolUse = result.content.find((b) => b.type === "tool_use");
		if (!toolUse || toolUse.type !== "tool_use") {
			return {
				pros: [],
				cons: [],
				experienceVerdict: `${input.candidateYears ?? 0} J.`,
			};
		}
		return toolUse.input as MatchAssessment;
	}

	async matchRationale(input: MatchRationaleInput): Promise<string> {
		const prompt =
			`Du erklärst in einem Satz (max 30 Wörter), warum dieser Kandidat zu dieser Stelle passt.\n\n` +
			`Stelle: ${input.jobTitle}\n` +
			`Beschreibung-Auszug: ${input.jobDescription.slice(0, 500)}\n` +
			`Kandidat: ${input.candidateHeadline ?? "—"}\n` +
			`Profil: ${input.candidateSummary ?? "—"}\n` +
			`Skills die matchen: ${input.matchedSkills.join(", ") || "—"}\n` +
			`Skills die fehlen: ${input.missingSkills.join(", ") || "—"}\n` +
			`Erfahrung: ${input.yearsExperience ?? "?"} Jahre (gefordert: ${input.yearsRequired ?? 0}).\n\n` +
			`Schreib einen Satz auf Deutsch, sachlich, konkret. Keine Floskeln.`;

		const result = await this.client.messages.create({
			model: "claude-sonnet-4-6",
			max_tokens: 200,
			messages: [{ role: "user", content: prompt }],
		});
		const text = result.content
			.filter((b) => b.type === "text")
			.map((b) => (b.type === "text" ? b.text : ""))
			.join(" ")
			.trim();
		return text || "Profil und Stelle passen inhaltlich.";
	}

	async gradeOpenAnswer(input: {
		question: string;
		rubric: string | null;
		answer: string;
		maxPoints: number;
	}): Promise<{ pointsEarned: number; feedback: string }> {
		const sys = `Du bewertest die Antwort einer Person auf eine Bewerbungs-Assessment-Frage. Vergib ganzzahlige Punkte (0-${input.maxPoints}) gemäß der Rubrik. Antworte streng als JSON: {"points": <int>, "feedback": "<1-2 Sätze konstruktiv auf Deutsch>"}.`;
		const user = [
			`Frage: ${input.question}`,
			`Rubrik: ${input.rubric ?? "(keine — bewerte fachliche Substanz, Klarheit, konkrete Beispiele)"}`,
			`Antwort der Bewerbenden: ${input.answer}`,
			`Maximalpunkte: ${input.maxPoints}`,
		].join("\n");
		try {
			const result = await this.client.messages.create({
				model: "claude-sonnet-4-6",
				max_tokens: 300,
				system: sys,
				messages: [{ role: "user", content: user }],
			});
			const text = result.content
				.flatMap((b) => (b.type === "text" ? [b.text] : []))
				.join("")
				.trim();
			const m = text.match(/\{[\s\S]*\}/);
			if (m) {
				const parsed = JSON.parse(m[0]) as {
					points?: number;
					feedback?: string;
				};
				const pts = Math.max(
					0,
					Math.min(input.maxPoints, Math.round(parsed.points ?? 0)),
				);
				return {
					pointsEarned: pts,
					feedback: parsed.feedback ?? "Bewertet.",
				};
			}
		} catch (e) {
			console.error("[ai] gradeOpenAnswer failed", e);
		}
		return { pointsEarned: 0, feedback: "Konnte nicht bewertet werden." };
	}

	async suggestAssessmentQuestions(input: {
		title: string;
		description: string;
		requirements: { name: string; weight: "must" | "nice" }[];
	}) {
		const sys = `Du formulierst 5 kurze Assessment-Fragen für eine Stellenausschreibung. Mix: 3 Multiple-Choice (mit genau einer richtigen Antwort + 2-3 Distraktoren) und 2 offene Fragen (mit kurzer Bewertungs-Rubrik). Antworte streng als JSON-Array, kein Markdown, kein Prosa.

Schema pro Eintrag:
- {"kind":"mc","body":"...","choices":[{"text":"...","weight":N},...],"correctChoice":<int>,"maxPoints":<1-3>}
- {"kind":"open","body":"...","rubric":"...","maxPoints":<3-5>}`;
		const user = [
			`Stellentitel: ${input.title}`,
			`Beschreibung: ${input.description}`,
			`Anforderungen: ${input.requirements.map((r) => `${r.name} (${r.weight})`).join(", ")}`,
		].join("\n");
		try {
			const result = await this.client.messages.create({
				model: "claude-sonnet-4-6",
				max_tokens: 2000,
				system: sys,
				messages: [{ role: "user", content: user }],
			});
			const text = result.content
				.flatMap((b) => (b.type === "text" ? [b.text] : []))
				.join("")
				.trim();
			const m = text.match(/\[[\s\S]*\]/);
			if (m) {
				return JSON.parse(m[0]);
			}
		} catch (e) {
			console.error("[ai] suggestAssessmentQuestions failed", e);
		}
		return [];
	}

	async analyzeCareerProspects(input: {
		profile: ExtractedProfile;
		yearsActive?: number;
	}): Promise<CareerAnalysis> {
		const sys = `Du bist erfahrener Career Coach mit DACH-Marktwissen 2026. Lies das Profil und gib eine umfassende Karriere-Analyse als JSON zurück. Sei konkret, nicht generisch — keine Buzzwords, klare Begründungen.

Schema:
{
	"headline": "1 Absatz, ~80 Wörter",
	"strengths": ["3-5 stärken"],
	"growthAreas": ["3-5 entwicklungsfelder"],
	"salary": {"low": int, "mid": int, "high": int, "currency": "EUR", "rationale": "..."},
	"primaryIndustries": ["..."],
	"adjacentIndustries": [{"name": "...", "rationale": "..."}],
	"certificationSuggestions": [{"name": "...", "issuer": "...", "why": "...", "effortHours": int}],
	"roleSuggestions": [{"title": "...", "rationale": "...", "obvious": bool}],
	"hiringPros": ["..."],
	"hiringCons": ["..."],
	"marketContext": {"demand": "high"|"medium"|"low", "notes": "..."}
}`;
		const user = JSON.stringify({
			profile: input.profile,
			yearsActive: input.yearsActive,
		});
		try {
			const result = await this.client.messages.create({
				model: "claude-sonnet-4-6",
				max_tokens: 2000,
				system: sys,
				messages: [{ role: "user", content: user }],
			});
			const text = result.content
				.flatMap((b) => (b.type === "text" ? [b.text] : []))
				.join("")
				.trim();
			const m = text.match(/\{[\s\S]*\}/);
			if (m) return JSON.parse(m[0]) as CareerAnalysis;
		} catch (e) {
			console.error("[ai] analyzeCareerProspects failed", e);
		}
		throw new Error("analyzeCareerProspects: empty result");
	}

	async assessJobPostingQuality(input: {
		title: string;
		description: string;
		requirements: { name: string; weight: "must" | "nice" }[];
		salaryMin: number | null;
		salaryMax: number | null;
		remotePolicy: string;
	}): Promise<JobPostingQuality> {
		const sys = `Du bewertest Stellenanzeigen aus Bewerber-Sicht. Gib JSON zurück: {"score":<0-100>,"completeness":<0-100>,"clarity":<0-100>,"redFlags":["..."],"suggestions":["..."]}. Konkret, nicht generisch.`;
		try {
			const result = await this.client.messages.create({
				model: "claude-sonnet-4-6",
				max_tokens: 1200,
				system: sys,
				messages: [{ role: "user", content: JSON.stringify(input) }],
			});
			const text = result.content
				.flatMap((b) => (b.type === "text" ? [b.text] : []))
				.join("")
				.trim();
			const m = text.match(/\{[\s\S]*\}/);
			if (m) return JSON.parse(m[0]) as JobPostingQuality;
		} catch (e) {
			console.error("[ai] assessJobPostingQuality failed", e);
		}
		return {
			score: 50,
			completeness: 50,
			clarity: 50,
			redFlags: [],
			suggestions: [],
		};
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
		try {
			const result = await this.client.messages.create({
				model: "claude-sonnet-4-6",
				max_tokens: 4096,
				tools: [
					{
						name: "save_translation",
						description: `Save the translated profile in ${targetLang}.`,
						input_schema: {
							type: "object" as const,
							properties: {
								headline: { type: "string" },
								summary: { type: "string" },
								industries: {
									type: "array",
									items: { type: "string" },
								},
								skills: {
									type: "array",
									items: {
										type: "object",
										properties: {
											name: { type: "string" },
											level: { type: "number" },
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
						},
					},
				],
				tool_choice: { type: "tool", name: "save_translation" },
				messages: [
					{
						role: "user",
						content:
							`Übersetze das folgende Kandidat:innen-Profil ins ${targetLang}.\n\n` +
							`Regeln:\n` +
							`- Eigennamen, Firmennamen, Personennamen, Standorte UNVERÄNDERT lassen.\n` +
							`- Feststehende Bezeichnungen (ISO 27001, AWS, NIST CSF, AZ-104, ITIL, …) UNVERÄNDERT lassen.\n` +
							`- Berufsbezeichnungen sinnvoll übersetzen (z.B. "Vertriebsleiter" ↔ "Sales Manager"), aber etablierte Anglizismen behalten ("Information Security Officer", "Product Owner").\n` +
							`- Beschreibungstexte natürlich übersetzen — nicht wörtlich, aber faktentreu.\n` +
							`- Skill-Levels nicht verändern.\n\n` +
							`Quelle:\n${JSON.stringify(input, null, 2)}`,
					},
				],
			});
			const toolUse = result.content.find((b) => b.type === "tool_use");
			if (toolUse?.type === "tool_use") {
				return toolUse.input as ProfileTranslationOutput;
			}
		} catch (e) {
			console.warn("[ai] translateProfile failed", e);
		}
		// Fallback: 1:1 zurückgeben, lieber nichts übersetzen als falsch.
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
