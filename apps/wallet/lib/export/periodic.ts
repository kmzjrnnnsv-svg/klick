import {
	exportOutbox,
	klickLinks,
	walletAccounts,
	walletTransfers,
} from "@wallet/db/schema";
import type { OrgTx } from "@wallet/lib/db/with-org";
import { and, count, desc, eq, lt, lte, min, ne, sql } from "drizzle-orm";
import type { AssetCode } from "@/lib/wallet/core/assets";
import type { EventData } from "@/lib/wallet-link/events";
import { closedDay, dayAccount } from "@/lib/wallet-link/mapping";
import { emitEvent, hasLinks } from "./emit";

// Regelmäßige Ereignisse für Klick: Tagesabschluss (00:10 Uhr Berlin) und
// Lebenszeichen (alle 15 min, auch ohne Bewegung).

export const HEARTBEAT_MS = 15 * 60_000;

// Tagesabschluss: Knotenstand je aktivem Konto (Blockhöhe, Hash), eingefrorene
// Eingänge und Zahlen der Sanktionsprüfung des Berliner Tages
export async function closeDay(
	tx: OrgTx,
	orgId: string,
	closedAt: Date,
): Promise<boolean> {
	if (!(await hasLinks(tx, orgId))) return false;
	const date = closedDay(closedAt);
	const accounts = await tx
		.select()
		.from(walletAccounts)
		.where(
			and(
				eq(walletAccounts.organizationId, orgId),
				eq(walletAccounts.status, "active"),
			),
		);
	const frozenRows = await tx
		.select({
			accountId: walletTransfers.accountId,
			asset: walletTransfers.asset,
			amount: walletTransfers.amount,
		})
		.from(walletTransfers)
		.where(
			and(
				eq(walletTransfers.organizationId, orgId),
				eq(walletTransfers.frozen, true),
				ne(walletTransfers.status, "dropped"),
			),
		);
	const frozen = new Map<string, Partial<Record<AssetCode, bigint>>>();
	for (const r of frozenRows) {
		const f = frozen.get(r.accountId) ?? {};
		f[r.asset] = (f[r.asset] ?? 0n) + BigInt(r.amount);
		frozen.set(r.accountId, f);
	}
	const screening = await tx
		.select({ result: walletTransfers.screening, n: count() })
		.from(walletTransfers)
		.where(
			and(
				eq(walletTransfers.organizationId, orgId),
				eq(walletTransfers.direction, "in"),
				sql`(${walletTransfers.firstSeenAt} at time zone 'Europe/Berlin')::date = ${date}::date`,
			),
		)
		.groupBy(walletTransfers.screening);
	const countOf = (k: string) =>
		Number(screening.find((s) => s.result === k)?.n ?? 0);
	const data: EventData<"day.closed"> = {
		date,
		timeZone: "Europe/Berlin",
		closedAt: closedAt.toISOString(),
		accounts: accounts.map((a) => dayAccount(a, frozen.get(a.id) ?? {})),
		screening: {
			clear: countOf("clear"),
			hit: countOf("hit"),
			unchecked: countOf("unchecked"),
		},
	};
	await emitEvent(tx, orgId, "day.closed", () => data, {
		occurredAt: closedAt,
	});
	return true;
}

// Lebenszeichen, wenn das letzte älter als HEARTBEAT_MS ist
export async function heartbeatIfDue(
	tx: OrgTx,
	orgId: string,
	signer: EventData<"heartbeat">["signer"],
	now: Date,
): Promise<boolean> {
	if (!(await hasLinks(tx, orgId))) return false;
	const [last] = await tx
		.select({ at: exportOutbox.occurredAt })
		.from(exportOutbox)
		.where(
			and(
				eq(exportOutbox.organizationId, orgId),
				eq(exportOutbox.type, "heartbeat"),
			),
		)
		.orderBy(desc(exportOutbox.seq))
		.limit(1);
	if (last && now.getTime() - last.at.getTime() < HEARTBEAT_MS) return false;
	const nodes = await tx
		.select({
			network: walletAccounts.network,
			height: sql<number | null>`max(${walletAccounts.syncHeight})`,
			syncedAt: sql<Date | null>`max(${walletAccounts.syncedAt})`,
		})
		.from(walletAccounts)
		.where(
			and(
				eq(walletAccounts.organizationId, orgId),
				eq(walletAccounts.status, "active"),
			),
		)
		.groupBy(walletAccounts.network);
	const [acked] = await tx
		.select({ min: min(klickLinks.ackedSeq) })
		.from(klickLinks)
		.where(
			and(
				eq(klickLinks.organizationId, orgId),
				eq(klickLinks.status, "active"),
			),
		);
	const [pending] = await tx
		.select({ n: count() })
		.from(exportOutbox)
		.where(
			and(
				eq(exportOutbox.organizationId, orgId),
				sql`${exportOutbox.seq} > ${Number(acked?.min ?? 0)}`,
			),
		);
	await emitEvent(
		tx,
		orgId,
		"heartbeat",
		() => ({
			at: now.toISOString(),
			signer,
			nodes: nodes.map((n) => ({
				network: n.network,
				height: n.height === null ? null : Number(n.height),
				syncedAt: n.syncedAt ? new Date(n.syncedAt).toISOString() : null,
			})),
			pending: Number(pending?.n ?? 0),
		}),
		{ occurredAt: now },
	);
	return true;
}

// Ausgang aufräumen: was jede nicht widerrufene Verbindung bestätigt hat
// (ohne Verbindung: alles), sobald es älter als 30 Tage ist. In Klick
// bleiben die Rohereignisse nach dessen Fristen.
export const OUTBOX_KEEP_DAYS = 30;

export async function pruneOutbox(
	tx: OrgTx,
	orgId: string,
	now: Date,
): Promise<void> {
	const [acked] = await tx
		.select({ min: min(klickLinks.ackedSeq), n: count() })
		.from(klickLinks)
		.where(
			and(
				eq(klickLinks.organizationId, orgId),
				ne(klickLinks.status, "revoked"),
			),
		);
	const before = new Date(now.getTime() - OUTBOX_KEEP_DAYS * 86_400_000);
	await tx
		.delete(exportOutbox)
		.where(
			and(
				eq(exportOutbox.organizationId, orgId),
				lt(exportOutbox.createdAt, before),
				...(Number(acked?.n ?? 0) > 0
					? [lte(exportOutbox.seq, Number(acked?.min ?? 0))]
					: []),
			),
		);
}
