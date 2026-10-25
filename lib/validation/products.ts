import { z } from "zod";
import {
	CRA_CLASSES,
	PRODUCT_KINDS,
	PRODUCT_ROLES,
	PRODUCT_STATUS,
} from "@/db/schema/enums";
import { longText, shortText, uuid } from "./common";
import { responsibleRef } from "./responsible";

// Produktregister (CRA). Leere Strings aus Formularen werden zu null.

const isoDate = z.iso.date();
const optionalDate = isoDate.nullable().optional();
const optionalText = (max: number) =>
	z
		.string()
		.trim()
		.max(max)
		.transform((v) => (v === "" ? null : v))
		.nullable()
		.optional();

export const createProductSchema = z.object({
	name: shortText,
	description: longText.optional(),
	kind: z.enum(PRODUCT_KINDS).default("software"),
	role: z.enum(PRODUCT_ROLES).default("manufacturer"),
	version: optionalText(60),
	ownerUserId: responsibleRef,
});
export type CreateProductInput = z.output<typeof createProductSchema>;

export const updateProductSchema = z.object({
	productId: uuid,
	name: shortText.optional(),
	description: optionalText(20_000),
	kind: z.enum(PRODUCT_KINDS).optional(),
	role: z.enum(PRODUCT_ROLES).optional(),
	version: optionalText(60),
	// Einstufung
	craInScope: z.boolean().nullable().optional(),
	scopeReason: optionalText(4000),
	craClass: z.enum(CRA_CLASSES).optional(),
	classReason: optionalText(4000),
	isFoss: z.boolean().optional(),
	harmonisedStandards: z.boolean().optional(),
	// Lebenszyklus
	placedOnMarketAt: optionalDate,
	supportUntil: optionalDate,
	supportReason: optionalText(4000),
	vulnContact: optionalText(300),
	// Konformität
	riskDocumentId: uuid.nullable().optional(),
	techDocDocumentId: uuid.nullable().optional(),
	declarationAt: optionalDate,
	ceMarked: z.boolean().optional(),
	notifiedBody: optionalText(200),
	ownerUserId: responsibleRef,
});
export type UpdateProductInput = z.output<typeof updateProductSchema>;

export const setProductStatusSchema = z.object({
	productId: uuid,
	status: z.enum(PRODUCT_STATUS),
	note: z.string().trim().max(2000).optional(),
});

export const productIdSchema = z.object({ productId: uuid });
