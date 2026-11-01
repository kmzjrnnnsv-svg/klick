// Auswahlwerte der KI-Einstellungen ohne zod (Browser: Einstellungen > KI);
// lib/ai/policy.ts re-exportiert und prüft.
import type { AiProvider } from "@/db/schema/enums";

export const AI_FEATURES = [
	// Fassungen von Dokumenten und Nachweisen zusammenfassen
	"compare",
	// Dokument-Entwurf aus einer Vorlage
	"draft",
	// Nachweis gegen die Anforderungen der verknüpften Controls prüfen
	"evidence_check",
	// Fragen an die Hilfe (nur Hilfetexte, keine Firmendaten)
	"help",
] as const;

export type AiFeature = (typeof AI_FEATURES)[number];

// Modelle zur Auswahl (Anthropic); bei den übrigen ist das Modell frei,
// der Verbindungstest prüft es
export const ANTHROPIC_MODELS = [
	"claude-sonnet-5-5",
	"claude-opus-5-5",
	"claude-haiku-5-5",
] as const;

export const DEFAULT_MODEL: Partial<Record<AiProvider, string>> = {
	anthropic: "claude-sonnet-5-5",
};
