import Anthropic from "@anthropic-ai/sdk";
import type {
	AIProvider,
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
								"Extract the structured profile from this CV. " +
								"Call save_profile with only fields clearly present in the document. " +
								"Be conservative: omit a field rather than guess. " +
								"Write summary in the same language the CV uses.",
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
