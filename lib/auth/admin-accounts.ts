import { and, eq } from "drizzle-orm";
import { globalDb } from "@/db";
import {
	invitation,
	member,
	organization,
	passkey,
	user,
} from "@/db/auth-schema";
import { auditPlatform } from "@/lib/audit";
import { sendTransactionalMail } from "@/lib/mail/send";
import { activationEmail } from "@/lib/mail/templates";
import type { CreateAccountInput } from "@/lib/validation/admin";
import { isBanActive } from "./account-status";
import {
	activationPayload,
	issueRegistrationLink,
	revokeRegistrationLinks,
} from "./registration-link";
import { auth } from "./server";

// Plattform-Admin legt Konten an (Admin → Benutzer). Das Konto hat zunächst
// keinen Faktor; der Aktivierungslink (/aktivieren#klk_activate_…, 7 Tage)
// legt den ersten Passkey an — bis dahin weder Mail-Notweg noch Sitzung
// (allow-list.ts, session.create.before). Mit Org und Rolle entsteht eine
// Einladung, die die Person direkt nach dem Passkey annimmt.

export const ACTIVATION_DAYS = 7;
const ACTIVATION_MS = ACTIVATION_DAYS * 24 * 60 * 60 * 1000;

export type AdminActor = {
	userId: string;
	ip?: string | null;
	userAgent?: string | null;
};

export type ActivationLink = {
	userId: string;
	url: string;
	mailed: boolean | null;
	expiresAt: Date;
};

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

const actorOf = (a: AdminActor) => ({
	userId: a.userId,
	ip: a.ip ?? null,
	userAgent: a.userAgent ?? null,
});

async function sendActivation(input: {
	to: string;
	name: string;
	url: string;
	invitationId: string | null;
}): Promise<boolean> {
	let org: { name: string; role: string | null } | undefined;
	if (input.invitationId)
		[org] = await globalDb
			.select({ name: organization.name, role: invitation.role })
			.from(invitation)
			.innerJoin(organization, eq(organization.id, invitation.organizationId))
			.where(eq(invitation.id, input.invitationId))
			.limit(1);
	const tpl = activationEmail({
		url: input.url,
		name: input.name,
		organization: org?.name ?? null,
		role: org?.role ?? null,
		days: ACTIVATION_DAYS,
	});
	const sent = await sendTransactionalMail({
		to: input.to,
		subject: tpl.subject,
		text: tpl.text,
		html: tpl.html,
	});
	return sent.ok;
}

export async function createAccount(
	input: Omit<CreateAccountInput, "sendMail"> & { sendMail: boolean },
	actor: AdminActor,
	requestHeaders: Headers,
): Promise<Result<ActivationLink>> {
	const email = input.email.trim().toLowerCase();
	const [existing] = await globalDb
		.select({ id: user.id })
		.from(user)
		.where(eq(user.email, email))
		.limit(1);
	if (existing) return { ok: false, error: "account_exists" };

	const orgId = input.organizationId ?? null;
	const role = input.role ?? null;
	if (orgId) {
		const [org] = await globalDb
			.select({ id: organization.id })
			.from(organization)
			.where(eq(organization.id, orgId))
			.limit(1);
		// Neues Konto ohne Mitgliedschaft: jede Rolle ist zulässig; die
		// Ein-Org-Regel (ADR-018) prüft beforeAcceptInvitation beim Beitritt.
		if (!org) return { ok: false, error: "not_found" };
	}

	const { user: created } = await auth.api.createUser({
		body: { email, name: input.name },
		headers: requestHeaders,
	});
	const expiresAt = new Date(Date.now() + ACTIVATION_MS);
	let invitationId: string | null = null;
	let url: string;
	try {
		if (orgId && role) {
			// wie cancelPendingInvitationsOnReInvite: alte Einladungen derselben
			// Adresse in dieser Org gelten nicht mehr
			await globalDb
				.update(invitation)
				.set({ status: "canceled" })
				.where(
					and(
						eq(invitation.organizationId, orgId),
						eq(invitation.email, email),
						eq(invitation.status, "pending"),
					),
				);
			const [inv] = await globalDb
				.insert(invitation)
				.values({
					organizationId: orgId,
					email,
					role,
					status: "pending",
					expiresAt,
					inviterId: actor.userId,
				})
				.returning({ id: invitation.id });
			invitationId = inv?.id ?? null;
		}
		({ url } = await issueRegistrationLink(
			{
				kind: "activate",
				userId: created.id,
				email,
				...(invitationId ? { invitationId } : {}),
			},
			expiresAt,
		));
	} catch (err) {
		// Ohne Aktivierungsmarker wäre das Konto „aktiv“ ohne Faktor (Mail-
		// Notweg offen) — dann lieber gar kein Konto.
		await globalDb.delete(user).where(eq(user.id, created.id));
		if (invitationId)
			await globalDb.delete(invitation).where(eq(invitation.id, invitationId));
		throw err;
	}

	if (invitationId && orgId)
		await auditPlatform(actorOf(actor), {
			action: "org.invitation_created",
			target: `invitation:${invitationId}`,
			organizationId: orgId,
			after: { role, via: "platform_admin" },
		});
	const mailed = input.sendMail
		? await sendActivation({ to: email, name: input.name, url, invitationId })
		: null;
	await auditPlatform(actorOf(actor), {
		action: "admin.activation_link",
		target: `user:${created.id}`,
		after: {
			created: true,
			organizationId: orgId,
			role,
			mailed,
			expiresAt: expiresAt.toISOString(),
		},
	});
	return {
		ok: true,
		data: { userId: created.id, url, mailed, expiresAt },
	};
}

async function pendingAccount(userId: string) {
	const payload = await activationPayload(userId);
	if (!payload) return null;
	const [u] = await globalDb
		.select({
			id: user.id,
			email: user.email,
			name: user.name,
			banned: user.banned,
			banExpires: user.banExpires,
		})
		.from(user)
		.where(eq(user.id, userId))
		.limit(1);
	return u ? { user: u, payload } : null;
}

// Neuer Link für ein noch nicht aktiviertes Konto: ersetzt den alten,
// verlängert die offene Einladung aus der Anlage.
export async function renewActivationLink(
	userId: string,
	sendMail: boolean,
	actor: AdminActor,
): Promise<Result<ActivationLink>> {
	const p = await pendingAccount(userId);
	if (!p) return { ok: false, error: "not_pending" };
	if (isBanActive(p.user)) return { ok: false, error: "account_blocked" };
	const expiresAt = new Date(Date.now() + ACTIVATION_MS);
	let invitationId = p.payload.invitationId ?? null;
	if (invitationId) {
		const [inv] = await globalDb
			.update(invitation)
			.set({ expiresAt })
			.where(
				and(eq(invitation.id, invitationId), eq(invitation.status, "pending")),
			)
			.returning({ id: invitation.id });
		if (!inv) invitationId = null;
	}
	const { url } = await issueRegistrationLink(
		{
			kind: "activate",
			userId,
			email: p.user.email,
			...(invitationId ? { invitationId } : {}),
		},
		expiresAt,
	);
	const mailed = sendMail
		? await sendActivation({
				to: p.user.email,
				name: p.user.name,
				url,
				invitationId,
			})
		: null;
	await auditPlatform(actorOf(actor), {
		action: "admin.activation_link",
		target: `user:${userId}`,
		after: { renewed: true, mailed, expiresAt: expiresAt.toISOString() },
	});
	return { ok: true, data: { userId, url, mailed, expiresAt } };
}

// Anlage zurücknehmen (Tippfehler, falsche Person): nur solange das Konto
// nie aktiviert wurde — kein Passkey, keine Mitgliedschaft.
export async function withdrawAccount(
	userId: string,
	requestHeaders: Headers,
): Promise<Result<undefined>> {
	const p = await pendingAccount(userId);
	if (!p) return { ok: false, error: "not_pending" };
	const [[pk], [m]] = await Promise.all([
		globalDb
			.select({ id: passkey.id })
			.from(passkey)
			.where(eq(passkey.userId, userId))
			.limit(1),
		globalDb
			.select({ id: member.id })
			.from(member)
			.where(eq(member.userId, userId))
			.limit(1),
	]);
	if (pk || m) return { ok: false, error: "not_pending" };
	// Erst das Konto, dann Link und Einladung — scheitert das Löschen, bleibt
	// der Aktivierungsmarker (sonst stünde ein Konto ohne Faktor offen).
	// Audit admin.remove_user über authAfterHook (lib/auth/audit-events.ts).
	await auth.api.removeUser({ body: { userId }, headers: requestHeaders });
	if (p.payload.invitationId)
		await globalDb
			.update(invitation)
			.set({ status: "canceled" })
			.where(
				and(
					eq(invitation.id, p.payload.invitationId),
					eq(invitation.status, "pending"),
				),
			);
	await revokeRegistrationLinks({ userId, kind: "activate" });
	return { ok: true, data: undefined };
}
