import { and, desc, eq, gte, inArray, isNull } from "drizzle-orm";
import { type DbTx, globalDb } from "@/db";
import { organization, user } from "@/db/auth-schema";
import { auditLog } from "@/db/schema";
import { type ChainCheck, SECURITY_EVENT_ACTIONS } from "@/lib/admin/security";

// Lader für Admin > Sicherheit (Admin-Portal, Teil 4). Nur das Plattform-
// Protokoll (organization_id null): Ereignisse in der Kette einer Org bleiben
// hinter der Lockbox. Aufruf im Plattform-Scope (withPlatform, auditiert).

export async function securityEvents(tx: DbTx, since: Date, limit = 2000) {
	return tx
		.select({
			id: auditLog.id,
			action: auditLog.action,
			outcome: auditLog.outcome,
			at: auditLog.at,
			actorUserId: auditLog.actorUserId,
			target: auditLog.target,
			userAgent: auditLog.userAgent,
		})
		.from(auditLog)
		.where(
			and(
				isNull(auditLog.organizationId),
				inArray(auditLog.action, SECURITY_EVENT_ACTIONS),
				gte(auditLog.at, since),
			),
		)
		.orderBy(desc(auditLog.seq))
		.limit(limit);
}

export async function lastChainCheck(tx: DbTx): Promise<ChainCheck | null> {
	const [row] = await tx
		.select({ at: auditLog.at, after: auditLog.after })
		.from(auditLog)
		.where(
			and(
				isNull(auditLog.organizationId),
				eq(auditLog.action, "audit.chain_verified"),
			),
		)
		.orderBy(desc(auditLog.seq))
		.limit(1);
	if (!row) return null;
	const after = (row.after ?? {}) as { checked?: unknown; broken?: unknown };
	return {
		at: row.at,
		checked: typeof after.checked === "number" ? after.checked : 0,
		broken: Array.isArray(after.broken)
			? after.broken.filter((b): b is string => typeof b === "string")
			: [],
	};
}

/** Namen für Konten und Orgs, die auf der Seite erscheinen. */
export async function securityNames(userIds: string[], orgIds: string[]) {
	const [users, orgs] = await Promise.all([
		userIds.length
			? globalDb
					.select({ id: user.id, name: user.name, email: user.email })
					.from(user)
					.where(inArray(user.id, userIds))
			: [],
		orgIds.length
			? globalDb
					.select({ id: organization.id, name: organization.name })
					.from(organization)
					.where(inArray(organization.id, orgIds))
			: [],
	]);
	return {
		users: new Map(users.map((u) => [u.id, u.name || u.email])),
		orgs: new Map(orgs.map((o) => [o.id, o.name])),
	};
}
