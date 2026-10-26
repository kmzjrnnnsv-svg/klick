import { and, eq, isNull } from "drizzle-orm";
import { platformAccessGrants } from "@/db/schema";
import type { PlatformAccessScope } from "@/db/schema/enums";
import type { PlatformAccessGrant } from "@/db/schema/platform-access";
import { audit } from "@/lib/audit";
import type { OrgContext, PlatformAdminContext } from "@/lib/auth/guards";
import { topManagementOf } from "@/lib/compliance/top-management";
import {
	allGrants,
	deciderIds,
	endImpersonations,
	grantById,
	grantsForOrg,
	isMemberOf,
	memberIds,
} from "@/lib/db/platform-access";
import { mutateOrg, withPlatform } from "@/lib/db/with-org";
import { notify } from "@/lib/notifications/notify";
import type { ActionResult } from "@/lib/validation/common";
import {
	approvedExpiry,
	canDecide,
	canRevoke,
	findActiveGrant,
	grantActive,
	initialGrant,
	type RequestInput,
	SCOPE_SINGLE_USE,
	validateRequest,
} from "./rules";

// Lockbox (Härtung A3, ADR-027): Antrag der Plattform, Entscheidung der Org,
// Nutzung mit Eintrag in der Protokollkette der Org. Regeln pure in
// rules.ts; hier nur Laden, Schreiben, Benachrichtigen.

export const SCOPE_LABEL: Record<PlatformAccessScope, string> = {
	view: "Protokoll einsehen",
	impersonate: "Als Person anmelden",
	reset_access: "Zugang zurücksetzen",
};

class LockboxError extends Error {
	constructor(readonly code: string) {
		super(code);
	}
}

const SETTINGS_LINK = "/einstellungen?tab=zugriffe";

export async function requestPlatformAccess(
	admin: PlatformAdminContext,
	input: RequestInput & { orgId: string },
): Promise<ActionResult<{ id: string }>> {
	const err = validateRequest(input);
	if (err) return { ok: false, error: `lockbox_${err}` };
	if (
		input.targetUserId &&
		!(await isMemberOf(input.orgId, input.targetUserId))
	)
		return { ok: false, error: "lockbox_target_not_member" };
	const deciders = await deciderIds(input.orgId);
	// Wartezeit nur, wenn sonst niemand freigeben kann (z. B. die einzige
	// Inhaber:in ist ausgesperrt)
	const others = deciders.filter(
		(d) => d !== input.targetUserId && d !== admin.userId,
	);
	if (input.waiting && others.length > 0)
		return { ok: false, error: "lockbox_waiting_not_needed" };

	const now = new Date();
	const fields = initialGrant(input, now);
	const label = SCOPE_LABEL[input.scope];
	const recipients = input.waiting ? await memberIds(input.orgId) : deciders;
	const notice = input.emergency
		? {
				title: `Notfall-Zugriff durch Klick: ${label}`,
				body: `Der Klick-Betrieb greift wegen ${input.emergency === "legal_order" ? "einer behördlichen Anordnung" : "eines Sicherheitsvorfalls"} sofort zu (höchstens 4 Stunden). Begründung: ${input.reason}. Ein Bericht folgt binnen 24 Stunden; du kannst den Zugriff jederzeit beenden.`,
				action: "platform_access.emergency",
			}
		: input.waiting
			? {
					title: "Zugang wird in 24 Stunden zurückgesetzt",
					body: `Der Klick-Betrieb setzt den Zugang einer Person deiner Organisation zurück, weil niemand freigeben kann. Begründung: ${input.reason}. Wenn das nicht stimmt, brich es unter Einstellungen > Zugriffe durch Klick ab.`,
					action: "platform_access.waiting",
				}
			: {
					title: `Klick bittet um Zugriff: ${label}`,
					body: `Begründung: ${input.reason}. Dauer nach Freigabe: ${input.durationMinutes} Minuten.`,
					action: "platform_access.requested",
				};

	const id = await withPlatform(
		{
			userId: admin.userId,
			reason: `Lockbox: Antrag ${input.scope}`,
			ip: admin.ip,
			userAgent: admin.userAgent,
		},
		async (tx) => {
			const [row] = await tx
				.insert(platformAccessGrants)
				.values({
					organizationId: input.orgId,
					scope: input.scope,
					targetUserId: input.targetUserId,
					reason: input.reason.trim(),
					durationMinutes: input.durationMinutes,
					requestedBy: admin.userId,
					requestedAt: now,
					...fields,
				})
				.returning({ id: platformAccessGrants.id });
			const grantId = row?.id as string;
			await notify(tx, {
				orgId: input.orgId,
				recipients,
				actorUserId: admin.userId,
				kind: "platform_access",
				title: notice.title,
				body: notice.body,
				link: SETTINGS_LINK,
				payload: { grantId },
			});
			// in die Kette der Org, nicht nur ins Plattform-Protokoll
			await audit(
				tx,
				{ userId: admin.userId, ip: admin.ip, userAgent: admin.userAgent },
				{
					organizationId: input.orgId,
					action: notice.action,
					target: `platform_access_grant:${grantId}`,
					after: {
						scope: input.scope,
						targetUserId: input.targetUserId,
						durationMinutes: input.durationMinutes,
						reason: input.reason.trim(),
						emergencyCategory: input.emergency,
						applyAfter: fields.applyAfter?.toISOString() ?? null,
					},
				},
			);
			return grantId;
		},
	);
	return { ok: true, data: { id } };
}

async function mayDecide(
	tx: Parameters<Parameters<typeof mutateOrg>[1]>[0],
	ctx: OrgContext,
): Promise<boolean> {
	if (ctx.orgRole === "owner") return true;
	return (await topManagementOf(tx, ctx.orgId, ctx.userId)).isTopManagement;
}

async function lockedGrant(
	tx: Parameters<Parameters<typeof mutateOrg>[1]>[0],
	orgId: string,
	id: string,
): Promise<PlatformAccessGrant> {
	const [g] = await tx
		.select()
		.from(platformAccessGrants)
		.where(
			and(
				eq(platformAccessGrants.id, id),
				eq(platformAccessGrants.organizationId, orgId),
			),
		)
		.for("update")
		.limit(1);
	if (!g) throw new LockboxError("not_found");
	return g;
}

function mapLockbox(e: unknown): ActionResult<never> {
	if (e instanceof LockboxError) return { ok: false, error: e.code };
	throw e;
}

/** Inhaber:in oder GL gibt frei bzw. lehnt ab (Step-up in der Action). */
export async function decidePlatformAccess(
	ctx: OrgContext,
	input: { id: string; approve: boolean; note: string | null },
): Promise<ActionResult> {
	try {
		await mutateOrg(ctx, async (tx) => {
			const g = await lockedGrant(tx, ctx.orgId, input.id);
			const now = new Date();
			const e = canDecide(
				g,
				{ userId: ctx.userId, mayDecide: await mayDecide(tx, ctx) },
				now,
			);
			if (e) throw new LockboxError(`lockbox_${e}`);
			const after = input.approve
				? { status: "approved" as const, expiresAt: approvedExpiry(g, now) }
				: { status: "denied" as const, expiresAt: null };
			await tx
				.update(platformAccessGrants)
				.set({
					...after,
					decidedBy: ctx.userId,
					decidedAt: now,
					decisionNote: input.note?.trim() || null,
				})
				.where(eq(platformAccessGrants.id, g.id));
			return {
				result: undefined,
				audit: {
					action: input.approve
						? "platform_access.approved"
						: "platform_access.denied",
					target: `platform_access_grant:${g.id}`,
					before: { status: g.status },
					after: {
						status: after.status,
						expiresAt: after.expiresAt?.toISOString() ?? null,
						note: input.note?.trim() || null,
					},
				},
			};
		});
		return { ok: true, data: undefined };
	} catch (e) {
		return mapLockbox(e);
	}
}

/** Abbrechen bzw. beenden — auch die betroffene Person darf. */
export async function revokePlatformAccess(
	ctx: OrgContext,
	id: string,
): Promise<ActionResult> {
	try {
		const g = await mutateOrg(ctx, async (tx) => {
			const g = await lockedGrant(tx, ctx.orgId, id);
			const now = new Date();
			const e = canRevoke(
				g,
				{
					userId: ctx.userId,
					mayDecide: await mayDecide(tx, ctx),
					isTarget: g.targetUserId === ctx.userId,
				},
				now,
			);
			if (e) throw new LockboxError(`lockbox_${e}`);
			const status = g.status === "requested" ? "cancelled" : "revoked";
			await tx
				.update(platformAccessGrants)
				.set({ status, revokedBy: ctx.userId, revokedAt: now })
				.where(eq(platformAccessGrants.id, g.id));
			return {
				result: g,
				audit: {
					action: "platform_access.revoked",
					target: `platform_access_grant:${g.id}`,
					before: { status: g.status },
					after: { status },
				},
			};
		});
		// laufende Impersonation endet sofort, nicht erst beim nächsten Klick
		if (g.scope === "impersonate" && g.targetUserId)
			await endImpersonations(g.targetUserId);
		return { ok: true, data: undefined };
	} catch (e) {
		return mapLockbox(e);
	}
}

/** Bericht der Plattform nach einem Notfall-Zugriff. */
export async function reportEmergency(
	admin: PlatformAdminContext,
	input: { id: string; report: string },
): Promise<ActionResult> {
	const text = input.report.trim();
	if (text.length < 20) return { ok: false, error: "lockbox_report" };
	const g = await grantById(input.id);
	if (!g?.emergencyCategory) return { ok: false, error: "not_found" };
	if (g.reportedAt) return { ok: false, error: "lockbox_reported" };
	// berichtet, wer zugegriffen hat (gelöschtes Konto: jede:r Admin)
	if (g.requestedBy && g.requestedBy !== admin.userId)
		return { ok: false, error: "forbidden" };
	await withPlatform(
		{
			userId: admin.userId,
			reason: "Lockbox: Bericht zum Notfall-Zugriff",
			ip: admin.ip,
			userAgent: admin.userAgent,
		},
		async (tx) => {
			const now = new Date();
			await tx
				.update(platformAccessGrants)
				.set({ report: text, reportedAt: now })
				.where(eq(platformAccessGrants.id, g.id));
			await notify(tx, {
				orgId: g.organizationId,
				recipients: await deciderIds(g.organizationId),
				actorUserId: admin.userId,
				kind: "platform_access",
				title: "Bericht zum Notfall-Zugriff durch Klick",
				body: text.slice(0, 500),
				link: SETTINGS_LINK,
				payload: { grantId: g.id },
			});
			await audit(
				tx,
				{ userId: admin.userId, ip: admin.ip, userAgent: admin.userAgent },
				{
					organizationId: g.organizationId,
					action: "platform_access.reported",
					target: `platform_access_grant:${g.id}`,
					after: { report: text },
				},
			);
		},
	);
	return { ok: true, data: undefined };
}

export type GrantUse = {
	orgId: string;
	scope: PlatformAccessScope;
	targetUserId?: string | null;
	actor: {
		userId: string | null;
		ip?: string | null;
		userAgent?: string | null;
	};
	/** was gerade geschieht (steht im Protokoll der Org) */
	purpose: string;
};

/**
 * Gilt eine Freigabe? Dann Nutzung in der Kette der Org vermerken und die
 * Freigabe zurückgeben, sonst null (Aufrufer lehnt ab).
 */
export async function consumeGrant(
	use: GrantUse,
): Promise<PlatformAccessGrant | null> {
	const now = new Date();
	const grant = findActiveGrant(
		await grantsForOrg(use.orgId),
		{
			scope: use.scope,
			targetUserId: use.targetUserId ?? null,
			// ohne Person keine Freigabe (fail closed)
			requestedBy: use.actor.userId ?? "",
		},
		now,
	);
	if (!grant) return null;
	const used = await withPlatform(
		{
			userId: use.actor.userId,
			reason: `Lockbox: ${SCOPE_LABEL[use.scope]}`,
			ip: use.actor.ip,
			userAgent: use.actor.userAgent,
		},
		async (tx) => {
			// einmalige Freigabe nur, wenn sie in dieser Transaktion noch frei
			// ist — zwei gleichzeitige Vorgänge verbrauchen sie nicht beide
			if (SCOPE_SINGLE_USE[use.scope]) {
				const taken = await tx
					.update(platformAccessGrants)
					.set({ usedAt: now })
					.where(
						and(
							eq(platformAccessGrants.id, grant.id),
							isNull(platformAccessGrants.usedAt),
						),
					)
					.returning({ id: platformAccessGrants.id });
				if (taken.length === 0) return false;
			} else if (!grant.usedAt)
				await tx
					.update(platformAccessGrants)
					.set({ usedAt: now })
					.where(eq(platformAccessGrants.id, grant.id));
			await audit(
				tx,
				{
					userId: use.actor.userId,
					ip: use.actor.ip ?? null,
					userAgent: use.actor.userAgent ?? null,
				},
				{
					organizationId: use.orgId,
					action: "platform_access.used",
					target: `platform_access_grant:${grant.id}`,
					after: {
						scope: use.scope,
						targetUserId: use.targetUserId ?? null,
						purpose: use.purpose,
					},
				},
			);
			return true;
		},
	);
	return used ? grant : null;
}

/**
 * Zugriff auf eine Person, die in mehreren Orgs Mitglied ist (eigene Org und
 * Berater-Zugänge, ADR-018): erst prüfen, ob jede dieser Orgs freigegeben
 * hat, dann jede Nutzung in ihrer Kette vermerken. Fehlt eine, wird nichts
 * verbraucht.
 */
export async function consumeGrantsForAll(
	orgIds: readonly string[],
	use: Omit<GrantUse, "orgId">,
): Promise<boolean> {
	const now = new Date();
	for (const orgId of orgIds)
		if (
			!findActiveGrant(
				await grantsForOrg(orgId),
				{
					scope: use.scope,
					targetUserId: use.targetUserId ?? null,
					// ohne Person keine Freigabe (fail closed)
					requestedBy: use.actor.userId ?? "",
				},
				now,
			)
		)
			return false;
	for (const orgId of orgIds)
		if (!(await consumeGrant({ ...use, orgId }))) return false;
	return true;
}

/**
 * Orgs, deren Protokoll die Plattform gerade einsehen darf (Freigabe „view“).
 * Jede Einsicht steht als Nutzung in der Kette der Org.
 */
export async function viewableOrgs(
	actor: GrantUse["actor"],
	purpose: string,
): Promise<string[]> {
	const now = new Date();
	const grants = await allGrants(1000);
	const orgs = [
		...new Set(
			grants
				.filter((g) => g.scope === "view" && grantActive(g, now))
				.map((g) => g.organizationId),
		),
	];
	const out: string[] = [];
	for (const orgId of orgs)
		if (await consumeGrant({ orgId, scope: "view", actor, purpose }))
			out.push(orgId);
	return out;
}
