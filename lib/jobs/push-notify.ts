import { globalDb } from "@/db";
import { organization } from "@/db/auth-schema";
import { forEachOrg } from "@/lib/db/with-org";
import { env } from "@/lib/env";
import { logger } from "@/lib/log";
import { pushConfig } from "@/lib/push/config";
import { type PushSender, webPushSender } from "@/lib/push/http";
import { deliverPush } from "@/lib/push/service";

// Job push-notify (jede Minute, singleton): offene Benachrichtigungen je Org
// als Push zustellen. Ohne Konfiguration tut er nichts; Fehlschläge zählt
// die Benachrichtigung, nach drei geht sie per Mail (lib/jobs/digest.ts).

export async function runPushNotify(
	now = new Date(),
	sender?: PushSender,
): Promise<number> {
	const keys = pushConfig();
	if (!keys) return 0;
	const send = sender ?? webPushSender(keys);
	const orgs = await globalDb
		.select({ id: organization.id })
		.from(organization);
	let sent = 0;
	let failed = 0;
	await forEachOrg(
		orgs.map((o) => o.id),
		async (tx, orgId) => {
			const s = await deliverPush(tx, orgId, send, {
				baseUrl: env().BETTER_AUTH_URL,
				now,
			});
			sent += s.sent;
			failed += s.failed;
		},
	);
	if (sent + failed > 0) logger.info({ sent, failed }, "push notifications");
	return sent;
}
