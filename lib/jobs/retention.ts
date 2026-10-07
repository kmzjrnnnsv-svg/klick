import { and, isNotNull, lt, sql } from "drizzle-orm";
import { globalDb } from "@/db";
import { rateLimit, session, verification } from "@/db/auth-schema";
import { notifications } from "@/db/schema";
import { logger } from "@/lib/log";

// Retention (täglich 03:00): abgelaufene Sitzungen, Verifikations-Tokens,
// gelesene Benachrichtigungen > 180 Tage, alte Rate-Limit-Zähler.
// Nie: audit_log (Hash-Kette, GwG § 8), fachliche Register, Nachweise —
// deren Aufbewahrung regelt das Löschkonzept (CC-AST-10), nicht dieser Job.

export const RETENTION = {
	sessionGraceDays: 30,
	verificationGraceDays: 1,
	readNotificationDays: 180,
	rateLimitDays: 7,
} as const;

export function retentionCutoffs(now = new Date()) {
	const minus = (days: number) => new Date(now.getTime() - days * 86_400_000);
	return {
		sessions: minus(RETENTION.sessionGraceDays),
		verifications: minus(RETENTION.verificationGraceDays),
		notifications: minus(RETENTION.readNotificationDays),
		rateLimit: minus(RETENTION.rateLimitDays),
	};
}

export type RetentionSummary = {
	sessions: number;
	verifications: number;
	notifications: number;
	rateLimit: number;
};

export async function runRetention(
	now = new Date(),
): Promise<RetentionSummary> {
	const cut = retentionCutoffs(now);
	const summary = await globalDb.transaction(async (tx) => {
		// notifications ist RLS-geschützt → Plattform-Kontext für den Hausputz.
		await tx.execute(sql`select set_config('app.scope', 'platform', true)`);
		const s = await tx
			.delete(session)
			.where(lt(session.expiresAt, cut.sessions))
			.returning({ id: session.id });
		const v = await tx
			.delete(verification)
			.where(lt(verification.expiresAt, cut.verifications))
			.returning({ id: verification.id });
		const n = await tx
			.delete(notifications)
			.where(
				and(
					isNotNull(notifications.readAt),
					lt(notifications.createdAt, cut.notifications),
				),
			)
			.returning({ id: notifications.id });
		const r = await tx
			.delete(rateLimit)
			.where(lt(rateLimit.lastRequest, cut.rateLimit.getTime()))
			.returning({ id: rateLimit.id });
		return {
			sessions: s.length,
			verifications: v.length,
			notifications: n.length,
			rateLimit: r.length,
		};
	});
	logger.info({ job: "retention", ...summary }, "retention done");
	return summary;
}
