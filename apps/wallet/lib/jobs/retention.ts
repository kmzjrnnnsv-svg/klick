import { db } from "@wallet/db";
import { session, verification } from "@wallet/db/auth-schema";
import { invitations, notifications } from "@wallet/db/schema";
import { forEachOrg, jobOrgIds } from "@wallet/lib/db/with-org";
import { pruneOutbox } from "@wallet/lib/export/periodic";
import { and, eq, isNotNull, lt, or } from "drizzle-orm";

// Löschfristen: gelesene Benachrichtigungen nach 90 Tagen, alle nach
// 12 Monaten; abgelaufene Einladungen auf „expired“; abgelaufene Links,
// Challenges und Sitzungen weg; Export-Ereignisse, die jede Verbindung
// bestätigt hat, nach 30 Tagen. Das Audit-Log bleibt (nur anhängend).
const DAY = 86_400_000;

export async function runRetention(now = new Date()): Promise<void> {
	const t = now.getTime();
	await forEachOrg(await jobOrgIds(), async (tx, orgId) => {
		await pruneOutbox(tx, orgId, now);
		await tx
			.delete(notifications)
			.where(
				or(
					and(
						isNotNull(notifications.readAt),
						lt(notifications.readAt, new Date(t - 90 * DAY)),
					),
					lt(notifications.createdAt, new Date(t - 365 * DAY)),
				),
			);
		await tx
			.update(invitations)
			.set({ status: "expired" })
			.where(
				and(eq(invitations.status, "pending"), lt(invitations.expiresAt, now)),
			);
	});
	await db
		.delete(verification)
		.where(lt(verification.expiresAt, new Date(t - DAY)));
	await db.delete(session).where(lt(session.expiresAt, new Date(t - DAY)));
}
