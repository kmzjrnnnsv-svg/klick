import { eq } from "drizzle-orm";
import { globalDb } from "@/db";
import {
	member,
	passkey,
	session as sessionTable,
	twoFactor,
	user,
} from "@/db/auth-schema";
import { auditPlatform } from "@/lib/audit";
import { sendTransactionalMail } from "@/lib/mail/send";
import { transactionalEmail } from "@/lib/mail/templates";
import { issueRegistrationLink } from "./registration-link";

// Zugang zurücksetzen (ADR-019): Passkey verloren, Gerät weg. Owner (für
// Mitglieder nur ihrer Org), Plattform-Admins und die CLI (`pnpm
// auth:recover`) entfernen alle Faktoren und Sitzungen und bekommen einen
// Einmal-Link /zugang#klk_recover_… (24 h), über den die Person einen neuen
// Passkey anlegt. Die Person bekommt eine Mail, dass es passiert ist.

const RECOVER_MS = 24 * 60 * 60 * 1000;

export type ResetTarget = {
	id: string;
	email: string;
	name: string;
	role: string | null;
};

export async function findResetTarget(
	userId: string,
): Promise<(ResetTarget & { orgIds: string[] }) | null> {
	const [u] = await globalDb
		.select({
			id: user.id,
			email: user.email,
			name: user.name,
			role: user.role,
		})
		.from(user)
		.where(eq(user.id, userId))
		.limit(1);
	if (!u) return null;
	const orgs = await globalDb
		.select({ orgId: member.organizationId })
		.from(member)
		.where(eq(member.userId, userId));
	return { ...u, orgIds: orgs.map((o) => o.orgId) };
}

export async function resetUserAccess(input: {
	target: ResetTarget;
	actor: {
		userId: string | null;
		label: string;
		ip?: string | null;
		userAgent?: string | null;
	};
	organizationId?: string | null;
	via: "owner" | "platform_admin" | "cli";
}): Promise<{ url: string; expiresAt: Date }> {
	const { target } = input;
	await globalDb.transaction(async (tx) => {
		await tx.delete(sessionTable).where(eq(sessionTable.userId, target.id));
		await tx.delete(passkey).where(eq(passkey.userId, target.id));
		await tx.delete(twoFactor).where(eq(twoFactor.userId, target.id));
		await tx
			.update(user)
			.set({ twoFactorEnabled: false })
			.where(eq(user.id, target.id));
	});
	const expiresAt = new Date(Date.now() + RECOVER_MS);
	const { url } = await issueRegistrationLink(
		{ kind: "recover", userId: target.id, email: target.email },
		expiresAt,
	);
	await auditPlatform(
		{
			userId: input.actor.userId,
			ip: input.actor.ip ?? null,
			userAgent: input.actor.userAgent ?? null,
		},
		{
			action:
				input.via === "cli" ? "auth.recover_link_cli" : "auth.access_reset",
			target: `user:${target.id}`,
			organizationId: input.organizationId ?? null,
			after: { via: input.via },
		},
	);
	// Hinweis an die Person — ohne Link: den gibt die zurücksetzende Person
	// auf einem vertrauenswürdigen Weg weiter.
	const tpl = transactionalEmail({
		subject: "Dein Zugang zu Klick wurde zurückgesetzt",
		eyebrow: "Sicherheit",
		title: "Dein Zugang wurde zurückgesetzt.",
		body: `${input.actor.label} hat deine Passkeys und Codes entfernt und alle Sitzungen beendet. Du bekommst von ${input.actor.label} einen Link, mit dem du einen neuen Passkey anlegst (24 Stunden gültig). Wenn du das nicht erwartet hast, melde dich sofort bei deiner Organisation.`,
	});
	void sendTransactionalMail({
		to: target.email,
		subject: tpl.subject,
		text: tpl.text,
		html: tpl.html,
	});
	return { url, expiresAt };
}
