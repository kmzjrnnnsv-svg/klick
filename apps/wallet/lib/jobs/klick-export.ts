import { klickLinks } from "@wallet/db/schema";
import { exportOrgIds, withOrg } from "@wallet/lib/db/with-org";
import { walletEnv } from "@wallet/lib/env";
import { convertChanges } from "@wallet/lib/export/convert";
import { completeBackfill } from "@wallet/lib/export/link-service";
import { closeDay, heartbeatIfDue } from "@wallet/lib/export/periodic";
import { sendLink } from "@wallet/lib/export/sender";
import type { FetchLike } from "@wallet/lib/export/transport";
import { signerState } from "@wallet/lib/wallet/signer/status";
import { eq } from "drizzle-orm";
import { logger } from "@/lib/log";

// Export nach Klick (Plan both.money, W4), je Minute als singleton: je Org
// mit Verbindung die vermerkten Änderungen in Ereignisse umwandeln, bei
// Bedarf ein Lebenszeichen schreiben, offene Nachlieferungen nachholen und
// dann je aktiver Verbindung senden.

export async function runKlickExport(
	opts: {
		now?: Date;
		fetchImpl?: FetchLike;
		origins?: readonly string[];
		// nur für Tests: diese Orgs statt aller mit Verbindung
		orgIds?: readonly string[];
	} = {},
): Promise<{ orgs: number; events: number; sent: number; failed: number }> {
	const now = opts.now ?? new Date();
	const origins = opts.origins ?? walletEnv().WALLET_KLICK_ORIGINS;
	const orgIds = opts.orgIds ?? (await exportOrgIds());
	let events = 0;
	let sent = 0;
	let failed = 0;
	for (const orgId of orgIds) {
		try {
			const { state } = await signerState(orgId);
			const links = await withOrg({ orgId, userId: null }, async (tx) => {
				const r = await convertChanges(tx, orgId, now);
				const beat = await heartbeatIfDue(tx, orgId, state, now);
				events += r.events + (beat ? 1 : 0);
				return tx
					.select({ id: klickLinks.id, backfilledAt: klickLinks.backfilledAt })
					.from(klickLinks)
					.where(eq(klickLinks.status, "active"));
			});
			for (const link of links) {
				if (!link.backfilledAt)
					events += await completeBackfill(orgId, link.id, now);
				const r = await sendLink(orgId, link.id, {
					origins,
					fetchImpl: opts.fetchImpl,
					now,
				});
				sent += r.sent;
			}
		} catch (e) {
			failed += 1;
			logger.warn({ orgId, err: e }, "klick export failed");
		}
	}
	return { orgs: orgIds.length, events, sent, failed };
}

// Tagesabschluss 00:10 Uhr Berlin (Zeitplan in register.ts)
export async function runDayClose(
	opts: { now?: Date } = {},
): Promise<{ orgs: number }> {
	const now = opts.now ?? new Date();
	let n = 0;
	for (const orgId of await exportOrgIds()) {
		try {
			if (
				await withOrg({ orgId, userId: null }, (tx) => closeDay(tx, orgId, now))
			)
				n += 1;
		} catch (e) {
			logger.warn({ orgId, err: e }, "klick export day close failed");
		}
	}
	return { orgs: n };
}
