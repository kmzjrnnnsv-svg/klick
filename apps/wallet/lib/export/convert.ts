import {
	auditLog,
	exportAlerts,
	exportChanges,
	walletAccounts,
	walletAddressBook,
	walletAddresses,
	walletPayouts,
	walletSignerAnchor,
	walletTransfers,
} from "@wallet/db/schema";
import type { OrgTx } from "@wallet/lib/db/with-org";
import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import type { AlertCode } from "@/lib/wallet-link/events";
import {
	accountData,
	destinationData,
	payoutData,
	transferData,
} from "@/lib/wallet-link/mapping";
import { alertFromAudit, signerAlertChanges } from "./alerts";
import { emitEvent, hasLinks } from "./emit";

// Vermerkte Änderungen (export_changes) → Ereignisse im Ausgang. Läuft im
// Export-Job je Org in einer Transaktion: Zeilen mit FOR UPDATE SKIP LOCKED
// holen, aktuellen Stand lesen, Ereignisse schreiben, Zeilen löschen. Ein
// Rollback einer fachlichen Transaktion hinterlässt keine Änderung, also auch
// kein Ereignis. Mehrere Änderungen derselben Entität ergeben ein Ereignis
// mit dem letzten Stand.

const BATCH = 500;

export async function convertChanges(
	tx: OrgTx,
	orgId: string,
	now = new Date(),
): Promise<{ events: number; dropped: number }> {
	const changes = await tx
		.select()
		.from(exportChanges)
		.where(eq(exportChanges.organizationId, orgId))
		.orderBy(asc(exportChanges.id))
		.limit(BATCH)
		.for("update", { skipLocked: true });
	const linked = await hasLinks(tx, orgId);
	let events = 0;
	if (linked) {
		const ids = (entity: string) => [
			...new Set(
				changes.filter((c) => c.entity === entity).map((c) => c.entityId),
			),
		];
		events += await accounts(tx, orgId, ids("account"));
		events += await transfers(tx, orgId, ids("transfer"));
		events += await payouts(tx, orgId, ids("payout"));
		events += await destinations(tx, orgId, ids("destination"));
		events += await auditAlerts(tx, orgId, ids("audit"));
		events += await signerState(tx, orgId, now);
	}
	if (changes.length > 0)
		await tx.delete(exportChanges).where(
			inArray(
				exportChanges.id,
				changes.map((c) => c.id),
			),
		);
	return { events, dropped: linked ? 0 : changes.length };
}

async function accounts(tx: OrgTx, orgId: string, ids: string[]) {
	if (ids.length === 0) return 0;
	const rows = await tx
		.select()
		.from(walletAccounts)
		.where(
			and(
				eq(walletAccounts.organizationId, orgId),
				inArray(walletAccounts.id, ids),
			),
		);
	const first = await tx
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
		);
	const firstOf = new Map(first.map((f) => [f.accountId, f.address]));
	for (const a of rows)
		await emitEvent(tx, orgId, "account.upserted", (rev) =>
			accountData(a, firstOf.get(a.id) ?? null, rev),
		);
	return rows.length;
}

async function transfers(tx: OrgTx, orgId: string, ids: string[]) {
	if (ids.length === 0) return 0;
	const rows = await tx
		.select({ t: walletTransfers, network: walletAccounts.network })
		.from(walletTransfers)
		.innerJoin(walletAccounts, eq(walletAccounts.id, walletTransfers.accountId))
		.where(
			and(
				eq(walletTransfers.organizationId, orgId),
				inArray(walletTransfers.id, ids),
			),
		)
		.orderBy(asc(walletTransfers.firstSeenAt));
	for (const r of rows)
		await emitEvent(tx, orgId, "transfer.upserted", (rev) =>
			transferData(r.t, r.network, rev),
		);
	return rows.length;
}

async function payouts(tx: OrgTx, orgId: string, ids: string[]) {
	if (ids.length === 0) return 0;
	const rows = await tx
		.select({ p: walletPayouts, network: walletAccounts.network })
		.from(walletPayouts)
		.innerJoin(walletAccounts, eq(walletAccounts.id, walletPayouts.accountId))
		.where(
			and(
				eq(walletPayouts.organizationId, orgId),
				inArray(walletPayouts.id, ids),
			),
		)
		.orderBy(asc(walletPayouts.createdAt));
	for (const r of rows)
		await emitEvent(tx, orgId, "payout.upserted", (rev) =>
			payoutData(r.p, r.network, rev),
		);
	return rows.length;
}

async function destinations(tx: OrgTx, orgId: string, ids: string[]) {
	if (ids.length === 0) return 0;
	const rows = await tx
		.select()
		.from(walletAddressBook)
		.where(
			and(
				eq(walletAddressBook.organizationId, orgId),
				inArray(walletAddressBook.id, ids),
			),
		)
		.orderBy(asc(walletAddressBook.createdAt));
	for (const d of rows)
		await emitEvent(tx, orgId, "destination.upserted", (rev) =>
			destinationData(d, rev),
		);
	return rows.length;
}

async function auditAlerts(tx: OrgTx, orgId: string, ids: string[]) {
	if (ids.length === 0) return 0;
	const rows = await tx
		.select({
			id: auditLog.id,
			action: auditLog.action,
			target: auditLog.target,
			after: auditLog.after,
			at: auditLog.at,
		})
		.from(auditLog)
		.where(and(eq(auditLog.organizationId, orgId), inArray(auditLog.id, ids)))
		.orderBy(asc(auditLog.seq));
	let n = 0;
	for (const row of rows) {
		const data = alertFromAudit(row);
		if (!data) continue;
		await tx
			.insert(exportAlerts)
			.values({
				organizationId: orgId,
				alertId: data.alertId,
				code: data.code,
				subjectKind: data.subject?.kind ?? null,
				subjectId: data.subject?.id ?? null,
				raisedAt: row.at,
			})
			.onConflictDoNothing();
		await emitEvent(tx, orgId, "alert.raised", () => data, {
			occurredAt: row.at,
		});
		n += 1;
	}
	return n;
}

// Signer eingefroren / nicht erreichbar: Abgleich Anker ↔ offene Meldungen
async function signerState(tx: OrgTx, orgId: string, now: Date) {
	const [anchor] = await tx
		.select()
		.from(walletSignerAnchor)
		.where(eq(walletSignerAnchor.organizationId, orgId))
		.limit(1);
	if (!anchor) return 0;
	const open = await tx
		.select({ alertId: exportAlerts.alertId, code: exportAlerts.code })
		.from(exportAlerts)
		.where(
			and(
				eq(exportAlerts.organizationId, orgId),
				isNull(exportAlerts.resolvedAt),
				inArray(exportAlerts.code, [
					"manual_stop",
					"signer_frozen",
					"signer_unreachable",
				]),
			),
		);
	let frozenByApp = false;
	if (anchor.frozen) {
		const [last] = await tx
			.select({ after: auditLog.after })
			.from(auditLog)
			.where(
				and(
					eq(auditLog.organizationId, orgId),
					eq(auditLog.action, "wallet.signer_frozen"),
				),
			)
			.orderBy(desc(auditLog.seq))
			.limit(1);
		const after = (last?.after ?? {}) as { reason?: string; by?: string };
		frozenByApp = after.by === "app" && after.reason === anchor.frozenReason;
	}
	const { raise, resolve } = signerAlertChanges(
		{
			orgId,
			frozen: anchor.frozen,
			frozenReason: anchor.frozenReason,
			frozenByApp,
			unreachableSince: anchor.unreachableSince,
		},
		open.map((o) => ({ alertId: o.alertId, code: o.code as AlertCode })),
		now,
	);
	for (const data of raise) {
		await tx.insert(exportAlerts).values({
			organizationId: orgId,
			alertId: data.alertId,
			code: data.code,
			subjectKind: "signer",
			subjectId: orgId,
			raisedAt: new Date(data.raisedAt),
		});
		await emitEvent(tx, orgId, "alert.raised", () => data, { occurredAt: now });
	}
	for (const data of resolve) {
		await tx
			.update(exportAlerts)
			.set({ resolvedAt: now })
			.where(
				and(
					eq(exportAlerts.organizationId, orgId),
					eq(exportAlerts.alertId, data.alertId),
				),
			);
		await emitEvent(tx, orgId, "alert.resolved", () => data, {
			occurredAt: now,
		});
	}
	return raise.length + resolve.length;
}
