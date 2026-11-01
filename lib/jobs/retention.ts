import { and, isNull, lt, type SQL, sql } from "drizzle-orm";
import { rateLimit, session, verification } from "@/db/auth-schema";
import {
	inquiries,
	policyReaders,
	ssoProbes,
	trustAccessRequests,
} from "@/db/schema";
import { mainDb } from "@/lib/db/job-scope";
import { logger } from "@/lib/log";

// Retention (täglich 03:00): abgelaufene Sitzungen, Verifikations-Tokens,
// gelesene Benachrichtigungen > 180 Tage, alte Rate-Limit-Zähler, Anfragen
// 12 Monate nach der letzten Änderung (Kontaktdaten, Art. 5 Abs. 1 lit. e),
// NDA-Anfragen an Trust Center 12 Monate nach Ablauf bzw. Entscheidung
// (docs/legal/datenschutzerklaerung.md, Abschnitt 9), Adressen im
// Richtlinien-Portal, die nie einen Code eingelöst haben, nach 7 Tagen,
// SSO-Proben (was der Anbieter über die Testperson schickte) nach einem Tag,
// ungelesene Benachrichtigungen nach einem Jahr, abgelaufene oder widerrufene
// Zugangs-Token nach 90 Tagen, abgelaufene SSO-Einrichtungsanfragen der IT
// nach 30 Tagen. Große Tabellen (Benachrichtigungen) in Blöcken zu je
// RETENTION_BLOCK Zeilen, jeder Block eine eigene kurze Transaktion — so
// sperrt der Hausputz nichts lange und bleibt unter der Zeitgrenze (P4).
// Nie: audit_log (Hash-Kette, GwG § 8), fachliche Register, Nachweise —
// deren Aufbewahrung regelt das Löschkonzept (CC-AST-10), nicht dieser Job.

export const RETENTION = {
	sessionGraceDays: 30,
	verificationGraceDays: 1,
	readNotificationDays: 180,
	unreadNotificationDays: 365,
	expiredTokenDays: 90,
	ssoSetupRequestDays: 30,
	rateLimitDays: 7,
	inquiryDays: 365,
	trustRequestDays: 365,
	unconfirmedReaderDays: 7,
	ssoProbeDays: 1,
} as const;

export function retentionCutoffs(now = new Date()) {
	const minus = (days: number) => new Date(now.getTime() - days * 86_400_000);
	return {
		sessions: minus(RETENTION.sessionGraceDays),
		verifications: minus(RETENTION.verificationGraceDays),
		notifications: minus(RETENTION.readNotificationDays),
		unreadNotifications: minus(RETENTION.unreadNotificationDays),
		tokens: minus(RETENTION.expiredTokenDays),
		ssoSetupRequests: minus(RETENTION.ssoSetupRequestDays),
		rateLimit: minus(RETENTION.rateLimitDays),
		inquiries: minus(RETENTION.inquiryDays),
		trustRequests: minus(RETENTION.trustRequestDays),
		unconfirmedReaders: minus(RETENTION.unconfirmedReaderDays),
		ssoProbes: minus(RETENTION.ssoProbeDays),
	};
}

// Rohes SQL nimmt Zeitpunkte als Text (postgres.js bindet Date dort nicht)
const iso = (d: Date) => d.toISOString();

export type RetentionSummary = {
	sessions: number;
	verifications: number;
	notifications: number;
	tokens: number;
	ssoSetupRequests: number;
	rateLimit: number;
	inquiries: number;
	trustRequests: number;
	unconfirmedReaders: number;
	ssoProbes: number;
};

export async function runRetention(
	now = new Date(),
): Promise<RetentionSummary> {
	const cut = retentionCutoffs(now);
	const summary = await mainDb().transaction(async (tx) => {
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
		const tok = await tx.execute<{ n: number }>(sql`
			with d as (delete from access_tokens
			  where revoked_at < ${iso(cut.tokens)} or expires_at < ${iso(cut.tokens)}
			  returning 1)
			select count(*)::int as n from d`);
		const ssr = await tx.execute<{ n: number }>(sql`
			with d as (delete from sso_setup_requests
			  where expires_at < ${iso(cut.ssoSetupRequests)} returning 1)
			select count(*)::int as n from d`);
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
				// Rohes SQL: Zeitpunkt als Text (postgres.js bindet Date dort
				// nicht; bis Nov 2026 brach der ganze Lauf hier ab)
				sql`coalesce(${trustAccessRequests.expiresAt}, ${trustAccessRequests.decidedAt}, ${trustAccessRequests.createdAt}) < ${iso(cut.trustRequests)}`,
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
		const sp = await tx
			.delete(ssoProbes)
			.where(lt(ssoProbes.createdAt, cut.ssoProbes))
			.returning({ id: ssoProbes.id });
		return {
			notifications: 0,
			sessions: s.length,
			verifications: v.length,
			tokens: Number(tok[0]?.n ?? 0),
			ssoSetupRequests: Number(ssr[0]?.n ?? 0),
			rateLimit: r.length,
			inquiries: q.length,
			trustRequests: tr.length,
			unconfirmedReaders: ur.length,
			ssoProbes: sp.length,
		};
	});
	summary.notifications =
		(await deleteInBlocks(
			"notifications",
			sql`read_at is not null and created_at < ${iso(cut.notifications)}`,
		)) +
		(await deleteInBlocks(
			"notifications",
			sql`read_at is null and created_at < ${iso(cut.unreadNotifications)}`,
		));
	logger.info({ job: "retention", ...summary }, "retention done");
	return summary;
}

export const RETENTION_BLOCK = 5_000;
// höchstens so viele Blöcke je Lauf (der Rest folgt am nächsten Tag)
const MAX_BLOCKS = 200;

// Löschen in Blöcken, jeder Block eine eigene Transaktion im Plattform-Scope
async function deleteInBlocks(
	table: "notifications",
	where: SQL,
): Promise<number> {
	let total = 0;
	for (let i = 0; i < MAX_BLOCKS; i++) {
		const n = await mainDb().transaction(async (tx) => {
			await tx.execute(sql`select set_config('app.scope', 'platform', true)`);
			const res = await tx.execute<{ n: number }>(sql`
				with d as (delete from ${sql.identifier(table)} where id in (
				  select id from ${sql.identifier(table)} where ${where}
				  limit ${RETENTION_BLOCK}) returning 1)
				select count(*)::int as n from d`);
			return Number(res[0]?.n ?? 0);
		});
		total += n;
		if (n < RETENTION_BLOCK) break;
	}
	return total;
}
