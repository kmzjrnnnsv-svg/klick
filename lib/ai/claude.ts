import Anthropic from "@anthropic-ai/sdk";
import type { AIProvider, ExtractedProfile } from "./types";

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
}
