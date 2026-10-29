import { z } from "zod";
import {
	AI_CLASS_LEVELS,
	AI_MODES,
	ORG_ACCOUNT_STATUS,
} from "@/db/schema/enums";
import { SUSPEND_REASON_MIN } from "@/lib/admin/contract";
import { ORG_ROLES } from "@/lib/auth/session-rules";
import { email, shortText, slug } from "./common";

// Plattform-Admin: Konten anlegen und sperren.

export const createAccountSchema = z
	.object({
		email,
		name: z.string().trim().min(1).max(120),
		// optional: Beitritt zu einer bestehenden Org direkt nach dem Passkey
		organizationId: z.uuid().nullish(),
		role: z.enum(ORG_ROLES).nullish(),
		// Link gibt es immer (zum Kopieren); die Mail ist optional
		sendMail: z.boolean().default(true),
	})
	.refine((d) => Boolean(d.organizationId) === Boolean(d.role), {
		path: ["role"],
		message: "org_role",
	});
export type CreateAccountInput = z.input<typeof createAccountSchema>;

// Sperre: Grund ist Pflicht, Ende optional (leer = unbefristet).
export const banAccountSchema = z.object({
	userId: z.uuid(),
	reason: z.string().trim().min(3).max(200),
	until: z.coerce.date().nullish(),
});
export type BanAccountInput = z.input<typeof banAccountSchema>;

// Vertrag einer Organisation (Admin-Portal, Teil 2). Datumsfelder leer = ohne.
const optDate = z.preprocess(
	(v) => (v === "" || v === undefined ? null : v),
	z.coerce.date().nullable(),
);
export const orgContractSchema = z.object({
	orgId: z.uuid(),
	status: z.enum(ORG_ACCOUNT_STATUS),
	startedAt: optDate,
	auditPassedAt: optDate,
	feeInvoicedFor: optDate,
	cancelledAt: optDate,
	note: z
		.string()
		.trim()
		.max(2000)
		.transform((s) => (s === "" ? null : s)),
});
export type OrgContractInput = z.input<typeof orgContractSchema>;

// KI je Organisation (ADR-032): Freischaltung, Modus, Obergrenze
export const orgAiSchema = z.object({
	orgId: z.uuid(),
	aiEnabled: z.boolean(),
	aiMode: z.enum(AI_MODES),
	aiMaxClass: z.enum(AI_CLASS_LEVELS),
});

// Sperre einer Organisation: Grund Pflicht (steht in ihrer Kette und in der
// Mitteilung an die Inhaber:innen).
export const suspendOrgSchema = z.object({
	orgId: z.uuid(),
	reason: z.string().trim().min(SUSPEND_REASON_MIN).max(300),
});

// Organisation anlegen (Admin-Portal): Org + Vertrag + erste Inhaber:in
// (Konto mit Aktivierungslink, Passkey Pflicht).
export const adminCreateOrgSchema = z.object({
	name: shortText,
	slug,
	status: z.enum(["trial", "active"]),
	startedAt: optDate,
	priceGroupId: z.uuid().nullish(),
	ownerName: z.string().trim().min(1).max(120),
	ownerEmail: email,
	sendMail: z.boolean().default(true),
});
export type AdminCreateOrgInput = z.input<typeof adminCreateOrgSchema>;
