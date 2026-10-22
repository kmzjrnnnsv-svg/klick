import { and, asc, count, desc, eq, isNotNull, ne, sql } from "drizzle-orm";
import {
	walletAccounts,
	walletAddresses,
	wallets,
	walletTransfers,
} from "@/db/schema";
import type { WalletAccount, WalletTransfer } from "@/db/schema/wallet";
import type { OrgTx } from "@/lib/db/with-org";
import type { AssetCode } from "./core/assets";
import type { WalletNetwork } from "./core/networks";

// Lesen im Wallet-Bereich (immer im Org-Kontext, RLS greift zusätzlich).

export async function listWalletAccounts(
	tx: OrgTx,
	orgId: string,
	opts: { includeRetired?: boolean } = {},
): Promise<WalletAccount[]> {
	return tx
		.select()
		.from(walletAccounts)
		.where(
			and(
				eq(walletAccounts.organizationId, orgId),
				opts.includeRetired ? undefined : eq(walletAccounts.status, "active"),
			),
		)
		.orderBy(asc(walletAccounts.network), asc(walletAccounts.name));
}

export async function getWalletAccount(
	tx: OrgTx,
	orgId: string,
	id: string,
): Promise<WalletAccount | null> {
	const [row] = await tx
		.select()
		.from(walletAccounts)
		.where(
			and(eq(walletAccounts.id, id), eq(walletAccounts.organizationId, orgId)),
		)
		.limit(1);
	return row ?? null;
}

// Ausgegebene Empfangsadressen eines Kontos (neueste zuerst)
export async function issuedAddresses(
	tx: OrgTx,
	orgId: string,
	accountId: string,
) {
	return tx
		.select({
			id: walletAddresses.id,
			index: walletAddresses.index,
			address: walletAddresses.address,
			label: walletAddresses.label,
			issuedAt: walletAddresses.issuedAt,
			firstSeenAt: walletAddresses.firstSeenAt,
		})
		.from(walletAddresses)
		.where(
			and(
				eq(walletAddresses.organizationId, orgId),
				eq(walletAddresses.accountId, accountId),
				eq(walletAddresses.branch, 0),
				isNotNull(walletAddresses.issuedAt),
			),
		)
		.orderBy(desc(walletAddresses.index));
}

export type TransferRow = Pick<
	WalletTransfer,
	| "id"
	| "accountId"
	| "direction"
	| "asset"
	| "amount"
	| "txid"
	| "outputRef"
	| "address"
	| "counterparty"
	| "blockHeight"
	| "blockTime"
	| "confirmations"
	| "status"
	| "screening"
	| "frozen"
	| "firstSeenAt"
> & { accountName: string; network: WalletNetwork };

export async function listTransfers(
	tx: OrgTx,
	orgId: string,
	opts: {
		accountId?: string | null;
		direction?: "in" | "out" | null;
		limit?: number;
		offset?: number;
		includeDropped?: boolean;
	} = {},
): Promise<{ rows: TransferRow[]; total: number }> {
	const where = and(
		eq(walletTransfers.organizationId, orgId),
		opts.accountId ? eq(walletTransfers.accountId, opts.accountId) : undefined,
		opts.direction ? eq(walletTransfers.direction, opts.direction) : undefined,
		opts.includeDropped ? undefined : ne(walletTransfers.status, "dropped"),
	);
	const [rows, [totalRow]] = await Promise.all([
		tx
			.select({
				id: walletTransfers.id,
				accountId: walletTransfers.accountId,
				direction: walletTransfers.direction,
				asset: walletTransfers.asset,
				amount: walletTransfers.amount,
				txid: walletTransfers.txid,
				outputRef: walletTransfers.outputRef,
				address: walletTransfers.address,
				counterparty: walletTransfers.counterparty,
				blockHeight: walletTransfers.blockHeight,
				blockTime: walletTransfers.blockTime,
				confirmations: walletTransfers.confirmations,
				status: walletTransfers.status,
				screening: walletTransfers.screening,
				frozen: walletTransfers.frozen,
				firstSeenAt: walletTransfers.firstSeenAt,
				accountName: walletAccounts.name,
				network: walletAccounts.network,
			})
			.from(walletTransfers)
			.innerJoin(
				walletAccounts,
				eq(walletAccounts.id, walletTransfers.accountId),
			)
			.where(where)
			.orderBy(
				desc(
					sql`coalesce(${walletTransfers.blockTime}, ${walletTransfers.firstSeenAt})`,
				),
				desc(walletTransfers.firstSeenAt),
			)
			.limit(opts.limit ?? 50)
			.offset(opts.offset ?? 0),
		tx.select({ n: count() }).from(walletTransfers).where(where),
	]);
	return { rows, total: Number(totalRow?.n ?? 0) };
}

// Eingefrorene Eingänge je Konto und Asset (zählen nicht als verfügbar)
export async function frozenByAccount(
	tx: OrgTx,
	orgId: string,
): Promise<Map<string, Partial<Record<AssetCode, bigint>>>> {
	const rows = await tx
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
				eq(walletTransfers.direction, "in"),
				ne(walletTransfers.status, "dropped"),
			),
		);
	const out = new Map<string, Partial<Record<AssetCode, bigint>>>();
	for (const r of rows) {
		const m = out.get(r.accountId) ?? {};
		m[r.asset] = (m[r.asset] ?? 0n) + BigInt(r.amount);
		out.set(r.accountId, m);
	}
	return out;
}

// Einträge des Verwahrungs-Registers (MiCAR Art. 75) zum Verknüpfen
export async function custodyWalletOptions(tx: OrgTx, orgId: string) {
	const rows = await tx
		.select({ id: wallets.id, code: wallets.code, name: wallets.name })
		.from(wallets)
		.where(and(eq(wallets.organizationId, orgId), eq(wallets.status, "active")))
		.orderBy(asc(wallets.code));
	return rows.map((r) => ({ id: r.id, name: `${r.code} · ${r.name}` }));
}
