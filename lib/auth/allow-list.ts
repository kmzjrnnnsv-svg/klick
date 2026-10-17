import { and, desc, eq, gt } from "drizzle-orm";
import { globalDb } from "../../db";
import { invitation, user } from "../../db/auth-schema";

// Allow-List-Modus (AUTH_ALLOW_SIGNUP ≠ true): Anmelde-Links bekommen nur
// bestehende Konten und Adressen mit offener Einladung — sonst könnten
// Eingeladene nie ihr Konto anlegen. `invitation` hat keine RLS (ADR-009),
// gefiltert wird hier explizit. Relative Importe: server.ts lädt diese Datei
// auch in der Better-Auth-CLI.

export async function pendingInvitationId(
	email: string,
): Promise<string | null> {
	const [row] = await globalDb
		.select({ id: invitation.id })
		.from(invitation)
		.where(
			and(
				// Better Auth speichert Einladungs-Adressen kleingeschrieben.
				eq(invitation.email, email.toLowerCase()),
				eq(invitation.status, "pending"),
				gt(invitation.expiresAt, new Date()),
			),
		)
		.orderBy(desc(invitation.createdAt))
		.limit(1);
	return row?.id ?? null;
}

export async function mayReceiveMagicLink(email: string): Promise<boolean> {
	const [known] = await globalDb
		.select({ id: user.id })
		.from(user)
		.where(eq(user.email, email.toLowerCase()))
		.limit(1);
	if (known) return true;
	return (await pendingInvitationId(email)) !== null;
}
