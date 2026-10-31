import { globalDb } from "@/db";
import { organization } from "@/db/auth-schema";
import { forEachOrg } from "@/lib/db/with-org";
import { env } from "@/lib/env";
import { logger } from "@/lib/log";
import { teamsConfig } from "@/lib/teams/config";
import { createGraphClient, type GraphClient } from "@/lib/teams/graph";
import { teamsHttpsTransport } from "@/lib/teams/http";
import { deliverTeams } from "@/lib/teams/service";

// Job teams-notify (jede Minute, singleton): offene Benachrichtigungen je Org
// in Microsoft Teams zustellen. Ohne Konfiguration tut er nichts; Fehlschläge
// zählt die Benachrichtigung, nach drei geht sie per Mail (lib/jobs/digest.ts).

let client: GraphClient | null = null;

export async function runTeamsNotify(
	now = new Date(),
	graph?: GraphClient,
): Promise<number> {
	const config = teamsConfig();
	if (!config) return 0;
	client ??= createGraphClient(config, teamsHttpsTransport());
	const c = graph ?? client;
	const orgs = await globalDb
		.select({ id: organization.id })
		.from(organization);
	let sent = 0;
	let failed = 0;
	await forEachOrg(
		orgs.map((o) => o.id),
		async (tx, orgId) => {
			const s = await deliverTeams(tx, orgId, c, {
				baseUrl: env().BETTER_AUTH_URL,
				now,
			});
			sent += s.sent;
			failed += s.failed;
		},
	);
	if (sent + failed > 0) logger.info({ sent, failed }, "teams notifications");
	return sent;
}
