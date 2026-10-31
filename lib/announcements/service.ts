import { announcementAcknowledgements } from "@/db/schema";
import type { Actor } from "@/lib/audit";
import { auditPlatform } from "@/lib/audit";
import {
	allOrgIds,
	announcementById,
	insertAnnouncement,
	markWithdrawn,
} from "@/lib/db/announcements";
import { deciderIds } from "@/lib/db/platform-access";
import { mutateOrg, type OrgCtx } from "@/lib/db/with-org";
import { logger } from "@/lib/log";
import { notify } from "@/lib/notifications/notify";
import {
	type AnnouncementKind,
	appliesTo,
	needsAcknowledgement,
	windowError,
} from "./rules";

// Mitteilungen an Kund:innen (Admin-Portal, Teil 6). Ein Sicherheitsvorfall
// geht sofort per Mail an Inhaber:innen und Geschäftsleitung jeder
// betroffenen Org (security_alert, IMMEDIATE_MAIL_KINDS) und steht in deren
// Kette (platform.announcement); jede Org nimmt ihn einmal zur Kenntnis.

export type NewAnnouncement = {
	kind: AnnouncementKind;
	title: string;
	body: string;
	startsAt: Date;
	endsAt: Date | null;
	orgIds: string[] | null;
};

export async function publishAnnouncement(
	actor: Actor & { userId: string },
	input: NewAnnouncement,
): Promise<
	| { ok: true; data: { id: string; orgs: number; notified: number } }
	| { ok: false; error: string }
> {
	const bad = windowError(input.startsAt, input.endsAt);
	if (bad) return { ok: false, error: bad };
	const known = new Set(await allOrgIds());
	const targets =
		input.orgIds === null
			? [...known]
			: [...new Set(input.orgIds)].filter((id) => known.has(id));
	if (input.orgIds !== null && targets.length === 0)
		return { ok: false, error: "no_orgs" };
	const row = await insertAnnouncement({
		kind: input.kind,
		title: input.title,
		body: input.body,
		startsAt: input.startsAt,
		endsAt: input.endsAt,
		orgIds: input.orgIds === null ? null : targets,
		createdBy: actor.userId,
	});
	await auditPlatform(actor, {
		action: "platform.announcement_published",
		target: `announcement:${row.id}`,
		after: {
			kind: row.kind,
			title: row.title,
			orgs: input.orgIds === null ? "all" : targets.length,
		},
	});
	// Vorfall: jede betroffene Org erfährt es sofort und hat es in ihrer Kette.
	// Info und Wartung erscheinen nur als Hinweis in der App.
	let notified = 0;
	if (needsAcknowledgement(row.kind)) {
		for (const orgId of targets) {
			try {
				const recipients = await deciderIds(orgId);
				notified += await mutateOrg(
					{
						orgId,
						userId: actor.userId,
						ip: actor.ip,
						userAgent: actor.userAgent,
					},
					async (tx) => ({
						result: await notify(tx, {
							orgId,
							recipients,
							actorUserId: actor.userId,
							kind: "security_alert",
							title: `Klick: ${row.title}`,
							body: row.body.slice(0, 500),
							link: "/heute",
							payload: { announcementId: row.id },
						}),
						audit: {
							action: "platform.announcement",
							target: `announcement:${row.id}`,
							after: { kind: row.kind, title: row.title },
						},
					}),
				);
			} catch (err) {
				// Eine Org darf die übrigen nicht blockieren; der Fehler steht im Log
				logger.error({ err, orgId }, "announcement: notify failed");
			}
		}
	}
	return { ok: true, data: { id: row.id, orgs: targets.length, notified } };
}

export async function withdrawAnnouncement(
	actor: Actor & { userId: string },
	id: string,
): Promise<{ ok: true; data: undefined } | { ok: false; error: string }> {
	const done = await markWithdrawn(id, actor.userId);
	if (!done) return { ok: false, error: "not_found" };
	await auditPlatform(actor, {
		action: "platform.announcement_withdrawn",
		target: `announcement:${id}`,
	});
	return { ok: true, data: undefined };
}

/** Kenntnisnahme durch Inhaber:in oder Geschäftsleitung der Org. */
export async function acknowledgeAnnouncement(
	ctx: OrgCtx & { userId: string },
	id: string,
): Promise<{ ok: true; data: undefined } | { ok: false; error: string }> {
	const a = await announcementById(id);
	if (!a || a.withdrawnAt || !appliesTo(a, ctx.orgId))
		return { ok: false, error: "not_found" };
	if (!needsAcknowledgement(a.kind)) return { ok: false, error: "not_found" };
	if (!(await deciderIds(ctx.orgId)).includes(ctx.userId))
		return { ok: false, error: "forbidden" };
	return mutateOrg(ctx, async (tx) => {
		const inserted = await tx
			.insert(announcementAcknowledgements)
			.values({
				organizationId: ctx.orgId,
				announcementId: id,
				userId: ctx.userId,
			})
			.onConflictDoNothing()
			.returning({ id: announcementAcknowledgements.id });
		return {
			result: { ok: true as const, data: undefined },
			audit: {
				action: "announcement.acknowledged",
				target: `announcement:${id}`,
				after: { title: a.title, first: inserted.length > 0 },
			},
		};
	});
}
