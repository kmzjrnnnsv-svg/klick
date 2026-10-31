import { createHash } from "node:crypto";
import { and, eq, gte, inArray, isNull, lt } from "drizzle-orm";
import { notifications, pushSubscriptions } from "@/db/schema";
import type { AuditInput } from "@/lib/audit";
import type { OrgTx } from "@/lib/db/with-org";
import {
	channelsFor,
	NO_REMOTE,
	PUSH_MAX_ATTEMPTS,
	pushWanted,
	wantsChannel,
} from "@/lib/notifications/channels";
import { notificationUrl } from "@/lib/notifications/link";
import { IMMEDIATE_MAIL_KINDS } from "@/lib/notifications/notify";
import { loadChannelPrefs } from "@/lib/notifications/prefs";
import type { PushSender } from "./http";

// Schreiben rund um Web Push nur hier (Push-Benachrichtigungen je Person):
// Geräte anmelden/abmelden, Zustellung. Alles im Org-Kontext (RLS).

export const MAX_DEVICES = 10;

// Kurzkennung eines Geräts für die Anzeige „Dieses Gerät“: der Browser
// rechnet dieselbe Prüfsumme über sein Abo, der Endpunkt selbst verlässt
// den Server nicht
export function endpointRef(endpoint: string): string {
	return createHash("sha256").update(endpoint).digest("hex").slice(0, 16);
}

export async function devicesOf(tx: OrgTx, orgId: string, userId: string) {
	return tx
		.select({
			id: pushSubscriptions.id,
			label: pushSubscriptions.label,
			createdAt: pushSubscriptions.createdAt,
			lastSuccessAt: pushSubscriptions.lastSuccessAt,
			lastError: pushSubscriptions.lastError,
			endpoint: pushSubscriptions.endpoint,
		})
		.from(pushSubscriptions)
		.where(
			and(
				eq(pushSubscriptions.organizationId, orgId),
				eq(pushSubscriptions.userId, userId),
			),
		)
		.orderBy(pushSubscriptions.createdAt);
}

// Gerät anmelden (gleicher Endpunkt = erneuert, auch nach Personenwechsel
// im selben Browser)
export async function saveDevice(
	tx: OrgTx,
	input: {
		orgId: string;
		userId: string;
		endpoint: string;
		p256dh: string;
		auth: string;
		label: string | null;
	},
): Promise<{ ok: true; audit: AuditInput } | { ok: false; error: "too_many" }> {
	const existing = await devicesOf(tx, input.orgId, input.userId);
	if (
		existing.length >= MAX_DEVICES &&
		!existing.some((d) => d.endpoint === input.endpoint)
	)
		return { ok: false, error: "too_many" };
	await tx
		.insert(pushSubscriptions)
		.values({
			organizationId: input.orgId,
			userId: input.userId,
			endpoint: input.endpoint,
			p256dh: input.p256dh,
			auth: input.auth,
			label: input.label,
		})
		.onConflictDoUpdate({
			target: [pushSubscriptions.organizationId, pushSubscriptions.endpoint],
			set: {
				userId: input.userId,
				p256dh: input.p256dh,
				auth: input.auth,
				label: input.label,
				lastError: null,
			},
		});
	return {
		ok: true,
		audit: {
			action: "notifications.push_device_added",
			target: `user:${input.userId}`,
			// nie Endpunkt oder Schlüssel ins Protokoll
			after: { label: input.label, host: new URL(input.endpoint).hostname },
		},
	};
}

export async function removeDevice(
	tx: OrgTx,
	orgId: string,
	userId: string,
	id: string,
): Promise<AuditInput | null> {
	const removed = await tx
		.delete(pushSubscriptions)
		.where(
			and(
				eq(pushSubscriptions.organizationId, orgId),
				eq(pushSubscriptions.userId, userId),
				eq(pushSubscriptions.id, id),
			),
		)
		.returning({ label: pushSubscriptions.label });
	if (removed.length === 0) return null;
	return {
		action: "notifications.push_device_removed",
		target: `user:${userId}`,
		before: { label: removed[0]?.label ?? null },
	};
}

const MAX_AGE_DAYS = 3;
const MAX_PER_RUN = 50;

export type PushStats = { sent: number; failed: number };

// Offene Benachrichtigungen einer Org als Push zustellen (Job push-notify).
// Erfolg = mindestens ein Gerät der Person hat angenommen; abgemeldete
// Geräte (404/410) fallen weg; Drosselung bricht den Lauf ab.
export async function deliverPush(
	tx: OrgTx,
	orgId: string,
	send: PushSender,
	opts: { baseUrl: string; now: Date },
): Promise<PushStats> {
	const stats: PushStats = { sent: 0, failed: 0 };
	const prefs = await loadChannelPrefs(tx, orgId);
	const wants = [...prefs.entries()]
		.filter(([, p]) => wantsChannel(p, "push"))
		.map(([u]) => u);
	if (wants.length === 0) return stats;
	const devices = await tx
		.select()
		.from(pushSubscriptions)
		.where(
			and(
				eq(pushSubscriptions.organizationId, orgId),
				inArray(pushSubscriptions.userId, wants),
			),
		);
	const byUser = new Map<string, typeof devices>();
	for (const d of devices)
		byUser.set(d.userId, [...(byUser.get(d.userId) ?? []), d]);
	if (byUser.size === 0) return stats;
	const since = new Date(opts.now.getTime() - MAX_AGE_DAYS * 86_400_000);
	const rows = await tx
		.select({
			id: notifications.id,
			userId: notifications.userId,
			kind: notifications.kind,
			title: notifications.title,
			link: notifications.link,
			pushAttempts: notifications.pushAttempts,
		})
		.from(notifications)
		.where(
			and(
				eq(notifications.organizationId, orgId),
				inArray(notifications.userId, [...byUser.keys()]),
				isNull(notifications.pushSentAt),
				lt(notifications.pushAttempts, PUSH_MAX_ATTEMPTS),
				gte(notifications.createdAt, since),
			),
		)
		.orderBy(notifications.createdAt)
		.limit(MAX_PER_RUN);
	const immediate = new Set<string>(IMMEDIATE_MAIL_KINDS);
	for (const r of rows) {
		const state = {
			...NO_REMOTE,
			pushActive: true,
			teamsSentAt: null,
			teamsAttempts: 0,
			pushSentAt: null,
			pushAttempts: r.pushAttempts,
		};
		if (!pushWanted(channelsFor(prefs.get(r.userId), r.kind), state)) continue;
		let delivered = false;
		let throttled = false;
		for (const d of byUser.get(r.userId) ?? []) {
			const res = await send(
				{ endpoint: d.endpoint, p256dh: d.p256dh, auth: d.auth },
				{
					title: r.title.length > 150 ? `${r.title.slice(0, 149)}…` : r.title,
					url: notificationUrl(opts.baseUrl, r.link),
					tag: r.id,
				},
				{ urgency: immediate.has(r.kind) ? "high" : "normal" },
			);
			if (res.ok) {
				delivered = true;
				await tx
					.update(pushSubscriptions)
					.set({ lastSuccessAt: opts.now, lastError: null })
					.where(eq(pushSubscriptions.id, d.id));
			} else if (res.error === "gone" || res.error === "host_not_allowed") {
				await tx
					.delete(pushSubscriptions)
					.where(eq(pushSubscriptions.id, d.id));
			} else {
				if (res.error === "throttled") throttled = true;
				await tx
					.update(pushSubscriptions)
					.set({ lastError: res.error })
					.where(eq(pushSubscriptions.id, d.id));
			}
		}
		if (delivered) {
			stats.sent++;
			await tx
				.update(notifications)
				.set({ pushSentAt: opts.now })
				.where(eq(notifications.id, r.id));
		} else if (throttled) {
			break;
		} else {
			stats.failed++;
			await tx
				.update(notifications)
				.set({ pushAttempts: r.pushAttempts + 1 })
				.where(eq(notifications.id, r.id));
		}
	}
	return stats;
}
