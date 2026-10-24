import {
	walletAccounts,
	walletAddressBook,
	walletAddresses,
	walletPayouts,
	walletSignerAnchor,
	walletTransfers,
} from "@wallet/db/schema";
import type { OrgTx } from "@wallet/lib/db/with-org";
import { and, asc, eq, gte, inArray } from "drizzle-orm";
import {
	accountData,
	destinationData,
	payoutData,
	transferData,
} from "@/lib/wallet-link/mapping";
import { ceremonyChange } from "./ceremony";
import { emitEvent } from "./emit";
import { emitOrgUpdated } from "./org";

// Nachlieferung beim Verbinden: der heutige Stand als Ereignisse nur für
// diese Verbindung (linkId) — Organisation, Konten, Zieladressen, Zeremonie
// und Bewegungen/Auszahlungen ab dem gewählten Datum.

export async function backfillLink(
	tx: OrgTx,
	orgId: string,
	link: { id: string; accountIds: string[] | null; backfillFrom: Date | null },
	now = new Date(),
): Promise<number> {
	const opts = { linkId: link.id, occurredAt: now };
	let n = 0;
	await emitOrgUpdated(tx, orgId, { linkId: link.id });
	n += 1;
	const scope = link.accountIds;
	const accounts = await tx
		.select()
		.from(walletAccounts)
		.where(
			and(
				eq(walletAccounts.organizationId, orgId),
				scope ? inArray(walletAccounts.id, scope) : undefined,
			),
		)
		.orderBy(asc(walletAccounts.createdAt));
	const ids = accounts.map((a) => a.id);
	const first =
		ids.length > 0
			? await tx
					.select({
						accountId: walletAddresses.accountId,
						address: walletAddresses.address,
					})
					.from(walletAddresses)
					.where(
						and(
							inArray(walletAddresses.accountId, ids),
							eq(walletAddresses.branch, 0),
							eq(walletAddresses.index, 0),
						),
					)
			: [];
	const firstOf = new Map(first.map((f) => [f.accountId, f.address]));
	for (const a of accounts) {
		await emitEvent(
			tx,
			orgId,
			"account.upserted",
			(rev) => accountData(a, firstOf.get(a.id) ?? null, rev),
			opts,
		);
		n += 1;
	}
	const destinations = await tx
		.select()
		.from(walletAddressBook)
		.where(eq(walletAddressBook.organizationId, orgId))
		.orderBy(asc(walletAddressBook.createdAt));
	for (const d of destinations) {
		await emitEvent(
			tx,
			orgId,
			"destination.upserted",
			(rev) => destinationData(d, rev),
			opts,
		);
		n += 1;
	}
	const [anchor] = await tx
		.select({ ceremony: walletSignerAnchor.ceremony })
		.from(walletSignerAnchor)
		.where(eq(walletSignerAnchor.organizationId, orgId))
		.limit(1);
	const ceremony = anchor?.ceremony
		? ceremonyChange(null, anchor.ceremony, now)
		: null;
	if (ceremony) {
		await emitEvent(tx, orgId, "ceremony.recorded", () => ceremony, opts);
		n += 1;
	}
	if (ids.length === 0) return n;
	const network = new Map(accounts.map((a) => [a.id, a.network]));
	const from = link.backfillFrom;
	const transfers = await tx
		.select()
		.from(walletTransfers)
		.where(
			and(
				eq(walletTransfers.organizationId, orgId),
				inArray(walletTransfers.accountId, ids),
				from ? gte(walletTransfers.firstSeenAt, from) : undefined,
			),
		)
		.orderBy(asc(walletTransfers.firstSeenAt));
	for (const t of transfers) {
		const net = network.get(t.accountId);
		if (!net) continue;
		await emitEvent(
			tx,
			orgId,
			"transfer.upserted",
			(rev) => transferData(t, net, rev),
			opts,
		);
		n += 1;
	}
	const payouts = await tx
		.select()
		.from(walletPayouts)
		.where(
			and(
				eq(walletPayouts.organizationId, orgId),
				inArray(walletPayouts.accountId, ids),
				from ? gte(walletPayouts.createdAt, from) : undefined,
			),
		)
		.orderBy(asc(walletPayouts.createdAt));
	for (const p of payouts) {
		const net = network.get(p.accountId);
		if (!net) continue;
		await emitEvent(
			tx,
			orgId,
			"payout.upserted",
			(rev) => payoutData(p, net, rev),
			opts,
		);
		n += 1;
	}
	return n;
}
