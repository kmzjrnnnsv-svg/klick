import { db } from "@wallet/db";
import { user } from "@wallet/db/auth-schema";
import { notifications } from "@wallet/db/schema";
import { baseURL } from "@wallet/lib/auth/config";
import { forEachOrg, jobOrgIds } from "@wallet/lib/db/with-org";
import { sendWalletMail, walletMail } from "@wallet/lib/mail/templates";
import { IMMEDIATE_MAIL_KINDS } from "@wallet/lib/notifications/notify";
import { and, eq, gt, inArray, isNull } from "drizzle-orm";
import { logger } from "@/lib/log";

// Sofort-Mails (Sicherheit, Signer) je Org und Benachrichtigung; emailedAt
// erst nach erfolgreichem Versand. Älteres als 24 h bleibt in der Glocke.
export async function runImmediateMails(now = new Date()): Promise<number> {
	let sent = 0;
	await forEachOrg(await jobOrgIds(), async (tx) => {
		const due = await tx
			.select({
				id: notifications.id,
				userId: notifications.userId,
				title: notifications.title,
				body: notifications.body,
				link: notifications.link,
			})
			.from(notifications)
			.where(
				and(
					isNull(notifications.emailedAt),
					inArray(notifications.kind, [...IMMEDIATE_MAIL_KINDS]),
					gt(notifications.createdAt, new Date(now.getTime() - 86_400_000)),
				),
			)
			.limit(50);
		for (const n of due) {
			const [u] = await db
				.select({ email: user.email })
				.from(user)
				.where(eq(user.id, n.userId))
				.limit(1);
			if (!u) continue;
			const res = await sendWalletMail(
				u.email,
				walletMail({
					subject: `both.money: ${n.title}`,
					title: n.title,
					body: n.body ?? "",
					cta: {
						label: "In both.money öffnen",
						url: `${baseURL}${n.link ?? "/"}`,
					},
				}),
			);
			if (!res.ok) {
				logger.warn({ notification: n.id }, "Sofort-Mail nicht zugestellt");
				continue;
			}
			await tx
				.update(notifications)
				.set({ emailedAt: new Date() })
				.where(eq(notifications.id, n.id));
			sent += 1;
		}
	});
	return sent;
}
