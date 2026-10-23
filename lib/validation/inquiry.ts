import { z } from "zod";
import { INQUIRY_STATUS } from "@/db/schema/enums";
import { INQUIRY_SERVICE_KEYS } from "@/lib/inquiries/rules";

const optional = (max: number) =>
	z
		.string()
		.trim()
		.max(max)
		.nullish()
		.transform((v) => (v ? v : null));

// Eingefügte Adressen tragen oft Leerzeichen — erst trimmen, dann prüfen.
const email = z
	.string()
	.trim()
	.toLowerCase()
	.pipe(z.email("Bitte eine gültige E-Mail-Adresse angeben"));

// Öffentliches Formular (/leistungen#anfrage → /api/anfrage).
export const publicInquirySchema = z.object({
	service: z.enum(INQUIRY_SERVICE_KEYS),
	name: z.string().trim().min(2, "Bitte deinen Namen angeben").max(120),
	company: optional(160),
	email,
	phone: optional(40),
	message: z
		.string()
		.trim()
		.min(10, "Ein, zwei Sätze zum Anliegen helfen uns")
		.max(4_000),
	// Nur für Unternehmen (§ 14 BGB) — keine Einwilligung: verarbeitet wird
	// nach Art. 6 Abs. 1 lit. b DSGVO, die Hinweise stehen daneben.
	business: z.literal(
		true,
		"Bitte bestätigen, dass du für ein Unternehmen anfragst",
	),
	// Honeypot + Zeitstempel (looksAutomated)
	website: z.string().max(500).optional(),
	renderedAt: z.number().optional(),
});

// In der App: Name, E-Mail und Firma kommen aus Sitzung und Org.
export const appInquirySchema = z.object({
	service: z.enum(INQUIRY_SERVICE_KEYS),
	message: z
		.string()
		.trim()
		.min(10, "Ein, zwei Sätze zum Anliegen helfen uns")
		.max(4_000),
	phone: optional(40),
});

export const inquiryStatusSchema = z.object({
	id: z.uuid(),
	status: z.enum(INQUIRY_STATUS),
});
