import { z } from "zod";
import { INGEST_SCOPES } from "@/db/schema/enums";
import { shortText, uuid } from "./common";

// Security-Checks (S5) und Zugangstoken (ADR-017).

const isoDate = z.iso.date();

export const startQuickCheckSchema = z.object({
	url: z.string().trim().min(4).max(2000),
	productId: uuid.nullable().optional(),
	// Berechtigung bestätigt: nur eigene oder beauftragte Ziele
	confirmed: z.literal(true),
});

export const setFindingStatusSchema = z.object({
	findingId: uuid,
	status: z.enum(["open", "in_progress", "resolved", "false_positive"]),
	note: z.string().trim().max(2000).optional(),
});

export const acceptFindingSchema = z.object({
	findingId: uuid,
	note: z.string().trim().min(10).max(2000),
	acceptedUntil: isoDate,
});

export const createAccessTokenSchema = z.object({
	name: shortText.max(80),
	scopes: z.array(z.enum(INGEST_SCOPES)).min(1),
	expiresInDays: z.coerce.number().int().min(1).max(365),
	productId: uuid.nullable().optional(),
});

export const accessTokenIdSchema = z.object({ tokenId: uuid });
