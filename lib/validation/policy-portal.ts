import { z } from "zod";

// Einstellungen > Richtlinien-Portal (M2)
export const portalSettingsSchema = z.object({
	enabled: z.boolean(),
	slug: z.string().trim().toLowerCase().min(3).max(40),
	sessionDays: z.coerce.number().int().min(1).max(90),
});

export const portalDomainSchema = z.object({
	domain: z.string().trim().min(4).max(253),
});

export const portalReaderSchema = z.object({
	readerId: z.uuid(),
});
