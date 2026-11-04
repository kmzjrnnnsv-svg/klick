import { db } from "@wallet/db";
import { user } from "@wallet/db/auth-schema";
import { accessRequests } from "@wallet/db/schema";
import type { AccessRequestStatus } from "@wallet/db/schema/enums";
import { and, asc, desc, eq, isNull, lt, ne } from "drizzle-orm";

// „Zugang anfragen“ (Plattform-Tabelle ohne RLS). Schreiben nur aus der
// öffentlichen Route, Lesen und Ändern nur aus dem Mail-Job, der Löschfrist
// und pnpm wallet:admin requests.

export type NewAccessRequest = Pick<
	typeof accessRequests.$inferInsert,
	"name" | "company" | "email" | "purpose" | "message" | "ipHash"
>;

export async function insertAccessRequest(input: NewAccessRequest) {
	const [row] = await db
		.insert(accessRequests)
		.values({ ...input, consentAt: new Date() })
		.returning({ id: accessRequests.id });
	if (!row) throw new Error("access request insert failed");
	return row;
}

// Noch nicht gemeldete Anfragen, älteste zuerst (Job notification-mail)
export async function unnotifiedAccessRequests(limit = 20) {
	return db
		.select()
		.from(accessRequests)
		.where(
			and(isNull(accessRequests.notifiedAt), ne(accessRequests.status, "spam")),
		)
		.orderBy(asc(accessRequests.createdAt))
		.limit(limit);
}

export async function markAccessRequestNotified(id: string, at = new Date()) {
	await db
		.update(accessRequests)
		.set({ notifiedAt: at })
		.where(eq(accessRequests.id, id));
}

// Empfänger:innen der Meldung: der Betrieb von both.money (Plattform-Rolle)
export async function platformAdminEmails(): Promise<string[]> {
	const rows = await db
		.select({ email: user.email })
		.from(user)
		.where(eq(user.role, "admin"));
	return rows.map((r) => r.email);
}

export async function listAccessRequests(opts: { all?: boolean } = {}) {
	return db
		.select({
			id: accessRequests.id,
			name: accessRequests.name,
			company: accessRequests.company,
			email: accessRequests.email,
			purpose: accessRequests.purpose,
			status: accessRequests.status,
			createdAt: accessRequests.createdAt,
		})
		.from(accessRequests)
		.where(opts.all ? undefined : eq(accessRequests.status, "new"))
		.orderBy(desc(accessRequests.createdAt))
		.limit(200);
}

export async function setAccessRequestStatus(
	id: string,
	status: AccessRequestStatus,
): Promise<boolean> {
	const rows = await db
		.update(accessRequests)
		.set({ status })
		.where(eq(accessRequests.id, id))
		.returning({ id: accessRequests.id });
	return rows.length > 0;
}

// Löschfrist: 12 Monate nach der letzten Änderung
export async function pruneAccessRequests(now = new Date()): Promise<number> {
	const cutoff = new Date(now.getTime() - 365 * 86_400_000);
	const rows = await db
		.delete(accessRequests)
		.where(lt(accessRequests.updatedAt, cutoff))
		.returning({ id: accessRequests.id });
	return rows.length;
}
