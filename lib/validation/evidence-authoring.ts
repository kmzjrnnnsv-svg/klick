import { z } from "zod";
import { ROLE_FUNCTIONS } from "@/db/schema/enums";
import { authoredContentSchema } from "@/lib/evidence-authoring/content";

// Nachweise in Klick verfassen (Rohlinge): Entwurf, Speichern, Abschließen
const controlCode = z.string().regex(/^CC-[A-Z0-9]+-\d{2}$/);
const key = z.string().regex(/^[a-z][a-z0-9-]{1,39}$/);

export const createDraftSchema = z.object({
	template: key,
	preset: key.nullable().optional(),
	title: z.string().trim().max(200).optional(),
	controlCode: controlCode.optional(),
	sheetItem: z
		.string()
		.regex(/^i-[0-9a-f]{12}$/)
		.optional(),
});

export const saveDraftSchema = z.object({
	id: z.uuid(),
	title: z.string().trim().min(1).max(200),
	preset: key.nullable(),
	classification: z.enum(["internal", "confidential"]),
	controlCodes: z.array(controlCode).max(20),
	signers: z
		.array(z.union([z.literal("-"), z.enum(ROLE_FUNCTIONS)]))
		.min(1)
		.max(5),
	content: authoredContentSchema,
});

export const finalizeDraftSchema = z.object({
	id: z.uuid(),
	createTasks: z.boolean(),
	recordTest: z.boolean(),
});

export const draftIdSchema = z.object({ id: z.uuid() });
export const evidenceIdSchema = z.object({ evidenceId: z.uuid() });
