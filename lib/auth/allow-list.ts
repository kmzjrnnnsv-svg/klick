import { and, desc, eq, gt, like, sql } from "drizzle-orm";
import { globalDb } from "../../db";
import { invitation, passkey, user, verification } from "../../db/auth-schema";
import { isBanActive, magicLinkAllowed } from "./account-status";

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

// Vom Plattform-Admin angelegt und noch nicht über den Passkey-Link
// aktiviert (Zeile passkey-activate:… mit dieser userId, auch abgelaufen).
export async function hasPendingActivation(userId: string): Promise<boolean> {
	const [row] = await globalDb
		.select({ id: verification.id })
		.from(verification)
		.where(
			and(
				like(verification.identifier, "passkey-activate:%"),
				sql`${verification.value}::jsonb->>'userId' = ${userId}`,
			),
		)
		.limit(1);
	return Boolean(row);
}

// Gehört der Passkey (credential id) zu einem gesperrten Konto?
export async function passkeyOwnerId(
	credentialId: string,
): Promise<string | null> {
	const [row] = await globalDb
		.select({ userId: passkey.userId })
		.from(passkey)
		.where(eq(passkey.credentialID, credentialId))
		.limit(1);
	return row?.userId ?? null;
}

export async function passkeyOwnerBlocked(
	credentialId: string,
): Promise<boolean> {
	const [row] = await globalDb
		.select({ banned: user.banned, banExpires: user.banExpires })
		.from(passkey)
		.innerJoin(user, eq(user.id, passkey.userId))
		.where(eq(passkey.credentialID, credentialId))
		.limit(1);
	return row ? isBanActive(row) : false;
}

// Mail-Notweg: bestehende Konten nur, wenn aktiv (nicht gesperrt, nicht
// „nicht aktiviert“) — auch mit AUTH_ALLOW_SIGNUP. Neue Adressen nur mit
// offener Einladung oder offener Registrierung.
export async function mayReceiveMagicLink(
	email: string,
	allowSignup = false,
): Promise<boolean> {
	const [known] = await globalDb
		.select({
			id: user.id,
			banned: user.banned,
			banExpires: user.banExpires,
		})
		.from(user)
		.where(eq(user.email, email.toLowerCase()))
		.limit(1);
	if (known)
		return magicLinkAllowed({
			account: {
				...known,
				pendingActivation: await hasPendingActivation(known.id),
			},
			openInvitation: false,
		});
	return allowSignup || (await pendingInvitationId(email)) !== null;
}
