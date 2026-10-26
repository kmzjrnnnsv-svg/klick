import { and, isNotNull, isNull, lt, sql } from "drizzle-orm";
import { globalDb } from "@/db";
import { rateLimit, session, verification } from "@/db/auth-schema";
import {
	inquiries,
	notifications,
	policyReaders,
	trustAccessRequests,
} from "@/db/schema";
import { logger } from "@/lib/log";

// Retention (täglich 03:00): abgelaufene Sitzungen, Verifikations-Tokens,
// gelesene Benachrichtigungen > 180 Tage, alte Rate-Limit-Zähler, Anfragen
// 12 Monate nach der letzten Änderung (Kontaktdaten, Art. 5 Abs. 1 lit. e),
// NDA-Anfragen an Trust Center 12 Monate nach Ablauf bzw. Entscheidung
// (docs/legal/datenschutzerklaerung.md, Abschnitt 9), Adressen im
// Richtlinien-Portal, die nie einen Code eingelöst haben, nach 7 Tagen.
// Nie: audit_log (Hash-Kette, GwG § 8), fachliche Register, Nachweise —
// deren Aufbewahrung regelt das Löschkonzept (CC-AST-10), nicht dieser Job.

export const RETENTION = {
	sessionGraceDays: 30,
	verificationGraceDays: 1,
	readNotificationDays: 180,
	rateLimitDays: 7,
	inquiryDays: 365,
	trustRequestDays: 365,
	unconfirmedReaderDays: 7,
} as const;

export function retentionCutoffs(now = new Date()) {
	const minus = (days: number) => new Date(now.getTime() - days * 86_400_000);
	return {
		sessions: minus(RETENTION.sessionGraceDays),
		verifications: minus(RETENTION.verificationGraceDays),
		notifications: minus(RETENTION.readNotificationDays),
		rateLimit: minus(RETENTION.rateLimitDays),
		inquiries: minus(RETENTION.inquiryDays),
		trustRequests: minus(RETENTION.trustRequestDays),
		unconfirmedReaders: minus(RETENTION.unconfirmedReaderDays),
	};
}

export type RetentionSummary = {
	sessions: number;
	verifications: number;
	notifications: number;
	rateLimit: number;
	inquiries: number;
	trustRequests: number;
	unconfirmedReaders: number;
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
		const q = await tx
			.delete(inquiries)
			.where(lt(inquiries.updatedAt, cut.inquiries))
			.returning({ id: inquiries.id });
		// Stichtag: Ablauf der Freigabe, sonst Entscheidung, sonst Eingang
		const tr = await tx
			.delete(trustAccessRequests)
			.where(
				lt(
					sql`coalesce(${trustAccessRequests.expiresAt}, ${trustAccessRequests.decidedAt}, ${trustAccessRequests.createdAt})`,
					cut.trustRequests,
				),
			)
			.returning({ id: trustAccessRequests.id });
		// Richtlinien-Portal: angefragt, nie bestätigt (Kenntnisnahmen gibt
		// es dann nicht)
		const ur = await tx
			.delete(policyReaders)
			.where(
				and(
					isNull(policyReaders.confirmedAt),
					lt(policyReaders.createdAt, cut.unconfirmedReaders),
				),
			)
			.returning({ id: policyReaders.id });
		return {
			sessions: s.length,
			verifications: v.length,
			notifications: n.length,
			rateLimit: r.length,
			inquiries: q.length,
			trustRequests: tr.length,
			unconfirmedReaders: ur.length,
		};
	});
	logger.info({ job: "retention", ...summary }, "retention done");
	return summary;
}
