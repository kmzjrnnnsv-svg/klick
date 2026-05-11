import { ClaudeAIProvider } from "./claude";
import { MockAIProvider } from "./mock";
import { OllamaAIProvider } from "./ollama";
import type { AIProvider } from "./types";

export type { AIProvider, ExtractedProfile } from "./types";

let cached: AIProvider | null = null;

/**
 * Returns the active AI provider. Resolution order:
 *   1. AI_PROVIDER explicitly set            → exact provider
 *   2. ANTHROPIC_API_KEY set                 → claude
 *   3. OLLAMA_URL set                        → ollama
 *   4. fallback                              → mock
 *
 * Mock is deterministic + offline. Claude needs ANTHROPIC_API_KEY.
 * Ollama needs a reachable Ollama server (default http://localhost:11434)
 * and a downloaded model (qwen2.5:32b-instruct empfohlen). Siehe
 * docs/ollama-integration.md.
 */
export function getAIProvider(): AIProvider {
	if (cached) return cached;
	const explicit = process.env.AI_PROVIDER?.toLowerCase();
	if (explicit === "mock") {
		cached = new MockAIProvider();
	} else if (explicit === "claude" || explicit === "anthropic") {
		cached = new ClaudeAIProvider();
	} else if (explicit === "ollama") {
		cached = new OllamaAIProvider();
	} else if (process.env.ANTHROPIC_API_KEY) {
		cached = new ClaudeAIProvider();
	} else if (process.env.OLLAMA_URL) {
		cached = new OllamaAIProvider();
	} else {
		cached = new MockAIProvider();
	}
	console.info(`[ai] using provider: ${cached.slug}`);
	return cached;
}

let cachedCareer: AIProvider | null = null;

/**
 * Provider speziell für die Karriere-Analyse. Bevorzugt Ollama, weil
 *   1. der Output-Block groß ist (11 Felder, lange rationales) und
 *      Claude-Tokens schnell teuer werden,
 *   2. die Analyse keine harten Latency-Anforderungen hat — sie läuft
 *      meist via next/after() im Hintergrund,
 *   3. der eigene Ollama-Server keine externen Calls macht (Privatsphäre).
 *
 * Override via AI_PROVIDER_CAREER=claude|ollama|mock möglich.
 * Fallback: derselbe Provider wie getAIProvider().
 */
export function getCareerAIProvider(): AIProvider {
	if (cachedCareer) return cachedCareer;
	const explicit = process.env.AI_PROVIDER_CAREER?.toLowerCase();
	if (explicit === "mock") {
		cachedCareer = new MockAIProvider();
	} else if (explicit === "claude" || explicit === "anthropic") {
		cachedCareer = new ClaudeAIProvider();
	} else if (explicit === "ollama") {
		cachedCareer = new OllamaAIProvider();
	} else if (process.env.OLLAMA_URL) {
		cachedCareer = new OllamaAIProvider();
	} else {
		cachedCareer = getAIProvider();
	}
	console.info(`[ai] career-analysis provider: ${cachedCareer.slug}`);
	return cachedCareer;
}
