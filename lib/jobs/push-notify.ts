import { orgRunner } from "@/lib/db/with-org";
import { env } from "@/lib/env";
import { logger } from "@/lib/log";
import { pushConfig } from "@/lib/push/config";
import { type PushSender, webPushSender } from "@/lib/push/http";
import { deliverPush, PUSH_MAX_AGE_DAYS } from "@/lib/push/service";
import { pushWorkOrgs } from "./work-orgs";

// Job push-notify (jede Minute, singleton): offene Benachrichtigungen je Org
// als Push zustellen. Ohne Konfiguration tut er nichts; Fehlschläge zählt
// die Benachrichtigung, nach drei geht sie per Mail (lib/jobs/digest.ts).
// Nur Orgs mit Gerät und offener Arbeit (lib/jobs/work-orgs.ts); gesendet
// wird außerhalb der Transaktion (deliverPush mit OrgRunner).

export async function runPushNotify(
	now = new Date(),
	sender?: PushSender,
): Promise<number> {
	const keys = pushConfig();
	if (!keys) return 0;
	const send = sender ?? webPushSender(keys);
	const since = new Date(now.getTime() - PUSH_MAX_AGE_DAYS * 86_400_000);
	let sent = 0;
	let failed = 0;
	for (const orgId of await pushWorkOrgs(since)) {
		const s = await deliverPush(orgRunner(orgId), orgId, send, {
			baseUrl: env().BETTER_AUTH_URL,
			now,
		});
		sent += s.sent;
		failed += s.failed;
	}
	if (sent + failed > 0) logger.info({ sent, failed }, "push notifications");
	return sent;
}
