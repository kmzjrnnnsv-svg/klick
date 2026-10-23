import { z } from "zod";

// Nachweisbogen: Antworten, Belege je Position, eigene Fristen je Rahmenwerk
const controlCode = z.string().regex(/^CC-[A-Z0-9]+-\d{2}$/);
const sheetId = (prefix: "q" | "i") =>
	z.string().regex(new RegExp(`^${prefix}-[0-9a-f]{12}$`));
const note = z.string().trim().max(4_000).optional();

export const sheetAnswerSchema = z.object({
	controlCode,
	questionId: sheetId("q"),
	answer: z.enum(["yes", "partial", "no", "na"]).nullable(),
	note,
});

export const sheetItemSchema = z.object({
	controlCode,
	itemId: sheetId("i"),
	mode: z.enum(["kind", "document", "evidence", "text"]).nullable(),
	note,
	evidenceIds: z.array(z.uuid()).max(20).optional(),
});

export const sheetParamSchema = z.object({
	controlCode,
	framework: z.string().regex(/^[a-z0-9-]{2,24}$/),
	topic: z.string().regex(/^(interval|deadline):[a-z_]{2,24}$|^retention$/),
	// Monate, Stunden bzw. Jahre; null = eigene Festlegung entfernen
	value: z.number().positive().max(100_000).nullable(),
});
