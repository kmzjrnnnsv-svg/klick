import { and, desc, eq, gt, inArray, isNull, sql } from "drizzle-orm";
import { type DbTx, globalDb } from "@/db";
import { member, organization, passkey, session, user } from "@/db/auth-schema";
import { auditLog, memberAccess } from "@/db/schema";
import { USER_EVENT_ACTIONS } from "@/lib/admin/users";

// Lader für Admin > Nutzer:innen > [Person] (Admin-Portal, Teil 3). Nur
// Betriebsdaten des Kontos: Faktoren, Sitzungen, Mitgliedschaften, Auth-
// Ereignisse aus dem Plattform-Protokoll. Was die Person in einer Org getan
// hat, steht in deren Kette und bleibt hinter der Lockbox. user, session,
// passkey, member und organization tragen keine RLS (ADR-009).

export async function adminUser(userId: string) {
	const [u] = await globalDb
		.select({
			id: user.id,
			name: user.name,
			email: user.email,
			emailVerified: user.emailVerified,
			role: user.role,
			banned: user.banned,
			banReason: user.banReason,
			banExpires: user.banExpires,
			twoFactorEnabled: user.twoFactorEnabled,
			createdAt: user.createdAt,
		})
		.from(user)
		.where(eq(user.id, userId))
		.limit(1);
	return u ?? null;
}

export async function adminUserPasskeys(userId: string) {
	return globalDb
		.select({
			id: passkey.id,
			name: passkey.name,
			deviceType: passkey.deviceType,
			backedUp: passkey.backedUp,
			createdAt: passkey.createdAt,
		})
		.from(passkey)
		.where(eq(passkey.userId, userId))
		.orderBy(desc(passkey.createdAt));
}

export async function adminUserMemberships(userId: string) {
	return globalDb
		.select({
			memberId: member.id,
			orgId: organization.id,
			orgName: organization.name,
			orgSlug: organization.slug,
			role: member.role,
			since: member.createdAt,
		})
		.from(member)
		.innerJoin(organization, eq(organization.id, member.organizationId))
		.where(eq(member.userId, userId))
		.orderBy(organization.name);
}

// Zugang bis … für externe Mitgliedschaften (member_access ist FORCE RLS):
// nur im Plattform-Scope (withPlatform, auditiert).
export async function adminMemberAccess(
	tx: DbTx,
	memberIds: readonly string[],
): Promise<Map<string, Date | null>> {
	if (memberIds.length === 0) return new Map();
	const rows = await tx
		.select({
			memberId: memberAccess.memberId,
			accessUntil: memberAccess.accessUntil,
		})
		.from(memberAccess)
		.where(inArray(memberAccess.memberId, [...memberIds]));
	return new Map(rows.map((r) => [r.memberId, r.accessUntil]));
}

export type AdminSession = {
	id: string;
	createdAt: Date;
	lastActiveAt: Date | null;
	expiresAt: Date;
	ipAddress: string | null;
	userAgent: string | null;
	orgName: string | null;
	impersonated: boolean;
	mfa: boolean;
};

// Laufende Sitzungen (nicht abgelaufen); Leerlauf und absolute Grenze prüft
// erst der Guard, deshalb zeigt die Seite auch „zuletzt aktiv“.
export async function adminUserSessions(
	userId: string,
	now: Date,
): Promise<AdminSession[]> {
	const rows = await globalDb
		.select({
			id: session.id,
			createdAt: session.createdAt,
			lastActiveAt: session.lastActiveAt,
			updatedAt: session.updatedAt,
			expiresAt: session.expiresAt,
			ipAddress: session.ipAddress,
			userAgent: session.userAgent,
			orgName: organization.name,
			impersonatedBy: session.impersonatedBy,
			mfaVerifiedAt: session.mfaVerifiedAt,
		})
		.from(session)
		// active_organization_id ist Text (Better Auth), organization.id uuid
		.leftJoin(
			organization,
			sql`${organization.id}::text = ${session.activeOrganizationId}`,
		)
		.where(and(eq(session.userId, userId), gt(session.expiresAt, now)))
		.orderBy(desc(session.createdAt))
		.limit(50);
	return rows.map((r) => ({
		id: r.id,
		createdAt: r.createdAt,
		lastActiveAt: r.lastActiveAt ?? r.updatedAt ?? null,
		expiresAt: r.expiresAt,
		ipAddress: r.ipAddress,
		userAgent: r.userAgent,
		orgName: r.orgName ?? null,
		impersonated: Boolean(r.impersonatedBy),
		mfa: Boolean(r.mfaVerifiedAt),
	}));
}

// Auth-Ereignisse der Person im Plattform-Protokoll (Anmeldungen, Faktoren,
// Sperren): eigene Aktionen (Akteur) und Admin-Aktionen an ihr (Ziel).
export async function adminUserEvents(tx: DbTx, userId: string, limit = 30) {
	const cols = {
		id: auditLog.id,
		at: auditLog.at,
		action: auditLog.action,
		outcome: auditLog.outcome,
		actorUserId: auditLog.actorUserId,
		ip: auditLog.ip,
		userAgent: auditLog.userAgent,
	};
	// Nacheinander: eine Transaktion, eine Verbindung
	const own = await tx
		.select(cols)
		.from(auditLog)
		.where(
			and(
				isNull(auditLog.organizationId),
				eq(auditLog.actorUserId, userId),
				inArray(auditLog.action, [...USER_EVENT_ACTIONS]),
			),
		)
		.orderBy(desc(auditLog.seq))
		.limit(limit);
	const onUser = await tx
		.select(cols)
		.from(auditLog)
		.where(
			and(
				isNull(auditLog.organizationId),
				eq(auditLog.target, `user:${userId}`),
			),
		)
		.orderBy(desc(auditLog.seq))
		.limit(limit);
	const seen = new Set<string>();
	return [...own, ...onUser]
		.filter((r) => {
			if (seen.has(r.id)) return false;
			seen.add(r.id);
			return true;
		})
		.sort((a, b) => b.at.getTime() - a.at.getTime())
		.slice(0, limit);
}
