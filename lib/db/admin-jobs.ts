import { and, gte, inArray, isNull, lt, sql } from "drizzle-orm";
import { type DbTx, globalDb } from "@/db";
import { notifications } from "@/db/schema";
import { logger } from "@/lib/log";
import { IMMEDIATE_MAIL_KINDS } from "@/lib/notifications/notify";

// Lader für Admin > Betrieb (Admin-Portal, Teil 5): Warteschlangen aus dem
// Schema pgboss (gehört der App-Rolle) und hängende Sofort-Mails (nur Zähler).
// Ohne pg-boss-Tabellen (Jobs aus) liefern die Lader null.

export type QueueRow = {
	name: string;
	queued: number;
	active: number;
	failed24h: number;
	lastSuccess: Date | null;
	lastFailure: Date | null;
	cron: string | null;
};

const asDate = (v: unknown): Date | null =>
	v instanceof Date ? v : typeof v === "string" && v ? new Date(v) : null;

export async function jobQueues(): Promise<QueueRow[] | null> {
	try {
		const rows = await globalDb.execute<{
			name: string;
			queued: number;
			active: number;
			failed24h: number;
			last_success: string | Date | null;
			last_failure: string | Date | null;
			cron: string | null;
		}>(sql`
			select q.name,
				(q.queued_count + q.deferred_count)::int as queued,
				q.active_count::int as active,
				coalesce(j.failed24h, 0)::int as "failed24h",
				j.last_success, j.last_failure,
				s.cron
			from pgboss.queue q
			left join lateral (
				select
					count(*) filter (where state = 'failed' and completed_on > now() - interval '24 hours') as failed24h,
					max(completed_on) filter (where state = 'completed') as last_success,
					max(completed_on) filter (where state = 'failed') as last_failure
				from pgboss.job where name = q.name
			) j on true
			left join lateral (
				select cron from pgboss.schedule where name = q.name limit 1
			) s on true
			where q.name not like '\_\_pgboss\_\_%'
			order by q.name`);
		return rows.map((r) => ({
			name: r.name,
			queued: Number(r.queued),
			active: Number(r.active),
			failed24h: Number(r.failed24h),
			lastSuccess: asDate(r.last_success),
			lastFailure: asDate(r.last_failure),
			cron: r.cron,
		}));
	} catch (err) {
		logger.warn({ err }, "admin ops: pg-boss not readable");
		return null;
	}
}

export type FailedJob = {
	id: string;
	name: string;
	at: Date | null;
	retries: number;
	message: string | null;
};

export async function failedJobs(limit = 20): Promise<FailedJob[] | null> {
	try {
		const rows = await globalDb.execute<{
			id: string;
			name: string;
			completed_on: string | Date | null;
			retry_count: number;
			message: string | null;
		}>(sql`
			select id, name, completed_on, retry_count,
				left(coalesce(output->>'message', output::text), 300) as message
			from pgboss.job
			where state = 'failed' and completed_on > now() - interval '7 days'
			order by completed_on desc
			limit ${limit}`);
		return rows.map((r) => ({
			id: r.id,
			name: r.name,
			at: asDate(r.completed_on),
			retries: Number(r.retry_count),
			message: r.message,
		}));
	} catch (err) {
		logger.warn({ err }, "admin ops: failed jobs not readable");
		return null;
	}
}

// Wie PgBoss.retry (pg-boss 12, plans.retryJobs): nur fehlgeschlagene Jobs,
// ein Versuch mehr. Ohne laufenden Scheduler in diesem Prozess nutzbar.
export async function retryFailedJob(
	name: string,
	id: string,
): Promise<number> {
	const rows = await globalDb.execute<{ id: string }>(sql`
		update pgboss.job
		set state = 'retry', retry_limit = retry_limit + 1, completed_on = null
		where name = ${name} and id = ${id}::uuid and state = 'failed'
		returning id`);
	return rows.length;
}

/** Sofort-Mails, die länger als 30 Minuten nicht zugestellt sind (Zähler). */
export async function stuckImmediateMails(tx: DbTx, now: Date) {
	const [row] = await tx
		.select({ n: sql<number>`count(*)::int` })
		.from(notifications)
		.where(
			and(
				isNull(notifications.emailedAt),
				inArray(notifications.kind, [...IMMEDIATE_MAIL_KINDS]),
				lt(notifications.createdAt, new Date(now.getTime() - 30 * 60_000)),
				gte(
					notifications.createdAt,
					new Date(now.getTime() - 3 * 24 * 60 * 60_000),
				),
			),
		);
	return Number(row?.n ?? 0);
}
