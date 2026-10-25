import { z } from "zod";
import { RESPONSIBILITY_AREAS } from "@/lib/compliance/catalog/domain-functions";
import { type FunctionKey, isFunctionKey } from "@/lib/compliance/function-key";
import { uuid } from "./common";

// Rollen-Tafel, Bereiche und Organigramm (ADR-024): Funktion oder eigene
// Rolle als Schlüssel

const functionKey = z
	.string()
	.refine(isFunctionKey, "Unbekannte Funktion")
	.transform((v) => v as FunctionKey);

// Person (Konto oder Einladung) auf eine Rolle; aus einer anderen Rolle
// gezogen = Neubesetzung (fromId wird mit der Bestellung abberufen)
export const boardAssignSchema = z
	.object({
		fn: functionKey,
		userId: uuid.optional(),
		pendingEmail: z.email().max(320).optional(),
		fromId: uuid.optional(),
	})
	.refine((d) => Boolean(d.userId) !== Boolean(d.pendingEmail), {
		message: "Person oder Einladung erforderlich",
		path: ["userId"],
	});

// Bereich auf eine Rolle: Controls ohne Funktion, mit `all` alle des Bereichs
export const assignAreaSchema = z.object({
	area: z.enum(RESPONSIBILITY_AREAS),
	fn: functionKey,
	all: z.boolean().default(false),
});

// Organigramm: „berichtet an“ (null = direkt an die Geschäftsleitung)
export const reportsToSchema = z
	.object({ fn: functionKey, parent: functionKey.nullable() })
	.refine((d) => d.parent !== d.fn, {
		message: "Eine Funktion kann nicht an sich selbst berichten",
		path: ["parent"],
	});
