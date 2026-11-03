import { z } from "zod";

// Richtlinien-Baukasten (Teil 5): nur Form und Größe; ob ein Wert zur Frage
// passt, prüft cleanAnswers (lib/documents/builder/render.ts).

export const builderDocSchema = z.object({ documentId: z.uuid() });

export const saveBuilderSchema = z.object({
	documentId: z.uuid(),
	patch: z
		.record(
			z
				.string()
				.max(64)
				.regex(/^[a-z0-9_]+$/),
			z.union([z.string().max(2000), z.number(), z.null()]),
		)
		.refine((p) => Object.keys(p).length <= 100, "zu viele Antworten"),
});
