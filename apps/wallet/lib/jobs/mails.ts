import { db } from "@wallet/db";
import { user } from "@wallet/db/auth-schema";
import { notifications } from "@wallet/db/schema";
import { PURPOSE_LABEL } from "@wallet/lib/access-requests/rules";
import { baseURL } from "@wallet/lib/auth/config";
import {
	markAccessRequestNotified,
	platformAdminEmails,
	unnotifiedAccessRequests,
} from "@wallet/lib/db/access-requests";
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

// „Zugang anfragen“: je neuer Anfrage eine Mail an den Betrieb (Plattform-
// Rolle admin), nie an die angegebene Adresse. Persönliche Angaben nur im
// Text, nie im Betreff (Zustellfehler loggen den Betreff). Ohne
// Empfänger:innen bleibt die Anfrage ungemeldet und kommt im nächsten Lauf
// wieder; „gemeldet“ erst, wenn mindestens eine Mail zugestellt ist.
export async function runAccessRequestMails(): Promise<number> {
	const due = await unnotifiedAccessRequests();
	if (due.length === 0) return 0;
	const to = await platformAdminEmails();
	if (to.length === 0) {
		logger.warn(
			{ open: due.length },
			"Zugangsanfragen ohne Empfänger:innen (keine Plattform-Admins)",
		);
		return 0;
	}
	let sent = 0;
	for (const r of due) {
		const mail = walletMail({
			subject: "both.money: neue Zugangsanfrage",
			title: "Neue Zugangsanfrage",
			body: [
				`Name: ${r.name}`,
				`Unternehmen: ${r.company}`,
				`E-Mail: ${r.email}`,
				`Wofür: ${PURPOSE_LABEL[r.purpose]}`,
				...(r.message ? ["", r.message] : []),
				"",
				`Kennung: ${r.id}`,
				"Stand setzen: pnpm wallet:admin requests status --id <Kennung> --status contacted|closed|spam",
			].join("\n"),
		});
		let ok = false;
		for (const address of to)
			if ((await sendWalletMail(address, mail)).ok) ok = true;
		if (!ok) {
			logger.warn({ request: r.id }, "Zugangsanfrage nicht zugestellt");
			continue;
		}
		await markAccessRequestNotified(r.id);
		sent += 1;
	}
	return sent;
}
