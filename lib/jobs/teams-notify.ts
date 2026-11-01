import { orgRunner } from "@/lib/db/with-org";
import { env } from "@/lib/env";
import { logger } from "@/lib/log";
import { teamsConfig } from "@/lib/teams/config";
import { createGraphClient, type GraphClient } from "@/lib/teams/graph";
import { teamsHttpsTransport } from "@/lib/teams/http";
import { deliverTeams, TEAMS_MAX_AGE_DAYS } from "@/lib/teams/service";
import { teamsWorkOrgs } from "./work-orgs";

// Job teams-notify (jede Minute, singleton): offene Benachrichtigungen je Org
// in Microsoft Teams zustellen. Ohne Konfiguration tut er nichts; Fehlschläge
// zählt die Benachrichtigung, nach drei geht sie per Mail (lib/jobs/digest.ts).
// Nur Orgs mit aktiver Freigabe und offener Arbeit (lib/jobs/work-orgs.ts);
// Graph wird außerhalb der Transaktion aufgerufen (deliverTeams mit OrgRunner).

let client: GraphClient | null = null;

export async function runTeamsNotify(
	now = new Date(),
	graph?: GraphClient,
): Promise<number> {
	const config = teamsConfig();
	if (!config) return 0;
	client ??= createGraphClient(config, teamsHttpsTransport());
	const c = graph ?? client;
	const since = new Date(now.getTime() - TEAMS_MAX_AGE_DAYS * 86_400_000);
	let sent = 0;
	let failed = 0;
	for (const orgId of await teamsWorkOrgs(since)) {
		const s = await deliverTeams(orgRunner(orgId), orgId, c, {
			baseUrl: env().BETTER_AUTH_URL,
			now,
		});
		sent += s.sent;
		failed += s.failed;
	}
	if (sent + failed > 0) logger.info({ sent, failed }, "teams notifications");
	return sent;
}
