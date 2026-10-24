import { MEMBER_ROLES } from "@wallet/db/schema/enums";
import { z } from "zod";

export const inviteSchema = z.object({
	email: z.email("Bitte eine gültige E-Mail-Adresse").max(200),
	role: z.enum(MEMBER_ROLES),
	sendMail: z.boolean().default(false),
});
export type InviteInput = z.input<typeof inviteSchema>;

export const roleChangeSchema = z.object({
	memberId: z.uuid(),
	role: z.enum(MEMBER_ROLES),
});
