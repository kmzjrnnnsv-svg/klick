"use server";

import { and, desc, eq, gte, ilike, sql } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { type AuditLogEntry, auditLog, users } from "@/db/schema";

async function requireAdmin() {
	const session = await auth();
	if (!session?.user?.id) throw new Error("unauthenticated");
	const [user] = await db
		.select({ role: users.role })
		.from(users)
		.where(eq(users.id, session.user.id))
		.limit(1);
	if (user?.role !== "admin") throw new Error("forbidden");
}

export type AuditFilters = {
	action?: string;
	q?: string; // free-text over target
	since?: "1h" | "24h" | "7d" | "30d";
};

export async function listAuditEntries(
	filters: AuditFilters = {},
	limit = 200,
): Promise<AuditLogEntry[]> {
	await requireAdmin();
	const conds = [];
	if (filters.action) conds.push(eq(auditLog.action, filters.action));
	if (filters.q) conds.push(ilike(auditLog.target, `%${filters.q}%`));
	if (filters.since) {
		const ms: Record<string, number> = {
			"1h": 60 * 60 * 1000,
			"24h": 24 * 60 * 60 * 1000,
			"7d": 7 * 24 * 60 * 60 * 1000,
			"30d": 30 * 24 * 60 * 60 * 1000,
		};
		conds.push(gte(auditLog.at, new Date(Date.now() - ms[filters.since])));
	}
	return db
		.select()
		.from(auditLog)
		.where(conds.length > 0 ? and(...conds) : undefined)
		.orderBy(desc(auditLog.at))
		.limit(limit);
}

export async function listAuditActions(): Promise<string[]> {
	await requireAdmin();
	const rows = await db
		.select({ action: auditLog.action, n: sql<number>`count(*)`.as("n") })
		.from(auditLog)
		.groupBy(auditLog.action)
		.orderBy(desc(sql<number>`count(*)`));
	return rows.map((r) => r.action);
}
