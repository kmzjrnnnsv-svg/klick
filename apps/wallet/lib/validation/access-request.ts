import { ACCESS_REQUEST_PURPOSES } from "@wallet/db/schema/enums";
import { ACCESS_REQUEST_LIMITS as L } from "@wallet/lib/access-requests/rules";
import { z } from "zod";

// „Zugang anfragen“ (Startseite → /api/access-request). Nur für Unternehmen:
// verarbeitet wird nach Art. 6 Abs. 1 lit. b DSGVO (Anfrage vor einem
// Vertrag), die Hinweise stehen am Formular; keine Einwilligung.
export const accessRequestSchema = z.object({
	name: z.string().trim().min(2, "Bitte deinen Namen angeben").max(L.name),
	company: z
		.string()
		.trim()
		.min(2, "Bitte dein Unternehmen angeben")
		.max(L.company),
	// Eingefügte Adressen tragen oft Leerzeichen: erst trimmen, dann prüfen
	email: z
		.string()
		.trim()
		.toLowerCase()
		.max(L.email)
		.pipe(z.email("Bitte eine gültige E-Mail-Adresse angeben")),
	purpose: z.enum(ACCESS_REQUEST_PURPOSES, "Bitte wählen, wofür"),
	message: z
		.string()
		.trim()
		.max(L.message)
		.nullish()
		.transform((v) => (v ? v : null)),
	business: z.literal(
		true,
		"Bitte bestätigen, dass du für ein Unternehmen anfragst",
	),
	// Honeypot und Zeitstempel (looksAutomated)
	website: z.string().max(500).optional(),
	renderedAt: z.number().optional(),
});

export type AccessRequestInput = z.infer<typeof accessRequestSchema>;
