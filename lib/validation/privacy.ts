import { z } from "zod";
import { longText, shortText, uuid } from "./common";

// Datenschutz (P5): Verarbeitungsverzeichnis, Betroffenenanfragen,
// Versicherungen (Organisation).

const isoDate = z.iso.date();
const optionalDate = isoDate.nullable().optional();
const list = z.array(z.string().trim().min(1).max(120)).max(40);

export const processingActivitySchema = z.object({
	id: uuid.optional(),
	name: shortText,
	purpose: longText.optional(),
	dataCategories: list.default([]),
	dataSubjects: list.default([]),
	recipients: list.default([]),
	thirdCountryTransfer: z.string().trim().max(400).nullable().optional(),
	retention: z.string().trim().max(200).nullable().optional(),
	legalBasis: z.string().trim().max(200).nullable().optional(),
	dsfaRequired: z.boolean().default(false),
	dsfaEvidenceId: uuid.nullable().optional(),
	ownerUserId: uuid.nullable().optional(),
});

export const DSR_TYPES = [
	"auskunft",
	"loeschung",
	"berichtigung",
	"widerspruch",
	"portabilitaet",
	"einschraenkung",
] as const;
export const DSR_STATUSES = [
	"open",
	"in_progress",
	"done",
	"rejected",
] as const;

export const dataSubjectRequestSchema = z.object({
	id: uuid.optional(),
	receivedAt: z.coerce.date(),
	type: z.enum(DSR_TYPES),
	// feldverschlüsselt — Pseudonym/Ticketnummer, keine Klarnamen
	subjectRef: z.string().trim().max(400).nullable().optional(),
	ownerUserId: uuid.nullable().optional(),
});

export const dsrTransitionSchema = z.object({
	id: uuid,
	to: z.enum(DSR_STATUSES),
	outcome: z.string().trim().max(2000).optional(),
});

export const dsrExtendSchema = z.object({
	id: uuid,
	reason: z.string().trim().min(3).max(1000),
});

export const INSURANCE_TYPES = [
	"do",
	"cyber",
	"crime",
	"crypto_custody",
	"liability",
] as const;

export const insurancePolicySchema = z.object({
	id: uuid.optional(),
	type: z.enum(INSURANCE_TYPES),
	insurer: shortText,
	policyRef: z.string().trim().max(120).nullable().optional(),
	coverageLimit: z.coerce.number().min(0).max(1e13).nullable().optional(),
	// "Hot Wallet=2000000; Social Engineering=500000"
	subLimits: z.string().trim().max(2000).optional(),
	exclusions: longText.optional(),
	validFrom: optionalDate,
	validUntil: optionalDate,
	premium: z.coerce.number().min(0).max(1e13).nullable().optional(),
	ownerUserId: uuid.nullable().optional(),
});

export function parseSubLimits(
	text: string | undefined,
): Record<string, number> {
	const out: Record<string, number> = {};
	for (const part of (text ?? "").split(";")) {
		const [k, v] = part.split("=");
		const key = k?.trim();
		const num = Number((v ?? "").trim());
		if (key && Number.isFinite(num)) out[key] = num;
	}
	return out;
}
