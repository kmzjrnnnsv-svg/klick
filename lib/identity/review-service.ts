import { and, eq, isNull, sql } from "drizzle-orm";
import { member } from "@/db/auth-schema";
import {
	accessReviewItems,
	accessReviews,
	identityAccounts,
	identitySources,
	tasks,
} from "@/db/schema";
import type { AuditInput } from "@/lib/audit";
import { insertControlTest } from "@/lib/compliance/control-test-service";
import type { OrgTx } from "@/lib/db/with-org";
import { notify } from "@/lib/notifications/notify";
import {
	canClose,
	decisionError,
	inReviewScope,
	mayDecide,
	REVIEW_MAX_ITEMS,
	type ReviewDecision,
	type ReviewScope,
	reviewProgress,
	reviewTestResult,
} from "./review-rules";
import { evaluateIdentityChecks, implementationFor } from "./service";
import { IDENTITY_CHECKS } from "./types";

// Zugriffsprüfung (Rezertifizierung, Teil D I2): Schreiben nur hier. Klick
// entzieht nie selbst — „entziehen“ wird eine Aufgabe; ist das Konto nach
// der Frist noch aktiv, schlägt die Prüfung „Austritte“ an. Audit nur mit
// Kennungen und Zahlen, nie Namen, Adressen oder Notizen.

export type ReviewResult<T = undefined> =
	| { ok: true; data: T; audit: AuditInput[] }
	| { ok: false; error: string };

// Stand des Kontos beim Start (für Liste, Nachweis und Aufgabe)
export type ReviewSnapshot = {
	name: string;
	email: string | null;
	kind: "member" | "guest";
	admin: boolean;
	roles: string[];
	mfa: boolean | null;
	lastSignInAt: string | null;
};

export async function startAccessReview(
	tx: OrgTx,
	ctx: { orgId: string; userId: string },
	input: {
		sourceId: string;
		title: string;
		dueAt: string | null;
		scope: ReviewScope;
		reviewerUserId: string;
		now: Date;
	},
): Promise<ReviewResult<{ id: string; items: number }>> {
	const [source] = await tx
		.select({ id: identitySources.id, status: identitySources.status })
		.from(identitySources)
		.where(
			and(
				eq(identitySources.organizationId, ctx.orgId),
				eq(identitySources.id, input.sourceId),
			),
		)
		.limit(1);
	if (!source || source.status === "pending_consent")
		return { ok: false, error: "notFound" };
	const [open] = await tx
		.select({ id: accessReviews.id })
		.from(accessReviews)
		.where(
			and(
				eq(accessReviews.organizationId, ctx.orgId),
				eq(accessReviews.status, "open"),
			),
		)
		.limit(1);
	if (open) return { ok: false, error: "identity_review_open" };
	const [reviewer] = await tx
		.select({ userId: member.userId })
		.from(member)
		.where(
			and(
				eq(member.organizationId, ctx.orgId),
				eq(member.userId, input.reviewerUserId),
			),
		)
		.limit(1);
	if (!reviewer) return { ok: false, error: "identity_not_member" };

	const accounts = (
		await tx
			.select({
				id: identityAccounts.id,
				displayName: identityAccounts.displayName,
				email: identityAccounts.email,
				kind: identityAccounts.kind,
				enabled: identityAccounts.enabled,
				isAdmin: identityAccounts.isAdmin,
				isTopAdmin: identityAccounts.isTopAdmin,
				adminRoles: identityAccounts.adminRoles,
				mfaRegistered: identityAccounts.mfaRegistered,
				lastSignInAt: identityAccounts.lastSignInAt,
				missingSince: identityAccounts.missingSince,
			})
			.from(identityAccounts)
			.where(
				and(
					eq(identityAccounts.organizationId, ctx.orgId),
					eq(identityAccounts.sourceId, source.id),
					isNull(identityAccounts.missingSince),
				),
			)
	).filter((a) =>
		inReviewScope(
			{
				enabled: a.enabled,
				kind: a.kind,
				isAdmin: a.isAdmin,
				isTopAdmin: a.isTopAdmin,
				missing: a.missingSince !== null,
			},
			input.scope,
		),
	);
	if (accounts.length === 0)
		return { ok: false, error: "identity_review_empty" };
	if (accounts.length > REVIEW_MAX_ITEMS)
		return { ok: false, error: "identity_review_too_many" };

	const [review] = await tx
		.insert(accessReviews)
		.values({
			organizationId: ctx.orgId,
			sourceId: source.id,
			title: input.title.trim().slice(0, 200),
			dueAt: input.dueAt,
			startedBy: ctx.userId,
			startedAt: input.now,
		})
		.returning({ id: accessReviews.id });
	if (!review) throw new Error("insert failed");
	// in Blöcken, damit große Tenants nicht eine riesige Anweisung bauen
	for (let i = 0; i < accounts.length; i += 1000) {
		await tx.insert(accessReviewItems).values(
			accounts.slice(i, i + 1000).map((a) => ({
				organizationId: ctx.orgId,
				reviewId: review.id,
				accountId: a.id,
				reviewerUserId: input.reviewerUserId,
				snapshot: {
					name: a.displayName,
					email: a.email,
					kind: a.kind,
					admin: a.isAdmin || a.isTopAdmin,
					roles: a.adminRoles,
					mfa: a.mfaRegistered,
					lastSignInAt: a.lastSignInAt?.toISOString() ?? null,
				} satisfies ReviewSnapshot,
			})),
		);
	}
	if (input.reviewerUserId !== ctx.userId)
		await notify(tx, {
			orgId: ctx.orgId,
			recipients: [input.reviewerUserId],
			actorUserId: ctx.userId,
			kind: "review_due",
			title: `Zugriffsprüfung: ${accounts.length} Konten prüfen`,
			link: `/team/zugriffspruefung/${review.id}`,
		});
	return {
		ok: true,
		data: { id: review.id, items: accounts.length },
		audit: [
			{
				action: "identity.review_started",
				target: `access_review:${review.id}`,
				after: {
					scope: input.scope,
					items: accounts.length,
					reviewer: input.reviewerUserId,
					dueAt: input.dueAt,
				},
			},
		],
	};
}

export async function decideAccessReviewItem(
	tx: OrgTx,
	ctx: { orgId: string; userId: string; isOwner: boolean },
	input: {
		itemId: string;
		decision: ReviewDecision;
		note: string | null;
		now: Date;
	},
): Promise<ReviewResult> {
	const [item] = await tx
		.select({
			id: accessReviewItems.id,
			reviewId: accessReviewItems.reviewId,
			reviewerUserId: accessReviewItems.reviewerUserId,
			decision: accessReviewItems.decision,
			status: accessReviews.status,
		})
		.from(accessReviewItems)
		.innerJoin(accessReviews, eq(accessReviews.id, accessReviewItems.reviewId))
		.where(
			and(
				eq(accessReviewItems.organizationId, ctx.orgId),
				eq(accessReviewItems.id, input.itemId),
			),
		)
		.limit(1);
	if (!item) return { ok: false, error: "notFound" };
	if (item.status !== "open")
		return { ok: false, error: "identity_review_closed" };
	if (
		!mayDecide({
			reviewerUserId: item.reviewerUserId,
			userId: ctx.userId,
			isOwner: ctx.isOwner,
		})
	)
		return { ok: false, error: "forbidden" };
	const err = decisionError(input);
	if (err) return { ok: false, error: err };
	await tx
		.update(accessReviewItems)
		.set({
			decision: input.decision,
			note: input.note?.trim().slice(0, 1000) || null,
			decidedBy: ctx.userId,
			decidedAt: input.now,
		})
		.where(eq(accessReviewItems.id, item.id));
	return {
		ok: true,
		data: undefined,
		audit: [
			{
				action: "identity.review_decided",
				target: `access_review:${item.reviewId}`,
				before: item.decision
					? { item: item.id, decision: item.decision }
					: null,
				after: { item: item.id, decision: input.decision },
			},
		],
	};
}

const TASK_TITLE: Record<"adjust" | "revoke", string> = {
	adjust: "Zugang anpassen",
	revoke: "Zugang entziehen",
};

// Abschluss: alle Konten entschieden. Entziehen und Anpassen werden
// Aufgaben (an die Person, die entschieden hat), die Prüfung ein Test
// „Zugriffsprüfung“ an CC-IAM-05; danach rechnen die Prüfungen neu
// (Rezertifizierung bestanden, entzogene Konten zählen bei „Austritte“).
export async function closeAccessReview(
	tx: OrgTx,
	ctx: { orgId: string; userId: string },
	input: { reviewId: string; now: Date },
): Promise<ReviewResult<{ tasks: number; testId: string | null }>> {
	const [review] = await tx
		.select({
			id: accessReviews.id,
			title: accessReviews.title,
			status: accessReviews.status,
		})
		.from(accessReviews)
		.where(
			and(
				eq(accessReviews.organizationId, ctx.orgId),
				eq(accessReviews.id, input.reviewId),
			),
		)
		.for("update")
		.limit(1);
	if (!review) return { ok: false, error: "notFound" };
	if (review.status !== "open")
		return { ok: false, error: "identity_review_closed" };
	const items = await tx
		.select({
			id: accessReviewItems.id,
			decision: accessReviewItems.decision,
			note: accessReviewItems.note,
			decidedBy: accessReviewItems.decidedBy,
			snapshot: accessReviewItems.snapshot,
		})
		.from(accessReviewItems)
		.where(
			and(
				eq(accessReviewItems.organizationId, ctx.orgId),
				eq(accessReviewItems.reviewId, review.id),
			),
		);
	const progress = reviewProgress(items);
	if (!canClose(progress))
		return { ok: false, error: "identity_review_incomplete" };

	const impl = await implementationFor(tx, ctx.orgId, IDENTITY_CHECKS.recert);
	const followUps = items.filter(
		(i): i is typeof i & { decision: "adjust" | "revoke" } =>
			i.decision === "adjust" || i.decision === "revoke",
	);
	const taskIds = new Map<string, string>();
	for (const i of followUps) {
		const snap = i.snapshot as Partial<ReviewSnapshot>;
		const who = snap.email ?? snap.name ?? "Konto";
		const [task] = await tx
			.insert(tasks)
			.values({
				organizationId: ctx.orgId,
				title: `${TASK_TITLE[i.decision]}: ${who}`.slice(0, 300),
				description: [
					i.note,
					`Aus der Zugriffsprüfung „${review.title}“: /team/zugriffspruefung/${review.id}`,
				]
					.filter(Boolean)
					.join("\n\n"),
				assigneeUserId: i.decidedBy ?? ctx.userId,
				createdByUserId: ctx.userId,
				priority: i.decision === "revoke" ? "high" : "normal",
				entityType: impl ? "control" : null,
				entityId: impl,
				sourceKind: "access_review",
			})
			.returning({ id: tasks.id });
		if (task) taskIds.set(i.id, task.id);
	}
	if (taskIds.size > 0) {
		for (const [itemId, taskId] of taskIds)
			await tx
				.update(accessReviewItems)
				.set({ taskId })
				.where(eq(accessReviewItems.id, itemId));
		const assignees = [
			...new Set(
				followUps
					.map((i) => i.decidedBy ?? ctx.userId)
					.filter((u) => u !== ctx.userId),
			),
		];
		if (assignees.length > 0)
			await notify(tx, {
				orgId: ctx.orgId,
				recipients: assignees,
				actorUserId: ctx.userId,
				kind: "task_assigned",
				title: `Zugriffsprüfung abgeschlossen: Zugänge anpassen oder entziehen`,
				link: "/heute/aufgaben",
			});
	}

	const audits: AuditInput[] = [];
	let testId: string | null = null;
	if (impl) {
		const test = await insertControlTest(
			tx,
			{ orgId: ctx.orgId, userId: ctx.userId },
			{
				implementationId: impl,
				method: "access_review",
				scope: `Zugriffsprüfung „${review.title}“`.slice(0, 300),
				testedAt: input.now,
				testerUserId: ctx.userId,
				result: reviewTestResult(progress),
				notes: `${progress.total} Konten geprüft, ${progress.confirm} bestätigt, ${progress.adjust} angepasst, ${progress.revoke} entzogen`,
				nonconformity: "skip",
			},
		);
		testId = test.id;
		audits.push(...test.audits);
	}
	await tx
		.update(accessReviews)
		.set({
			status: "closed",
			closedBy: ctx.userId,
			closedAt: input.now,
			controlTestId: testId,
		})
		.where(eq(accessReviews.id, review.id));
	audits.push({
		action: "identity.review_closed",
		target: `access_review:${review.id}`,
		after: {
			total: progress.total,
			confirm: progress.confirm,
			adjust: progress.adjust,
			revoke: progress.revoke,
			tasks: taskIds.size,
		},
	});
	audits.push(...(await evaluateIdentityChecks(tx, ctx, input.now)));
	return {
		ok: true,
		data: { tasks: taskIds.size, testId },
		audit: audits,
	};
}

// Zahl offener Einträge je Prüfer:in (für „Meine offenen“)
export async function openItemsFor(
	tx: OrgTx,
	orgId: string,
	userId: string,
): Promise<number> {
	const [row] = await tx
		.select({ n: sql<number>`count(*)::int` })
		.from(accessReviewItems)
		.innerJoin(accessReviews, eq(accessReviews.id, accessReviewItems.reviewId))
		.where(
			and(
				eq(accessReviewItems.organizationId, orgId),
				eq(accessReviewItems.reviewerUserId, userId),
				isNull(accessReviewItems.decision),
				eq(accessReviews.status, "open"),
			),
		);
	return row?.n ?? 0;
}

// Alle offenen Einträge der Person (Inhaber:innen: alle) auf einmal
// bestätigen — nur „bestätigen“, nie entziehen oder anpassen
export async function confirmAllOpen(
	tx: OrgTx,
	ctx: { orgId: string; userId: string; isOwner: boolean },
	input: { reviewId: string; now: Date },
): Promise<ReviewResult<{ count: number }>> {
	const [review] = await tx
		.select({ status: accessReviews.status })
		.from(accessReviews)
		.where(
			and(
				eq(accessReviews.organizationId, ctx.orgId),
				eq(accessReviews.id, input.reviewId),
			),
		)
		.limit(1);
	if (!review) return { ok: false, error: "notFound" };
	if (review.status !== "open")
		return { ok: false, error: "identity_review_closed" };
	const rows = await tx
		.update(accessReviewItems)
		.set({
			decision: "confirm",
			note: null,
			decidedBy: ctx.userId,
			decidedAt: input.now,
		})
		.where(
			and(
				eq(accessReviewItems.organizationId, ctx.orgId),
				eq(accessReviewItems.reviewId, input.reviewId),
				isNull(accessReviewItems.decision),
				ctx.isOwner
					? sql`true`
					: eq(accessReviewItems.reviewerUserId, ctx.userId),
			),
		)
		.returning({ id: accessReviewItems.id });
	return {
		ok: true,
		data: { count: rows.length },
		audit:
			rows.length > 0
				? [
						{
							action: "identity.review_confirmed_all",
							target: `access_review:${input.reviewId}`,
							after: { count: rows.length },
						},
					]
				: [],
	};
}
