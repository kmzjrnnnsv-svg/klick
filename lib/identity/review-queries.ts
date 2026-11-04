import {
	and,
	asc,
	desc,
	eq,
	ilike,
	isNull,
	or,
	type SQL,
	sql,
} from "drizzle-orm";
import { type AnyPgColumn, alias } from "drizzle-orm/pg-core";
import { member, user } from "@/db/auth-schema";
import { accessReviewItems, accessReviews, identitySources } from "@/db/schema";
import { normalizeRole } from "@/lib/auth/guards";
import { roleAllows } from "@/lib/auth/permissions";
import type { OrgTx } from "@/lib/db/with-org";
import type { ReviewDecision, ReviewProgress } from "./review-rules";
import type { ReviewSnapshot } from "./review-service";

// Zugriffsprüfung (Teil D I2): Lesen für /team/zugriffspruefung. Zähler in
// SQL, Einträge seitenweise.

const name = (u: { name: AnyPgColumn; email: AnyPgColumn }) =>
	sql<string | null>`coalesce(nullif(${u.name}, ''), ${u.email})`;

export type ReviewListRow = {
	id: string;
	title: string;
	status: "open" | "closed";
	dueAt: string | null;
	startedAt: Date;
	closedAt: Date | null;
	startedByName: string | null;
	total: number;
	open: number;
};

export async function listAccessReviews(
	tx: OrgTx,
	orgId: string,
): Promise<ReviewListRow[]> {
	return tx
		.select({
			id: accessReviews.id,
			title: accessReviews.title,
			status: accessReviews.status,
			dueAt: accessReviews.dueAt,
			startedAt: accessReviews.startedAt,
			closedAt: accessReviews.closedAt,
			startedByName: name(user),
			total: sql<number>`(select count(*)::int from ${accessReviewItems} i where i.review_id = ${accessReviews.id})`,
			open: sql<number>`(select count(*)::int from ${accessReviewItems} i where i.review_id = ${accessReviews.id} and i.decision is null)`,
		})
		.from(accessReviews)
		.leftJoin(user, eq(user.id, accessReviews.startedBy))
		.where(eq(accessReviews.organizationId, orgId))
		.orderBy(desc(accessReviews.startedAt))
		.limit(50);
}

export const REVIEW_VIEWS = ["meine", "offen", "alle"] as const;
export type ReviewView = (typeof REVIEW_VIEWS)[number];

export type ReviewItemRow = {
	id: string;
	snapshot: Partial<ReviewSnapshot>;
	reviewerUserId: string | null;
	reviewerName: string | null;
	decision: ReviewDecision | null;
	note: string | null;
	decidedByName: string | null;
	decidedAt: Date | null;
	taskId: string | null;
	accountId: string | null;
};

export async function accessReviewDetail(
	tx: OrgTx,
	orgId: string,
	id: string,
	input: {
		view: ReviewView;
		userId: string;
		q: string | null;
		limit: number;
		offset: number;
	},
) {
	const [review] = await tx
		.select({
			id: accessReviews.id,
			title: accessReviews.title,
			status: accessReviews.status,
			dueAt: accessReviews.dueAt,
			startedAt: accessReviews.startedAt,
			closedAt: accessReviews.closedAt,
			controlTestId: accessReviews.controlTestId,
			startedByName: name(user),
			provider: identitySources.provider,
		})
		.from(accessReviews)
		.leftJoin(user, eq(user.id, accessReviews.startedBy))
		.leftJoin(identitySources, eq(identitySources.id, accessReviews.sourceId))
		.where(
			and(eq(accessReviews.organizationId, orgId), eq(accessReviews.id, id)),
		)
		.limit(1);
	if (!review) return null;
	const base = and(
		eq(accessReviewItems.organizationId, orgId),
		eq(accessReviewItems.reviewId, id),
	) as SQL;
	const [counts] = await tx
		.select({
			total: sql<number>`count(*)::int`,
			open: sql<number>`count(*) filter (where ${accessReviewItems.decision} is null)::int`,
			confirm: sql<number>`count(*) filter (where ${accessReviewItems.decision} = 'confirm')::int`,
			adjust: sql<number>`count(*) filter (where ${accessReviewItems.decision} = 'adjust')::int`,
			revoke: sql<number>`count(*) filter (where ${accessReviewItems.decision} = 'revoke')::int`,
			mine: sql<number>`count(*) filter (where ${accessReviewItems.decision} is null and ${accessReviewItems.reviewerUserId} = ${input.userId})::int`,
		})
		.from(accessReviewItems)
		.where(base);
	const where: SQL[] = [base];
	if (input.view === "meine")
		where.push(
			eq(accessReviewItems.reviewerUserId, input.userId),
			isNull(accessReviewItems.decision),
		);
	if (input.view === "offen") where.push(isNull(accessReviewItems.decision));
	if (input.q) {
		const like = `%${input.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
		where.push(
			or(
				ilike(sql`${accessReviewItems.snapshot}->>'name'`, like),
				ilike(sql`${accessReviewItems.snapshot}->>'email'`, like),
			) as SQL,
		);
	}
	const reviewer = alias(user, "reviewer");
	const decider = alias(user, "decider");
	const [{ n } = { n: 0 }] = await tx
		.select({ n: sql<number>`count(*)::int` })
		.from(accessReviewItems)
		.where(and(...where));
	const items = (await tx
		.select({
			id: accessReviewItems.id,
			snapshot: accessReviewItems.snapshot,
			reviewerUserId: accessReviewItems.reviewerUserId,
			reviewerName: name(reviewer),
			decision: accessReviewItems.decision,
			note: accessReviewItems.note,
			decidedByName: name(decider),
			decidedAt: accessReviewItems.decidedAt,
			taskId: accessReviewItems.taskId,
			accountId: accessReviewItems.accountId,
		})
		.from(accessReviewItems)
		.leftJoin(reviewer, eq(reviewer.id, accessReviewItems.reviewerUserId))
		.leftJoin(decider, eq(decider.id, accessReviewItems.decidedBy))
		.where(and(...where))
		.orderBy(
			sql`${accessReviewItems.decision} is not null`,
			desc(sql`(${accessReviewItems.snapshot}->>'admin')::boolean`),
			asc(
				sql`lower(coalesce(${accessReviewItems.snapshot}->>'email', ${accessReviewItems.snapshot}->>'name'))`,
			),
			asc(accessReviewItems.id),
		)
		.limit(input.limit)
		.offset(input.offset)) as ReviewItemRow[];
	const progress: ReviewProgress = {
		total: counts?.total ?? 0,
		open: counts?.open ?? 0,
		confirm: counts?.confirm ?? 0,
		adjust: counts?.adjust ?? 0,
		revoke: counts?.revoke ?? 0,
	};
	return { review, progress, mine: counts?.mine ?? 0, items, total: n };
}

// Wer prüfen darf: interne Mitglieder, deren Grundrolle „identity:review“
// trägt (Inhaber:in, Bearbeiter:in, Berater:in)
export async function reviewerOptions(
	tx: OrgTx,
	orgId: string,
): Promise<{ userId: string; label: string }[]> {
	const rows = await tx
		.select({
			userId: user.id,
			name: user.name,
			email: user.email,
			role: member.role,
		})
		.from(member)
		.innerJoin(user, eq(user.id, member.userId))
		.where(eq(member.organizationId, orgId))
		.orderBy(
			asc(sql`lower(coalesce(nullif(${user.name}, ''), ${user.email}))`),
		);
	return rows
		.filter((r) => roleAllows(normalizeRole(r.role), { identity: ["review"] }))
		.map((r) => ({
			userId: r.userId,
			label: r.name ? `${r.name} (${r.email})` : r.email,
		}));
}
