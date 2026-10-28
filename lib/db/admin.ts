// Lader für die Übersicht des Plattform-Admins (Plattform-Metadaten, keine
// Inhalte einer Organisation). Zusammengesetzt wird rein in
// lib/admin/overview.ts.
import { sql } from "drizzle-orm";
import { globalDb } from "@/db";
import type { OverviewInput } from "@/lib/admin/overview";
import { env } from "@/lib/env";
import { logger } from "@/lib/log";
import { platformCounts } from "./global";
import { inquiryCounts } from "./inquiries";
import { latestAnchor } from "./ledger";
import { allGrants } from "./platform-access";

/** Fehlgeschlagene Hintergrundaufgaben der letzten 24 h (pg-boss), null = nicht lesbar. */
export async function failedJobs24h(): Promise<number | null> {
	try {
		const [row] = await globalDb.execute<{ n: number }>(
			sql`select count(*)::int as n from pgboss.job
				where state = 'failed' and completed_on > now() - interval '24 hours'`,
		);
		return Number(row?.n ?? 0);
	} catch (err) {
		logger.warn({ err }, "admin overview: pg-boss not readable");
		return null;
	}
}

export async function loadOverviewInput(now: Date): Promise<OverviewInput> {
	const [counts, inquiries, grants, failed, anchor] = await Promise.all([
		platformCounts(),
		inquiryCounts(),
		allGrants(500),
		failedJobs24h(),
		latestAnchor({}),
	]);
	return {
		now,
		counts,
		newInquiries: inquiries.get("new") ?? 0,
		grants,
		jobs: failed === null ? null : { failed24h: failed },
		anchor: anchor
			? { createdAt: anchor.createdAt, status: anchor.status }
			: null,
		acceptedRisks:
			env().NODE_ENV === "production" ? env().PROD_ACCEPT_RISKS : [],
	};
}
