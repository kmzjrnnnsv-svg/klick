import { z } from "zod";
import { CHANGE_KINDS } from "@/db/schema/enums";
import { longText, shortText, uuid } from "./common";

// Neues Produkt oder wesentliche Änderung (/aenderungen, MaRisk AT 8)
export const createChangeSchema = z.object({
	title: shortText,
	kind: z.enum(CHANGE_KINDS),
	description: longText.optional(),
	processIds: z.array(uuid).max(50).default([]),
	assetIds: z.array(uuid).max(50).default([]),
	riskId: uuid.nullable().optional(),
	assigneeUserId: uuid.nullable().optional(),
});

export const changeIdSchema = z.object({ id: uuid });
