import {
	and,
	desc,
	eq,
	gt,
	inArray,
	isNotNull,
	isNull,
	lt,
	ne,
	sql,
} from "drizzle-orm";
import { type DbTx, globalDb } from "@/db";
import { member, session, user } from "@/db/auth-schema";
import {
	notifications,
	platformAccessGrants,
	roleAssignments,
} from "@/db/schema";
import type { PlatformAccessGrant } from "@/db/schema/platform-access";
import { effectiveAssignment } from "@/lib/compliance/appointments";
import { TOP_MANAGEMENT_FUNCTION } from "@/lib/compliance/top-management";
import { notifyPlatformAdmins } from "@/lib/notifications/notify";
import { findActiveGrant } from "@/lib/platform-access/rules";

// Lesezugriffe der Lockbox (Härtung A3) ohne Org-Kontext: Prüfen, ob ein
// Plattform-Zugriff freigegeben ist, und wen ein Antrag erreicht. Liest im
// Plattform-Scope, aber ohne Eintrag `platform.access` — das ist keine
// Einsicht in Inhalte, sondern die Prüfung davor. Nur für
// lib/platform-access/service.ts, die Auth-Hooks und den Tick (Erinnerung an
// überfällige Notfall-Berichte).

async function platformRead<T>(fn: (tx: DbTx) => Promise<T>): Promise<T> {
	return globalDb.transaction(async (tx) => {
		await tx.execute(sql`select set_config('app.scope', 'platform', true)`);
		return fn(tx);
	});
}

export function grantsForOrg(orgId: string): Promise<PlatformAccessGrant[]> {
	return platformRead((tx) =>
		tx
			.select()
			.from(platformAccessGrants)
			.where(eq(platformAccessGrants.organizationId, orgId))
			.orderBy(desc(platformAccessGrants.requestedAt)),
	);
}

export function grantById(id: string): Promise<PlatformAccessGrant | null> {
	return platformRead(async (tx) => {
		const [g] = await tx
			.select()
			.from(platformAccessGrants)
			.where(eq(platformAccessGrants.id, id))
			.limit(1);
		return g ?? null;
	});
}

/** Alle Freigaben (Admin-Übersicht: Metadaten, keine Inhalte der Org). */
export function allGrants(limit = 200): Promise<PlatformAccessGrant[]> {
	return platformRead((tx) =>
		tx
			.select()
			.from(platformAccessGrants)
			.orderBy(desc(platformAccessGrants.requestedAt))
			.limit(limit),
	);
}

/** Wer über Plattform-Zugriffe entscheidet: Inhaber:innen und bestellte GL. */
export async function deciderIds(orgId: string): Promise<string[]> {
	const owners = await globalDb
		.select({ id: member.userId })
		.from(member)
		.where(and(eq(member.organizationId, orgId), eq(member.role, "owner")));
	const gl = await platformRead((tx) =>
		tx
			.select({
				userId: roleAssignments.userId,
				deputyUserId: roleAssignments.deputyUserId,
			})
			.from(roleAssignments)
			.where(
				and(
					eq(roleAssignments.organizationId, orgId),
					eq(roleAssignments.function, TOP_MANAGEMENT_FUNCTION),
					effectiveAssignment(),
				),
			),
	);
	const ids = new Set<string>(owners.map((o) => o.id));
	for (const r of gl) {
		if (r.userId) ids.add(r.userId);
		if (r.deputyUserId) ids.add(r.deputyUserId);
	}
	return [...ids];
}

export async function memberIds(orgId: string): Promise<string[]> {
	const rows = await globalDb
		.select({ id: member.userId })
		.from(member)
		.where(eq(member.organizationId, orgId));
	return rows.map((r) => r.id);
}

/** Eigene Mitgliedschaft (nicht als Berater:in), sonst null (ADR-018). */
export async function primaryOrgOf(userId: string): Promise<string | null> {
	const [row] = await globalDb
		.select({ orgId: member.organizationId })
		.from(member)
		.where(and(eq(member.userId, userId), ne(member.role, "consultant")))
		.limit(1);
	return row?.orgId ?? null;
}

/** Alle Orgs, in denen die Person Mitglied ist (auch als Berater:in). */
export async function memberOrgIds(userId: string): Promise<string[]> {
	const rows = await globalDb
		.select({ orgId: member.organizationId })
		.from(member)
		.where(eq(member.userId, userId));
	return [...new Set(rows.map((r) => r.orgId))];
}

/**
 * Impersonation-Sitzung noch gedeckt? Nur solange in genau dieser Org eine
 * Freigabe „impersonate“ für die Person gilt (Ablauf, Widerruf). Geprüft bei
 * jeder Anfrage (requireOrg), nicht nur beim Anmelden.
 */
export async function impersonationAllowed(
	userId: string,
	orgId: string,
	impersonator: string,
	now = new Date(),
): Promise<boolean> {
	return Boolean(
		findActiveGrant(
			await grantsForOrg(orgId),
			{ scope: "impersonate", targetUserId: userId, requestedBy: impersonator },
			now,
		),
	);
}

/** Laufende Impersonation-Sitzungen einer Person beenden (Widerruf, Ablauf). */
export async function endImpersonations(userId: string): Promise<number> {
	const rows = await globalDb
		.delete(session)
		.where(and(eq(session.userId, userId), isNotNull(session.impersonatedBy)))
		.returning({ id: session.id });
	return rows.length;
}

export async function isMemberOf(
	orgId: string,
	userId: string,
): Promise<boolean> {
	const [row] = await globalDb
		.select({ id: member.id })
		.from(member)
		.where(and(eq(member.organizationId, orgId), eq(member.userId, userId)))
		.limit(1);
	return Boolean(row);
}

export async function userLabels(
	ids: readonly (string | null)[],
): Promise<Map<string, string>> {
	const list = [...new Set(ids.filter((i): i is string => Boolean(i)))];
	if (list.length === 0) return new Map();
	const rows = await globalDb
		.select({ id: user.id, name: user.name, email: user.email })
		.from(user)
		.where(inArray(user.id, list));
	return new Map(rows.map((r) => [r.id, r.name || r.email]));
}

/**
 * Tick: Notfall-Zugriffe ohne Bericht nach Fristablauf (24 h) erinnern die
 * Plattform-Admins, je Antrag höchstens einmal am Tag. Die Org sieht den
 * Verzug ohnehin in Einstellungen > Zugriffe durch Klick.
 */
export async function remindOverdueReports(now: Date): Promise<number> {
	return platformRead(async (tx) => {
		const due = await tx
			.select({
				id: platformAccessGrants.id,
				reportDueAt: platformAccessGrants.reportDueAt,
			})
			.from(platformAccessGrants)
			.where(
				and(
					isNotNull(platformAccessGrants.emergencyCategory),
					isNull(platformAccessGrants.reportedAt),
					lt(platformAccessGrants.reportDueAt, now),
				),
			);
		let sent = 0;
		for (const g of due) {
			const dedupeKey = `lockbox-report:${g.id}`;
			const [recent] = await tx
				.select({ id: notifications.id })
				.from(notifications)
				.where(
					and(
						sql`${notifications.payload}->>'dedupeKey' = ${dedupeKey}`,
						gt(
							notifications.createdAt,
							new Date(now.getTime() - 24 * 60 * 60 * 1000),
						),
					),
				)
				.limit(1);
			if (recent) continue;
			sent += await notifyPlatformAdmins(tx, {
				kind: "platform_access",
				title: "Bericht zum Notfall-Zugriff überfällig",
				body: "Die Organisation wartet auf deinen Bericht: was passiert ist, was eingesehen oder geändert wurde, was folgt.",
				link: "/admin/zugriffe",
				payload: { dedupeKey, grantId: g.id },
			});
		}
		return sent;
	});
}
