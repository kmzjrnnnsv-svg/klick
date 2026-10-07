"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { comments, watchers } from "@/db/schema";
import { requireOrg, toOrgCtx } from "@/lib/auth/guards";
import { listMembersForPicker, listWatcherIds } from "@/lib/compliance/queries";
import { mutateOrg } from "@/lib/db/with-org";
import { resolveMentions } from "@/lib/mentions";
import { notify } from "@/lib/notifications/notify";
import { type ActionResult, fromZod } from "@/lib/validation/common";
import { addCommentSchema, entityRefSchema } from "@/lib/validation/grc";

// Kommentar mit @Mentions: Erwähnte und Watcher werden benachrichtigt;
// Kommentierende werden automatisch Watcher.
export async function addComment(
	input: unknown,
	link: string,
): Promise<ActionResult<{ id: string; mentioned: number }>> {
	const c = await requireOrg({ comment: ["create"] });
	const parsed = addCommentSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const d = parsed.data;
	const safeLink = link.startsWith("/") ? link : "/heute";

	const out = await mutateOrg(toOrgCtx(c), async (tx) => {
		const [row] = await tx
			.insert(comments)
			.values({
				organizationId: c.orgId,
				entityType: d.entityType,
				entityId: d.entityId,
				authorUserId: c.userId,
				bodyMarkdown: d.bodyMarkdown,
				parentId: d.parentId ?? null,
			})
			.returning({ id: comments.id });
		if (!row) throw new Error("insert failed");

		const members = await listMembersForPicker(tx, c.orgId);
		const mentioned = resolveMentions(d.bodyMarkdown, members);
		const watcherIds = await listWatcherIds(
			tx,
			c.orgId,
			d.entityType,
			d.entityId,
		);

		await tx
			.insert(watchers)
			.values({
				organizationId: c.orgId,
				entityType: d.entityType,
				entityId: d.entityId,
				userId: c.userId,
			})
			.onConflictDoNothing();

		await notify(tx, {
			orgId: c.orgId,
			recipients: mentioned.map((m) => m.userId),
			actorUserId: c.userId,
			kind: "mentioned",
			title: `${c.name} hat dich erwähnt`,
			body: d.bodyMarkdown.slice(0, 200),
			link: safeLink,
		});
		const mentionedIds = new Set(mentioned.map((m) => m.userId));
		await notify(tx, {
			orgId: c.orgId,
			recipients: watcherIds.filter((w) => !mentionedIds.has(w)),
			actorUserId: c.userId,
			kind: "entity_changed",
			title: `${c.name} hat kommentiert`,
			body: d.bodyMarkdown.slice(0, 200),
			link: safeLink,
		});
		return {
			result: { id: row.id, mentioned: mentioned.length },
			audit: {
				action: "comment.create",
				target: `${d.entityType}:${d.entityId}`,
				after: { commentId: row.id, mentions: mentioned.map((m) => m.userId) },
			},
		};
	});
	revalidatePath(safeLink);
	return { ok: true, data: out };
}

export async function toggleWatch(
	input: unknown,
): Promise<ActionResult<{ watching: boolean }>> {
	const c = await requireOrg();
	const parsed = entityRefSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const d = parsed.data;
	const watching = await mutateOrg(toOrgCtx(c), async (tx) => {
		const ids = await listWatcherIds(tx, c.orgId, d.entityType, d.entityId);
		if (ids.includes(c.userId)) {
			await tx
				.delete(watchers)
				.where(
					and(
						eq(watchers.organizationId, c.orgId),
						eq(watchers.entityType, d.entityType),
						eq(watchers.entityId, d.entityId),
						eq(watchers.userId, c.userId),
					),
				);
			return { result: false, audit: [] };
		}
		await tx
			.insert(watchers)
			.values({
				organizationId: c.orgId,
				entityType: d.entityType,
				entityId: d.entityId,
				userId: c.userId,
			})
			.onConflictDoNothing();
		return { result: true, audit: [] };
	});
	return { ok: true, data: { watching } };
}
