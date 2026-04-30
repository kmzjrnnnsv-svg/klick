import Anthropic from "@anthropic-ai/sdk";
import type {
	AIProvider,
	CandidateNarrative,
	CandidateNarrativeInput,
	ExtractedDocument,
	ExtractedProfile,
	MatchRationaleInput,
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
				},
				required: ["institution", "degree"],
			},
		},
		summary: {
			type: "string",
			maxLength: 500,
			description: "Short professional summary, written in same language as CV",
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
					name: { type: "string" },
					issuer: { type: "string" },
					year: { type: "string", description: "YYYY" },
				},
				required: ["name"],
			},
			description:
				"Certifications cited in the CV body (the candidate may or may not have uploaded the file).",
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
								"Be conservative on identity / private fields: omit rather than guess.\n" +
								"Write summary in the same language the CV uses.\n" +
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
		return toolUse.input as ExtractedProfile;
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
						`- Berufsjahre (aktiv): ${input.yearsActive}\n` +
						`- Längste durchgehende Phase: ${input.yearsContinuous} Jahre\n` +
						`- Anzahl Stationen: ${input.totalRoles}\n` +
						(input.currentRole
							? `- Aktuelle Rolle: ${input.currentRole.role} bei ${input.currentRole.company} seit ${Math.round(
									input.currentRole.monthsOngoing / 12,
								)} Jahre\n`
							: "") +
						(input.firstJobYear
							? `- Erster Job: ${input.firstJobYear}\n`
							: "") +
						`- Lücken im Werdegang: ${input.gaps}\n` +
						`- Top-Skills: ${input.skills.slice(0, 8).join(", ") || "—"}\n` +
						`- Zertifikate gesamt: ${input.certificateCount} (Muster: ${input.certificatePattern})\n\n` +
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
}
