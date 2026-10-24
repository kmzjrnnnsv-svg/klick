import { exportOrgIds, withOrg } from "@wallet/lib/db/with-org";
import { convertChanges } from "@wallet/lib/export/convert";
import { closeDay, heartbeatIfDue } from "@wallet/lib/export/periodic";
import { signerState } from "@wallet/lib/wallet/signer/status";
import { logger } from "@/lib/log";

// Export nach Klick (Plan both.money, W4), je Minute als singleton: je Org
// mit Verbindung die vermerkten Änderungen in Ereignisse umwandeln und bei
// Bedarf ein Lebenszeichen schreiben. Das Senden folgt im selben Lauf (W4c).

export async function runKlickExport(
	opts: { now?: Date } = {},
): Promise<{ orgs: number; events: number; failed: number }> {
	const now = opts.now ?? new Date();
	const orgIds = await exportOrgIds();
	let events = 0;
	let failed = 0;
	for (const orgId of orgIds) {
		try {
			const { state } = await signerState(orgId);
			events += await withOrg({ orgId, userId: null }, async (tx) => {
				const r = await convertChanges(tx, orgId, now);
				const beat = await heartbeatIfDue(tx, orgId, state, now);
				return r.events + (beat ? 1 : 0);
			});
		} catch (e) {
			failed += 1;
			logger.warn({ orgId, err: e }, "klick export collect failed");
		}
	}
	return { orgs: orgIds.length, events, failed };
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
