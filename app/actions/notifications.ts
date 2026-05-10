"use server";

import { and, desc, eq, isNull, isNotNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { db } from "@/db";
import {
	agencyMembers,
	employers,
	type Notification,
	notifications,
	users,
} from "@/db/schema";

async function requireUser(): Promise<string> {
	const session = await auth();
	if (!session?.user?.id) throw new Error("unauthenticated");
	return session.user.id;
}

// Internal helper — used by other actions (matches, offers, interests) to
// drop a row in the user's activity feed. Never throws on failure.
export async function pushNotification(input: {
	userId: string;
	kind: Notification["kind"];
	title: string;
	body?: string;
	link?: string;
	payload?: Record<string, unknown>;
}): Promise<void> {
	try {
		// Sanity check: skip if the user vanished (e.g. test fixtures)
		const [u] = await db
			.select({ id: users.id })
			.from(users)
			.where(eq(users.id, input.userId))
			.limit(1);
		if (!u) return;
		await db.insert(notifications).values({
			userId: input.userId,
			kind: input.kind,
			title: input.title,
			body: input.body,
			link: input.link,
			payload: input.payload,
		});
	} catch (e) {
		console.error("[notifications] push failed", e);
	}
}

// Fan-out: schickt eine Notification an ALLE beigetretenen Team-Member
// einer Firma (Owner + Recruiter + Viewer mit joinedAt). Wird genutzt
// damit nicht nur der "Legacy-Owner" Notifications sieht, sondern jedes
// aktive Team-Mitglied. Idempotent gegen fehlenden Tenant / leere Teams.
export async function pushNotificationToEmployerTeam(input: {
	employerId: string;
	kind: Notification["kind"];
	title: string;
	body?: string;
	link?: string;
	payload?: Record<string, unknown>;
}): Promise<void> {
	try {
		const memberRows = await db
			.select({ userId: agencyMembers.userId })
			.from(agencyMembers)
			.where(
				and(
					eq(agencyMembers.employerId, input.employerId),
					isNotNull(agencyMembers.joinedAt),
					isNotNull(agencyMembers.userId),
				),
			);
		const userIds = new Set<string>();
		for (const m of memberRows) {
			if (m.userId) userIds.add(m.userId);
		}
		// Legacy-Fallback: employers.userId zusätzlich rein, falls noch
		// keine agencyMembers-Row für ihn existiert.
		const [emp] = await db
			.select({ userId: employers.userId })
			.from(employers)
			.where(eq(employers.id, input.employerId))
			.limit(1);
		if (emp?.userId) userIds.add(emp.userId);
		if (userIds.size === 0) return;
		await Promise.all(
			[...userIds].map((uid) =>
				pushNotification({
					userId: uid,
					kind: input.kind,
					title: input.title,
					body: input.body,
					link: input.link,
					payload: input.payload,
				}),
			),
		);
	} catch (e) {
		console.error("[notifications] fanout failed", e);
	}
}

export async function listMyNotifications(input?: {
	limit?: number;
	onlyUnread?: boolean;
}): Promise<Notification[]> {
	const userId = await requireUser();
	const limit = Math.min(Math.max(input?.limit ?? 20, 1), 100);
	const where = input?.onlyUnread
		? and(eq(notifications.userId, userId), isNull(notifications.readAt))
		: eq(notifications.userId, userId);
	return db
		.select()
		.from(notifications)
		.where(where)
		.orderBy(desc(notifications.createdAt))
		.limit(limit);
}

export async function unreadCount(): Promise<number> {
	const userId = await requireUser();
	const rows = await db
		.select({ id: notifications.id })
		.from(notifications)
		.where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
	return rows.length;
}

export async function markRead(id: string): Promise<void> {
	const userId = await requireUser();
	await db
		.update(notifications)
		.set({ readAt: new Date() })
		.where(and(eq(notifications.id, id), eq(notifications.userId, userId)));
	revalidatePath("/notifications");
}

export async function markAllRead(): Promise<void> {
	const userId = await requireUser();
	await db
		.update(notifications)
		.set({ readAt: new Date() })
		.where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
	revalidatePath("/notifications");
}
