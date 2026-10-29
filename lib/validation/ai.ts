import { z } from "zod";
import { AI_PROVIDERS } from "@/db/schema/enums";
import { AI_FEATURES, aiPolicySchema } from "@/lib/ai/policy";

// Einstellungen > KI (ADR-032)

// Schlüssel: ohne Leerzeichen, vernünftige Länge; geprüft wird er beim
// Anbieter (Verbindung testen), nie hier gespeichert in Klartext
export const aiKeySchema = z.object({
	provider: z.enum(AI_PROVIDERS),
	key: z
		.string()
		.trim()
		.min(16, "zu kurz")
		.max(400)
		.regex(/^\S+$/, "ohne Leerzeichen"),
});

export const aiTestSchema = z.object({
	credentialId: z.uuid(),
	provider: z.enum(AI_PROVIDERS),
	model: z.string().trim().min(1).max(120),
	endpoint: z.string().trim().max(300).nullable(),
	deployment: z.string().trim().max(120).nullable(),
});

// Formular der Inhaber:in; Bestätigung des AV-Vertrags als Haken
export const aiPolicyInputSchema = aiPolicySchema
	.pick({
		enabled: true,
		maxClass: true,
		provider: true,
		model: true,
		endpoint: true,
		deployment: true,
		credentialId: true,
	})
	.extend({
		features: z.array(z.enum(AI_FEATURES)).max(AI_FEATURES.length),
		dpaConfirmed: z.boolean(),
	});
export type AiPolicyInput = z.input<typeof aiPolicyInputSchema>;
