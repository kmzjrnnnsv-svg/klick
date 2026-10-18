import { AsyncLocalStorage } from "node:async_hooks";
import { createHash, randomBytes } from "node:crypto";
import { and, eq, like, sql } from "drizzle-orm";
import { globalDb } from "@/db";
import { invitation, organization, user, verification } from "@/db/auth-schema";

// Einmal-Links zur Passkey-Registrierung ohne Mail-Login (ADR-019):
// - Einladung (klk_invite_…): legt für eine offene Einladung ein neues Konto
//   mit Passkey an — nie für eine Adresse, die schon ein Konto hat.
// - Zugang zurücksetzen (klk_recover_…): neuer Passkey für ein bestehendes
//   Konto, nachdem Owner bzw. Plattform-Admin alle Faktoren entfernt hat.
// Gespeichert wird nur der SHA-256 (Better-Auth-Tabelle verification). Der
// Link trägt den Token im Fragment; die Seite tauscht ihn über
// /api/registrierung gegen ein httpOnly-Cookie, das nur die Passkey-
// Endpunkte sehen (registration.resolveUser/afterVerification).

export const REG_COOKIE = "klick_reg";
export const REG_COOKIE_PATH = "/api/auth/passkey";
// ?context= der Registrierung: nur ein Merker, der Token steht im Cookie
// (Query-Strings landen in Zugriffs-Logs).
export const REG_CONTEXT = "link";

export type RegistrationKind = "invite" | "recover";

const PREFIX: Record<RegistrationKind, string> = {
	invite: "klk_invite_",
	recover: "klk_recover_",
};

export type RegistrationPayload =
	| {
			kind: "invite";
			invitationId: string;
			email: string;
			organizationId: string;
			name?: string;
	  }
	| { kind: "recover"; userId: string; email: string; name?: string };

const baseURL = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";

export function kindOfToken(raw: string): RegistrationKind | null {
	if (raw.startsWith(PREFIX.invite)) return "invite";
	if (raw.startsWith(PREFIX.recover)) return "recover";
	return null;
}

const hashOf = (raw: string) => createHash("sha256").update(raw).digest("hex");
const identifierOf = (kind: RegistrationKind, raw: string) =>
	`passkey-${kind}:${hashOf(raw)}`;

export function registrationUrl(raw: string): string {
	const kind = kindOfToken(raw);
	return `${baseURL}/${kind === "recover" ? "zugang" : "einladung"}#${raw}`;
}

// Ein gültiger Link je Einladung bzw. Konto: ein neuer ersetzt den alten.
export async function revokeRegistrationLinks(
	subject: { invitationId: string } | { userId: string },
): Promise<void> {
	const [kind, field, id] =
		"invitationId" in subject
			? (["invite", "invitationId", subject.invitationId] as const)
			: (["recover", "userId", subject.userId] as const);
	await globalDb
		.delete(verification)
		.where(
			and(
				like(verification.identifier, `passkey-${kind}:%`),
				sql`${verification.value}::jsonb->>${field} = ${id}`,
			),
		);
}

export async function issueRegistrationLink(
	payload: RegistrationPayload,
	expiresAt: Date,
): Promise<{ token: string; url: string }> {
	await revokeRegistrationLinks(
		payload.kind === "invite"
			? { invitationId: payload.invitationId }
			: { userId: payload.userId },
	);
	const token = `${PREFIX[payload.kind]}${randomBytes(32).toString("base64url")}`;
	await globalDb.insert(verification).values({
		identifier: identifierOf(payload.kind, token),
		value: JSON.stringify(payload),
		expiresAt,
	});
	return { token, url: registrationUrl(token) };
}

async function readToken(
	raw: string,
): Promise<{ payload: RegistrationPayload; expiresAt: Date } | null> {
	const kind = kindOfToken(raw);
	if (!kind || raw.length > 200) return null;
	const [row] = await globalDb
		.select({ value: verification.value, expiresAt: verification.expiresAt })
		.from(verification)
		.where(eq(verification.identifier, identifierOf(kind, raw)))
		.limit(1);
	if (!row || row.expiresAt.getTime() < Date.now()) return null;
	const payload = JSON.parse(row.value) as RegistrationPayload;
	return payload.kind === kind ? { payload, expiresAt: row.expiresAt } : null;
}

export async function setRegistrationName(
	raw: string,
	name: string,
): Promise<void> {
	const t = await readToken(raw);
	if (!t?.payload) return;
	await globalDb
		.update(verification)
		.set({ value: JSON.stringify({ ...t.payload, name }) })
		.where(eq(verification.identifier, identifierOf(t.payload.kind, raw)));
}

export async function consumeRegistrationToken(raw: string): Promise<void> {
	const kind = kindOfToken(raw);
	if (!kind) return;
	await globalDb
		.delete(verification)
		.where(eq(verification.identifier, identifierOf(kind, raw)));
}

export type RegistrationInfo =
	| {
			kind: "invite";
			invitationId: string;
			email: string;
			organization: string;
			role: string;
			inviter: string;
			accountExists: boolean;
			expiresAt: Date;
	  }
	| { kind: "recover"; email: string; name: string; expiresAt: Date };

export type ResolvedRegistration =
	| { ok: true; info: RegistrationInfo; payload: RegistrationPayload }
	| { ok: false; error: "invalid" };

// Token prüfen und gegen den aktuellen Stand lesen: Einladung noch offen und
// für dieselbe Adresse, Konto noch vorhanden.
export async function resolveRegistration(
	raw: string | null | undefined,
): Promise<ResolvedRegistration> {
	const t = raw ? await readToken(raw.trim()) : null;
	if (!t) return { ok: false, error: "invalid" };
	const p = t.payload;
	if (p.kind === "invite") {
		const [inv] = await globalDb
			.select({
				id: invitation.id,
				email: invitation.email,
				role: invitation.role,
				status: invitation.status,
				expiresAt: invitation.expiresAt,
				organizationId: invitation.organizationId,
				organization: organization.name,
				inviter: user.name,
				inviterEmail: user.email,
			})
			.from(invitation)
			.innerJoin(organization, eq(organization.id, invitation.organizationId))
			.innerJoin(user, eq(user.id, invitation.inviterId))
			.where(eq(invitation.id, p.invitationId))
			.limit(1);
		if (
			!inv ||
			inv.status !== "pending" ||
			inv.expiresAt.getTime() < Date.now() ||
			inv.organizationId !== p.organizationId ||
			inv.email.toLowerCase() !== p.email.toLowerCase()
		)
			return { ok: false, error: "invalid" };
		const [existing] = await globalDb
			.select({ id: user.id })
			.from(user)
			.where(eq(user.email, p.email.toLowerCase()))
			.limit(1);
		return {
			ok: true,
			payload: p,
			info: {
				kind: "invite",
				invitationId: inv.id,
				email: inv.email,
				organization: inv.organization,
				role: inv.role ?? "viewer",
				inviter: inv.inviter || inv.inviterEmail,
				accountExists: Boolean(existing),
				expiresAt: t.expiresAt,
			},
		};
	}
	const [u] = await globalDb
		.select({ id: user.id, email: user.email, name: user.name })
		.from(user)
		.where(eq(user.id, p.userId))
		.limit(1);
	if (!u || u.email.toLowerCase() !== p.email.toLowerCase())
		return { ok: false, error: "invalid" };
	return {
		ok: true,
		payload: p,
		info: {
			kind: "recover",
			email: u.email,
			name: u.name,
			expiresAt: t.expiresAt,
		},
	};
}

// Einladung anlegen: sendInvitationEmail (lib/auth/server.ts) erzeugt den
// Link und schreibt ihn hierher zurück; `mail: false` = nur Link, keine Mail.
export type InviteDelivery = { mail: boolean; url?: string; mailed?: boolean };
export const inviteDelivery = new AsyncLocalStorage<InviteDelivery>();
