import { sql } from "drizzle-orm";
import { mainDb } from "@/lib/db/job-scope";
import type { OrgTx } from "@/lib/db/with-org";
import {
	PUSH_MAX_ATTEMPTS,
	TEAMS_MAX_ATTEMPTS,
} from "@/lib/notifications/channels";

// Welche Orgs haben für einen Job überhaupt Arbeit (P4, Nov 2026)? Eine
// Abfrage im Plattform-Scope über alle Orgs, nur lesend und nur Kennungen —
// statt jede Minute für jede Org eine Transaktion zu öffnen. Die Abfragen
// laufen über die kleinen Tabellen (Geräte, Teams-Freigaben) bzw. über den
// Teil-Index der ungemailten Benachrichtigungen (Migration 0065), damit der
// Aufwand nicht mit allen Benachrichtigungen wächst. Die eigentliche Arbeit
// geschieht danach je Org in deren eigenem Kontext (RLS).

async function platformRead<T>(fn: (tx: OrgTx) => Promise<T>): Promise<T> {
	return mainDb().transaction(async (tx) => {
		await tx.execute(sql`set transaction read only`);
		await tx.execute(sql`select set_config('app.scope', 'platform', true)`);
		return fn(tx);
	});
}

const ids = (rows: Iterable<{ id: string }>) => [...rows].map((r) => r.id);

// Push: Orgs mit Gerät, für dessen Person eine offene Benachrichtigung wartet
export function pushWorkOrgs(since: Date): Promise<string[]> {
	return platformRead(async (tx) =>
		ids(
			await tx.execute<{ id: string }>(sql`
				select distinct s.organization_id as id from push_subscriptions s
				where exists (
					select 1 from notifications n
					where n.organization_id = s.organization_id
					  and n.user_id = s.user_id
					  and n.created_at >= ${since.toISOString()}
					  and n.push_sent_at is null
					  and n.push_attempts < ${PUSH_MAX_ATTEMPTS})`),
		),
	);
}

// Teams: Orgs mit aktiver, eingeschalteter Freigabe und offener Arbeit
export function teamsWorkOrgs(since: Date): Promise<string[]> {
	return platformRead(async (tx) =>
		ids(
			await tx.execute<{ id: string }>(sql`
				select t.organization_id as id from teams_integrations t
				where t.status = 'active' and t.enabled
				  and exists (
					select 1 from notifications n
					where n.organization_id = t.organization_id
					  and n.created_at >= ${since.toISOString()}
					  and n.teams_sent_at is null
					  and n.teams_attempts < ${TEAMS_MAX_ATTEMPTS})`),
		),
	);
}

// Mail: Orgs mit ungemailten Benachrichtigungen (optional nur bestimmte
// Arten und ab einem Zeitpunkt, für die Sofort-Mails)
export function mailWorkOrgs(
	opts: { kinds?: readonly string[]; since?: Date } = {},
): Promise<string[]> {
	const kinds = opts.kinds?.length
		? sql`and kind in (${sql.join(
				opts.kinds.map((k) => sql`${k}`),
				sql`, `,
			)})`
		: sql``;
	const since = opts.since
		? sql`and created_at >= ${opts.since.toISOString()}`
		: sql``;
	return platformRead(async (tx) =>
		ids(
			await tx.execute<{ id: string }>(sql`
				select distinct organization_id as id from notifications
				where emailed_at is null and organization_id is not null
				${kinds} ${since}`),
		),
	);
}
