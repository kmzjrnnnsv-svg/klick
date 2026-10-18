import { z } from "zod";
import { ORG_ROLES } from "@/lib/auth/session-rules";
import { email } from "./common";

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
