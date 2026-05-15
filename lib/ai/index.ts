import { ClaudeAIProvider } from "./claude";
import { MockAIProvider } from "./mock";
import { OllamaAIProvider } from "./ollama";
import type { AIProvider } from "./types";

export type { AIProvider, ExtractedProfile } from "./types";

// AIProvider-Optionen.
//
// `background: true` zwingt den Mock-Provider — egal welche Env gesetzt
// ist. Konvention: jeder Hintergrund-Pfad, der NICHT vom User explizit
// ausgelöst wurde (after()-Hooks, automatische Vault-Extraktion, Match-
// Compute, Score-Refresh, Salary-Benchmark beim Save, Auto-Grading von
// Assessments etc.) muss `{ background: true }` durchreichen, damit
// keine Claude-Calls im Hintergrund laufen. User-getriggerte Auswertungen
// (Karriere-Analyse-Button, CV-Import-Button, AI-Skill-Vorschlag,
// Salary-Empfehlung-Button, refreshMyInsights-Button etc.) lassen das
// Flag weg und nutzen den echten Provider.
export type AIProviderOptions = { background?: boolean };

let cachedMock: AIProvider | null = null;
function getMock(): AIProvider {
	if (cachedMock) return cachedMock;
	cachedMock = new MockAIProvider();
	console.info("[ai] using provider: mock (background path)");
	return cachedMock;
}

let cached: AIProvider | null = null;

/**
 * Returns the active AI provider. Resolution order:
 *   1. opts.background = true                → mock (always)
 *   2. AI_PROVIDER explicitly set            → exact provider
 *   3. ANTHROPIC_API_KEY set                 → claude
 *   4. fallback                              → mock
 *
 * NOTE: Ollama wird NICHT mehr automatisch ausgewählt, auch wenn
 * OLLAMA_URL gesetzt ist. Um Ollama zu nutzen, muss AI_PROVIDER=ollama
 * EXPLIZIT in der Env stehen. So verhindern wir, dass ein vergessener
 * Env-Eintrag Klick weiterhin zum (nicht mehr existierenden) Ollama-
 * Server routet.
 */
export function getAIProvider(opts?: AIProviderOptions): AIProvider {
	if (opts?.background) return getMock();
	if (cached) return cached;
	const explicit = process.env.AI_PROVIDER?.toLowerCase();
	if (explicit === "mock") {
		cached = new MockAIProvider();
	} else if (explicit === "ollama") {
		cached = new OllamaAIProvider();
	} else if (explicit === "claude" || explicit === "anthropic") {
		cached = new ClaudeAIProvider();
	} else if (process.env.ANTHROPIC_API_KEY) {
		cached = new ClaudeAIProvider();
	} else {
		cached = new MockAIProvider();
	}
	console.info(`[ai] using provider: ${cached.slug}`);
	return cached;
}

let cachedCareer: AIProvider | null = null;

/**
 * Provider speziell für die Karriere-Analyse.
 *
 * Override via AI_PROVIDER_CAREER=claude|ollama|mock möglich.
 * Default: derselbe Provider wie getAIProvider() (also Claude, sofern
 * ANTHROPIC_API_KEY gesetzt ist). Ollama wird NICHT mehr automatisch
 * gewählt, nur via AI_PROVIDER_CAREER=ollama.
 *
 * `background: true` erzwingt — wie bei getAIProvider — den Mock.
 */
export function getCareerAIProvider(opts?: AIProviderOptions): AIProvider {
	if (opts?.background) return getMock();
	if (cachedCareer) return cachedCareer;
	const explicit = process.env.AI_PROVIDER_CAREER?.toLowerCase();
	if (explicit === "mock") {
		cachedCareer = new MockAIProvider();
	} else if (explicit === "claude" || explicit === "anthropic") {
		cachedCareer = new ClaudeAIProvider();
	} else if (explicit === "ollama") {
		cachedCareer = new OllamaAIProvider();
	} else {
		cachedCareer = getAIProvider();
	}
	console.info(`[ai] career-analysis provider: ${cachedCareer.slug}`);
	return cachedCareer;
}
