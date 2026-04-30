import { ClaudeAIProvider } from "./claude";
import { MockAIProvider } from "./mock";
import type { AIProvider } from "./types";

export type { AIProvider, ExtractedProfile } from "./types";

let cached: AIProvider | null = null;

/**
 * Returns the active AI provider. Uses Claude when ANTHROPIC_API_KEY is set,
 * otherwise falls back to a deterministic mock for offline dev.
 */
export function getAIProvider(): AIProvider {
	if (cached) return cached;
	cached = process.env.ANTHROPIC_API_KEY
		? new ClaudeAIProvider()
		: new MockAIProvider();
	return cached;
}
