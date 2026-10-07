import { z } from "zod";
import { CASP_SERVICES, LICENCE_STAGES } from "@/db/schema/enums";
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
	role: z.enum(["owner", "editor", "viewer", "auditor"]),
	// nur für auditor: Zugang endet automatisch
	accessUntil: z.coerce.date().optional(),
});
export type InviteMemberInput = z.infer<typeof inviteMemberSchema>;

export const updateMemberRoleSchema = z.object({
	memberId: z.uuid(),
	role: z.enum(["owner", "editor", "viewer", "auditor"]),
});
