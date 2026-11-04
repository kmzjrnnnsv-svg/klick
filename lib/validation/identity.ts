import { z } from "zod";
import {
	IDENTITY_POLICY_BOUNDS,
	type IdentityPolicyKey,
} from "@/lib/identity/policy";
import { REVIEW_DECISIONS, REVIEW_SCOPES } from "@/lib/identity/review-rules";
import { EXCEPTION_KINDS } from "@/lib/identity/types";

// Identität anbinden (Teil D): Eingaben der Einstellungen

// Tenant als ID (GUID) oder Domain (z. B. contoso.onmicrosoft.com)
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DOMAIN = /^(?=.{4,253}$)([a-z0-9-]+\.)+[a-z]{2,}$/i;

export const entraTenantSchema = z.object({
	tenant: z
		.string()
		.trim()
		.toLowerCase()
		.refine((v) => GUID.test(v) || DOMAIN.test(v), "tenant_invalid"),
});

export const identitySourceIdSchema = z.object({
	sourceId: z.uuid(),
});

// Freigabe-Link nur nach dem Hinweis zu Datenschutz und Betriebsrat
export const entraConsentSchema = entraTenantSchema.extend({
	acknowledged: z.literal(true, { error: "identity_ack_required" }),
});

// Google Workspace (I3): Admin-Adresse der Kundin, unter der Klick über die
// domänenweite Delegierung liest
export const googleConnectSchema = z.object({
	adminEmail: z.email().trim().toLowerCase().max(254),
	acknowledged: z.literal(true, { error: "identity_ack_required" }),
});

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

export const identityExceptionSchema = z.object({
	accountId: z.uuid(),
	kind: z.enum(EXCEPTION_KINDS),
	reason: z.string().trim().min(10).max(1000),
	expiresAt: z.string().regex(ISO_DAY),
});

export const identityExceptionIdSchema = z.object({
	exceptionId: z.uuid(),
});

export const identityMatchSchema = z.object({
	accountId: z.uuid(),
	// Person (Konto-ID), „none“ = niemand, „auto“ = automatisch
	match: z.union([z.literal("auto"), z.literal("none"), z.uuid()]),
});

export const identityLeftSchema = z.object({
	accountId: z.uuid(),
	left: z.boolean(),
});

const bounded = (key: IdentityPolicyKey) => {
	const [min, max] = IDENTITY_POLICY_BOUNDS[key];
	return z.coerce.number().int().min(min).max(max);
};

export const identityPolicySchema = z
	.object({
		mfaFailBelow: bounded("mfaFailBelow"),
		maxTopAdmins: bounded("maxTopAdmins"),
		leaverGraceDays: bounded("leaverGraceDays"),
		inactiveDays: bounded("inactiveDays"),
		neverSignedInDays: bounded("neverSignedInDays"),
		recertPassDays: bounded("recertPassDays"),
		recertFailDays: bounded("recertFailDays"),
	})
	.refine((v) => v.recertFailDays >= v.recertPassDays, {
		path: ["recertFailDays"],
		message: "identity_recert_order",
	});

// Zugriffsprüfung (I2)
export const startAccessReviewSchema = z.object({
	sourceId: z.uuid(),
	title: z.string().trim().min(3).max(200),
	dueAt: z
		.union([z.literal(""), z.string().regex(ISO_DAY)])
		.transform((v) => (v === "" ? null : v)),
	scope: z.enum(REVIEW_SCOPES),
	reviewerUserId: z.uuid(),
});

export const decideAccessReviewSchema = z.object({
	itemId: z.uuid(),
	decision: z.enum(REVIEW_DECISIONS),
	note: z
		.string()
		.trim()
		.max(1000)
		.optional()
		.transform((v) => v || null),
});

export const accessReviewIdSchema = z.object({
	reviewId: z.uuid(),
});
