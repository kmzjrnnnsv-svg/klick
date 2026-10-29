import { z } from "zod";
import {
	AI_CLASS_LEVELS,
	AI_MODES,
	AI_PROVIDERS,
	type AiClassLevel,
	type AiMode,
	type AiProvider,
	type Classification,
} from "@/db/schema/enums";

export {
	AI_CLASS_LEVELS,
	AI_MODES,
	AI_PROVIDERS,
	type AiClassLevel,
	type AiMode,
	type AiProvider,
};

// KI mit eigenem Schlüssel je Organisation (Teil B, ADR-032) — rein.
//
// Zwei Ebenen:
//  - Klick-Admin (platform_org_accounts): KI für die Org an/aus, Modus
//    („Klick vergleicht, KI erklärt“ = assist, „KI vergleicht auch“ = full,
//    dann auch Dateien) und Obergrenze der Einstufung.
//  - Inhaber:in (org_settings.ai_policy): Anbieter, Modell, Schlüssel,
//    Funktionen und bis zu welcher Einstufung Inhalte an die KI dürfen.
// Wirksam ist immer das Strengere. „Streng geheim“ geht nie an eine KI.

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

// Anbieter, die Dateien (PDF, Bild) selbst lesen; die übrigen nur Text
export const FILE_PROVIDERS: readonly AiProvider[] = [
	"anthropic",
	"gemini",
	"openai",
];

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

const RANK: Record<AiClassLevel, number> = {
	none: 0,
	public: 1,
	internal: 2,
	confidential: 3,
};

const CLASS_RANK: Record<Classification, number> = {
	public: 1,
	internal: 2,
	confidential: 3,
	// nie
	secret: 99,
};

export const aiPolicySchema = z.object({
	enabled: z.boolean().default(false),
	maxClass: z.enum(AI_CLASS_LEVELS).default("none"),
	features: z.array(z.enum(AI_FEATURES)).max(AI_FEATURES.length).default([]),
	provider: z.enum(AI_PROVIDERS).nullable().default(null),
	model: z.string().trim().min(1).max(120).nullable().default(null),
	// Azure: Ressourcen-Host (…openai.azure.com); OpenAI-kompatibel: Basis-URL
	endpoint: z.string().trim().max(300).nullable().default(null),
	// Azure: Name der Bereitstellung
	deployment: z.string().trim().max(120).nullable().default(null),
	// Schlüssel in ai_credentials; wirksam erst mit dieser Regel
	credentialId: z.string().uuid().nullable().default(null),
	// Bestätigung AV-Vertrag und bezahlte API-Stufe (ohne Training)
	dpaConfirmedAt: z.string().nullable().default(null),
	dpaConfirmedBy: z.string().nullable().default(null),
});
export type AiPolicy = z.infer<typeof aiPolicySchema>;

export const AI_POLICY_OFF: AiPolicy = aiPolicySchema.parse({});

// Gespeicherter Wert → Regel; Unlesbares = aus (fail closed)
export function aiPolicyOf(raw: unknown): AiPolicy {
	const r = aiPolicySchema.safeParse(raw ?? {});
	return r.success ? r.data : AI_POLICY_OFF;
}

export type AiAdmin = {
	enabled: boolean;
	mode: AiMode;
	maxClass: AiClassLevel;
};

export const AI_ADMIN_OFF: AiAdmin = {
	enabled: false,
	mode: "assist",
	maxClass: "none",
};

export function aiAdminOf(
	row: {
		aiEnabled?: boolean | null;
		aiMode?: string | null;
		aiMaxClass?: string | null;
	} | null,
): AiAdmin {
	if (!row?.aiEnabled) return AI_ADMIN_OFF;
	const mode = (AI_MODES as readonly string[]).includes(row.aiMode ?? "")
		? (row.aiMode as AiMode)
		: "assist";
	const maxClass = (AI_CLASS_LEVELS as readonly string[]).includes(
		row.aiMaxClass ?? "",
	)
		? (row.aiMaxClass as AiClassLevel)
		: "none";
	return { enabled: true, mode, maxClass };
}

export const minClass = (a: AiClassLevel, b: AiClassLevel): AiClassLevel =>
	RANK[a] <= RANK[b] ? a : b;

// Darf Inhalt dieser Einstufung an die KI? (Obergrenze = Strengeres aus
// Admin und Org)
export function classAllowed(
	c: Classification,
	admin: AiAdmin,
	policy: AiPolicy,
): boolean {
	return CLASS_RANK[c] <= RANK[minClass(admin.maxClass, policy.maxClass)];
}

// Lockert die neue Regel gegenüber der alten? Dann Vier-Augen (Art
// ai_policy). Ausschalten, Funktionen weg, Einstufung senken wirken sofort.
// Neuer Schlüssel zählt als Lockern: er könnte zu einem fremden Konto beim
// Anbieter gehören.
export function aiPolicyRelaxed(before: AiPolicy, after: AiPolicy): string[] {
	if (!after.enabled) return [];
	const out: string[] = [];
	if (!before.enabled) out.push("enabled");
	if (RANK[after.maxClass] > RANK[before.maxClass]) out.push("maxClass");
	if (after.features.some((f) => !before.features.includes(f)))
		out.push("features");
	if (after.provider !== before.provider) out.push("provider");
	if (after.endpoint !== before.endpoint) out.push("endpoint");
	if (after.deployment !== before.deployment) out.push("deployment");
	if (after.credentialId !== before.credentialId) out.push("credential");
	return out;
}

// Hinweis für die Oberfläche: wo eine Einstellung fehlt
export function aiPolicyComplete(p: AiPolicy): boolean {
	if (!p.provider || !p.model || !p.credentialId || !p.dpaConfirmedAt)
		return false;
	if (p.provider === "azure_openai") return Boolean(p.endpoint && p.deployment);
	if (p.provider === "openai_compatible") return Boolean(p.endpoint);
	return true;
}
