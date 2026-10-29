import type { AiProvider } from "@/db/schema/enums";
import type {
	AiHttpError,
	AiHttpRequest,
	AiHttpResponse,
	AiTransport,
} from "./http";

// Anfrage und Antwort je KI-Anbieter (ADR-032) — Aufbau und Auslesen rein,
// Senden über den Transport (lib/ai/http.ts). Nur Text rein, nur Text raus;
// Dateien (PDF, Bild) nur bei Anthropic, Gemini und OpenAI. Die KI bekommt
// keine Werkzeuge. Der Schlüssel steht nur in einer Kopfzeile.

export type AiMessage = { role: "user" | "assistant"; content: string };
export type AiFile = {
	name: string;
	mime: "application/pdf" | "image/png" | "image/jpeg";
	base64: string;
};
export type AiCall = {
	system: string;
	messages: AiMessage[];
	files?: AiFile[];
	maxTokens: number;
};
export type AiConfig = {
	provider: AiProvider;
	model: string;
	// Azure: Ressourcen-Host; OpenAI-kompatibel: Basis-URL (…/v1)
	endpoint: string | null;
	deployment: string | null;
	key: string;
};

export type AiCallError =
	| AiHttpError
	| "auth"
	| "rate_limited"
	| "bad_request"
	| "provider_error"
	| "empty"
	| "invalid_response"
	| "config";

export type AiResult =
	| {
			ok: true;
			text: string;
			usage: { input: number | null; output: number | null };
	  }
	| { ok: false; error: AiCallError; status?: number };

export const AZURE_API_VERSION = "2024-10-21";

// Modell- und Bereitstellungsnamen landen im Pfad: nur harmlose Zeichen
const NAME = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/;

const dataUrl = (f: AiFile) => `data:${f.mime};base64,${f.base64}`;

function lastUser(call: AiCall): number {
	for (let i = call.messages.length - 1; i >= 0; i--)
		if (call.messages[i]?.role === "user") return i;
	return -1;
}

// Chat-Completions-Format (OpenAI, Azure, Mistral, kompatibel)
function chatMessages(call: AiCall, withFiles: boolean) {
	const at = lastUser(call);
	return [
		{ role: "system", content: call.system },
		...call.messages.map((m, i) =>
			withFiles && i === at && call.files?.length
				? {
						role: m.role,
						content: [
							...call.files.map((f) =>
								f.mime === "application/pdf"
									? {
											type: "file",
											file: { filename: f.name, file_data: dataUrl(f) },
										}
									: { type: "image_url", image_url: { url: dataUrl(f) } },
							),
							{ type: "text", text: m.content },
						],
					}
				: { role: m.role, content: m.content },
		),
	];
}

export function buildRequest(
	cfg: AiConfig,
	call: AiCall,
): AiHttpRequest | null {
	if (!NAME.test(cfg.model) && cfg.provider !== "azure_openai") return null;
	switch (cfg.provider) {
		case "anthropic": {
			const at = lastUser(call);
			return {
				url: "https://api.anthropic.com/v1/messages",
				headers: {
					"x-api-key": cfg.key,
					"anthropic-version": "2023-06-01",
				},
				body: {
					model: cfg.model,
					max_tokens: call.maxTokens,
					system: call.system,
					messages: call.messages.map((m, i) => ({
						role: m.role,
						content: [
							...(i === at
								? (call.files ?? []).map((f) => ({
										type: f.mime === "application/pdf" ? "document" : "image",
										source: {
											type: "base64",
											media_type: f.mime,
											data: f.base64,
										},
									}))
								: []),
							{ type: "text", text: m.content },
						],
					})),
				},
			};
		}
		case "gemini": {
			const at = lastUser(call);
			return {
				url: `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(cfg.model)}:generateContent`,
				headers: { "x-goog-api-key": cfg.key },
				body: {
					systemInstruction: { parts: [{ text: call.system }] },
					contents: call.messages.map((m, i) => ({
						role: m.role === "assistant" ? "model" : "user",
						parts: [
							...(i === at
								? (call.files ?? []).map((f) => ({
										inline_data: { mime_type: f.mime, data: f.base64 },
									}))
								: []),
							{ text: m.content },
						],
					})),
					generationConfig: { maxOutputTokens: call.maxTokens },
				},
			};
		}
		case "openai":
			return {
				url: "https://api.openai.com/v1/chat/completions",
				headers: { authorization: `Bearer ${cfg.key}` },
				body: {
					model: cfg.model,
					max_completion_tokens: call.maxTokens,
					messages: chatMessages(call, true),
				},
			};
		case "azure_openai": {
			if (!cfg.endpoint || !cfg.deployment || !NAME.test(cfg.deployment))
				return null;
			const host = cfg.endpoint.replace(/^https:\/\//, "").replace(/\/.*$/, "");
			return {
				url: `https://${host}/openai/deployments/${encodeURIComponent(cfg.deployment)}/chat/completions?api-version=${AZURE_API_VERSION}`,
				headers: { "api-key": cfg.key },
				body: {
					max_tokens: call.maxTokens,
					messages: chatMessages(call, false),
				},
			};
		}
		case "mistral":
			return {
				url: "https://api.mistral.ai/v1/chat/completions",
				headers: { authorization: `Bearer ${cfg.key}` },
				body: {
					model: cfg.model,
					max_tokens: call.maxTokens,
					messages: chatMessages(call, false),
				},
			};
		case "openai_compatible": {
			if (!cfg.endpoint) return null;
			const base = cfg.endpoint.replace(/\/+$/, "");
			return {
				url: `${base}/chat/completions`,
				headers: { authorization: `Bearer ${cfg.key}` },
				body: {
					model: cfg.model,
					max_tokens: call.maxTokens,
					messages: chatMessages(call, false),
				},
			};
		}
	}
}

const num = (v: unknown): number | null =>
	typeof v === "number" && Number.isFinite(v) ? v : null;

function statusError(status: number): AiCallError | null {
	if (status >= 200 && status < 300) return null;
	if (status === 401 || status === 403) return "auth";
	if (status === 429) return "rate_limited";
	if (status >= 400 && status < 500) return "bad_request";
	return "provider_error";
}

export function parseResponse(
	provider: AiProvider,
	res: AiHttpResponse,
): AiResult {
	const err = statusError(res.status);
	if (err) return { ok: false, error: err, status: res.status };
	let body: Record<string, unknown>;
	try {
		body = JSON.parse(res.body) as Record<string, unknown>;
	} catch {
		return { ok: false, error: "invalid_response" };
	}
	let text = "";
	let usage = { input: null as number | null, output: null as number | null };
	if (provider === "anthropic") {
		const content = Array.isArray(body.content) ? body.content : [];
		text = content
			.filter(
				(c): c is { type: string; text: string } =>
					typeof c === "object" &&
					c !== null &&
					(c as { type?: unknown }).type === "text" &&
					typeof (c as { text?: unknown }).text === "string",
			)
			.map((c) => c.text)
			.join("");
		const u = (body.usage ?? {}) as Record<string, unknown>;
		usage = { input: num(u.input_tokens), output: num(u.output_tokens) };
	} else if (provider === "gemini") {
		const cand = Array.isArray(body.candidates) ? body.candidates[0] : null;
		const parts = (cand as { content?: { parts?: unknown } } | null)?.content
			?.parts;
		text = (Array.isArray(parts) ? parts : [])
			.map((p) =>
				typeof (p as { text?: unknown }).text === "string"
					? (p as { text: string }).text
					: "",
			)
			.join("");
		const u = (body.usageMetadata ?? {}) as Record<string, unknown>;
		usage = {
			input: num(u.promptTokenCount),
			output: num(u.candidatesTokenCount),
		};
	} else {
		const choice = Array.isArray(body.choices) ? body.choices[0] : null;
		const content = (choice as { message?: { content?: unknown } } | null)
			?.message?.content;
		text =
			typeof content === "string"
				? content
				: Array.isArray(content)
					? content
							.map((p) =>
								typeof (p as { text?: unknown }).text === "string"
									? (p as { text: string }).text
									: "",
							)
							.join("")
					: "";
		const u = (body.usage ?? {}) as Record<string, unknown>;
		usage = { input: num(u.prompt_tokens), output: num(u.completion_tokens) };
	}
	text = text.trim();
	if (!text) return { ok: false, error: "empty" };
	return { ok: true, text, usage };
}

export async function complete(
	cfg: AiConfig,
	call: AiCall,
	transport: AiTransport,
): Promise<AiResult> {
	const req = buildRequest(cfg, call);
	if (!req) return { ok: false, error: "config" };
	const r = await transport(cfg.provider, req);
	if (!r.ok) return { ok: false, error: r.error };
	return parseResponse(cfg.provider, r.res);
}
