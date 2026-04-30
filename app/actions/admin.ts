"use server";

import { desc, eq } from "drizzle-orm";
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

export async function listAuditEntries(limit = 200): Promise<AuditLogEntry[]> {
	await requireAdmin();
	return db.select().from(auditLog).orderBy(desc(auditLog.at)).limit(limit);
}
