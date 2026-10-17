import { z } from "zod";
import { CASP_SERVICES, LICENCE_STAGES } from "@/db/schema/enums";
import { ORG_ROLES } from "@/lib/auth/session-rules";
import { shortText, slug } from "./common";

export const sectorSchema = z.enum(["casp", "bank", "payment", "emi", "other"]);

export const createOrganizationSchema = z.object({
	name: shortText,
	slug,
	sector: sectorSchema.default("other"),
	licenceStage: z.enum(LICENCE_STAGES).default("0_vorbereitung"),
	caspServices: z.array(z.enum(CASP_SERVICES)).default([]),
	frameworks: z.array(z.string().min(1)).min(1, "mindestens ein Rahmenwerk"),
	applyBaseline: z.boolean().default(false),
});
export type CreateOrganizationInput = z.output<typeof createOrganizationSchema>;
// Formular-Eingabetyp: Felder mit .default() sind hier optional.
export type CreateOrganizationFormInput = z.input<
	typeof createOrganizationSchema
>;

export const inviteMemberSchema = z.object({
	email: z.email(),
	role: z.enum(ORG_ROLES),
	// nur für auditor/consultant: Zugang endet automatisch
	accessUntil: z.coerce.date().optional(),
	// Link gibt es immer (zum Kopieren); die Mail ist optional
	sendMail: z.boolean().default(true),
});
export type InviteMemberInput = z.infer<typeof inviteMemberSchema>;

export const updateMemberRoleSchema = z.object({
	memberId: z.uuid(),
	role: z.enum(ORG_ROLES),
});

// Stammdaten für Meldungen (Informationsregister, Antrag, Lieferantenpaket).
const optionalText = (max: number) =>
	z
		.string()
		.trim()
		.max(max)
		.transform((v) => (v === "" ? undefined : v))
		.optional();

export const entityProfileSchema = z.object({
	lei: z
		.string()
		.trim()
		.toUpperCase()
		.transform((v) => (v === "" ? undefined : v))
		.pipe(
			z
				.string()
				.regex(/^[A-Z0-9]{18}[0-9]{2}$/, "LEI: 20 Zeichen (ISO 17442)")
				.optional(),
		),
	country: z
		.string()
		.trim()
		.toUpperCase()
		.transform((v) => (v === "" ? undefined : v))
		.pipe(
			z
				.string()
				.regex(/^[A-Z]{2}$/, "ISO-3166 alpha-2")
				.optional(),
		),
	competentAuthority: optionalText(80),
	totalAssetsEur: z
		.union([z.coerce.number().min(0).max(1e15), z.literal(""), z.null()])
		.transform((v) => (v === "" || v === null ? undefined : v))
		.optional(),
	legalForm: optionalText(40),
	registerNumber: optionalText(40),
});
export type EntityProfileInput = z.input<typeof entityProfileSchema>;

// DLP-Regeln je Org (Einstellungen → Sicherheit). Secrets lassen sich nur
// zwischen block und warn umstellen — nie ganz abschalten.
const dlpRule = z.enum(["block", "warn", "raise", "allow"]);
export const dlpPolicySchema = z.object({
	secret: z.enum(["block", "warn"]),
	payment: dlpRule,
	bank: dlpRule,
	tax: dlpRule,
	pii: dlpRule,
	piiThreshold: z.coerce.number().int().min(5).max(10_000),
	egressLimit: z.coerce.number().int().min(5).max(1_000),
	egressWindowMinutes: z.coerce.number().int().min(1).max(240),
});
