import { and, count, desc, eq, inArray, isNull } from "drizzle-orm";
import {
	accessTokens,
	type CryptoAlert,
	type CryptoBalance,
	type CryptoMovement,
	type CryptoPayout,
	cryptoAccounts,
	cryptoAlerts,
	cryptoBalances,
	cryptoMovements,
	cryptoPayouts,
	type WalletLink,
	walletLinks,
	wallets,
} from "@/db/schema";
import type { OrgTx } from "@/lib/db/with-org";
import { NETWORKS, type WalletNetwork } from "@/lib/wallet/core/networks";
import type { AccountBalances } from "@/lib/wallet/model";
import type { HoldingAccount } from "@/lib/wallet/reconcile-source";

// Lesen für /krypto und Einstellungen → Integrationen (immer im Org-Kontext)

export async function hasWalletLink(
	tx: OrgTx,
	orgId: string,
): Promise<boolean> {
	const [r] = await tx
		.select({ n: count() })
		.from(walletLinks)
		.where(
			and(
				eq(walletLinks.organizationId, orgId),
				eq(walletLinks.status, "active"),
			),
		);
	return Number(r?.n ?? 0) > 0;
}

export type WalletLinkRow = WalletLink & {
	tokenPrefix: string | null;
	tokenExpiresAt: Date | null;
	tokenLastUsedAt: Date | null;
};

export async function listWalletLinks(
	tx: OrgTx,
	orgId: string,
): Promise<WalletLinkRow[]> {
	const rows = await tx
		.select()
		.from(walletLinks)
		.where(eq(walletLinks.organizationId, orgId))
		.orderBy(walletLinks.status, desc(walletLinks.createdAt));
	const tokenIds = rows.map((r) => r.tokenId).filter((x): x is string => !!x);
	const toks =
		tokenIds.length > 0
			? await tx
					.select({
						id: accessTokens.id,
						prefix: accessTokens.prefix,
						expiresAt: accessTokens.expiresAt,
						lastUsedAt: accessTokens.lastUsedAt,
					})
					.from(accessTokens)
					.where(inArray(accessTokens.id, tokenIds))
			: [];
	const byId = new Map(toks.map((t) => [t.id, t]));
	return rows.map((r) => {
		const t = r.tokenId ? byId.get(r.tokenId) : undefined;
		return {
			...r,
			tokenPrefix: t?.prefix ?? null,
			tokenExpiresAt: t?.expiresAt ?? null,
			tokenLastUsedAt: t?.lastUsedAt ?? null,
		};
	});
}

// Kontoname je both.money-Konto (für Bewegungen und Auszahlungen)
async function accountNames(
	tx: OrgTx,
	orgId: string,
): Promise<Map<string, { name: string; walletId: string | null }>> {
	const rows = await tx
		.select({
			walletAccountId: cryptoAccounts.walletAccountId,
			name: cryptoAccounts.name,
			walletId: cryptoAccounts.walletId,
		})
		.from(cryptoAccounts)
		.where(eq(cryptoAccounts.organizationId, orgId));
	return new Map(
		rows.map((r) => [
			r.walletAccountId,
			{ name: r.name, walletId: r.walletId },
		]),
	);
}

export const MOVEMENTS_PAGE = 100;

export async function listCryptoMovements(
	tx: OrgTx,
	orgId: string,
	opts: { direction?: "in" | "out"; page?: number; limit?: number } = {},
): Promise<{
	rows: (CryptoMovement & { accountName: string })[];
	total: number;
}> {
	const where = and(
		eq(cryptoMovements.organizationId, orgId),
		opts.direction ? eq(cryptoMovements.direction, opts.direction) : undefined,
	);
	const limit = opts.limit ?? MOVEMENTS_PAGE;
	const [rows, [total], names] = await Promise.all([
		tx
			.select()
			.from(cryptoMovements)
			.where(where)
			.orderBy(desc(cryptoMovements.firstSeenAt))
			.limit(limit)
			.offset(((opts.page ?? 1) - 1) * limit),
		tx.select({ n: count() }).from(cryptoMovements).where(where),
		accountNames(tx, orgId),
	]);
	return {
		rows: rows.map((r) => ({
			...r,
			accountName: names.get(r.walletAccountId)?.name ?? "—",
		})),
		total: Number(total?.n ?? 0),
	};
}

export type CryptoAccountRow = {
	id: string;
	walletAccountId: string;
	name: string;
	network: string;
	kind: string;
	purpose: string;
	status: string;
	firstAddress: string | null;
	walletId: string | null;
	walletCode: string | null;
	balance: CryptoBalance["accounts"][number] | null;
	balanceDay: string | null;
};

export async function listCryptoAccounts(
	tx: OrgTx,
	orgId: string,
): Promise<CryptoAccountRow[]> {
	const [rows, codes, latest] = await Promise.all([
		tx
			.select()
			.from(cryptoAccounts)
			.where(eq(cryptoAccounts.organizationId, orgId))
			.orderBy(cryptoAccounts.status, cryptoAccounts.name),
		tx
			.select({ id: wallets.id, code: wallets.code })
			.from(wallets)
			.where(eq(wallets.organizationId, orgId)),
		latestBalances(tx, orgId),
	]);
	const codeOf = new Map(codes.map((c) => [c.id, c.code]));
	return rows.map((a) => {
		const day = latest.get(a.linkId) ?? null;
		return {
			id: a.id,
			walletAccountId: a.walletAccountId,
			name: a.name,
			network: a.network,
			kind: a.kind,
			purpose: a.purpose,
			status: a.status,
			firstAddress: a.firstAddress,
			walletId: a.walletId,
			walletCode: a.walletId ? (codeOf.get(a.walletId) ?? null) : null,
			balance:
				day?.accounts.find((x) => x.accountId === a.walletAccountId) ?? null,
			balanceDay: day?.day ?? null,
		};
	});
}

// Letzter Tagesabschluss je Verbindung
export async function latestBalances(
	tx: OrgTx,
	orgId: string,
): Promise<Map<string, CryptoBalance>> {
	const rows = await tx
		.selectDistinctOn([cryptoBalances.linkId])
		.from(cryptoBalances)
		.where(eq(cryptoBalances.organizationId, orgId))
		.orderBy(cryptoBalances.linkId, desc(cryptoBalances.day));
	return new Map(rows.map((r) => [r.linkId, r]));
}

// Tagesabschluss zu einem Stichtag (für die Abstimmung unter /verwahrung)
export async function balancesForDay(
	tx: OrgTx,
	orgId: string,
	day: string,
): Promise<{
	balances: CryptoBalance[];
	accounts: {
		linkId: string;
		walletAccountId: string;
		walletId: string | null;
		purpose: string;
		network: string;
	}[];
}> {
	const [balances, accounts] = await Promise.all([
		tx
			.select()
			.from(cryptoBalances)
			.where(
				and(
					eq(cryptoBalances.organizationId, orgId),
					eq(cryptoBalances.day, day),
				),
			),
		tx
			.select({
				linkId: cryptoAccounts.linkId,
				walletAccountId: cryptoAccounts.walletAccountId,
				walletId: cryptoAccounts.walletId,
				purpose: cryptoAccounts.purpose,
				network: cryptoAccounts.network,
			})
			.from(cryptoAccounts)
			.where(eq(cryptoAccounts.organizationId, orgId)),
	]);
	return { balances, accounts };
}

export async function listCryptoPayouts(
	tx: OrgTx,
	orgId: string,
	limit = 100,
): Promise<(CryptoPayout & { accountName: string })[]> {
	const [rows, names] = await Promise.all([
		tx
			.select()
			.from(cryptoPayouts)
			.where(eq(cryptoPayouts.organizationId, orgId))
			.orderBy(desc(cryptoPayouts.requestedAt))
			.limit(limit),
		accountNames(tx, orgId),
	]);
	return rows.map((r) => ({
		...r,
		accountName: names.get(r.walletAccountId)?.name ?? "—",
	}));
}

export async function listCryptoAlerts(
	tx: OrgTx,
	orgId: string,
	limit = 100,
): Promise<CryptoAlert[]> {
	return tx
		.select()
		.from(cryptoAlerts)
		.where(eq(cryptoAlerts.organizationId, orgId))
		.orderBy(desc(cryptoAlerts.raisedAt))
		.limit(limit);
}

export async function openAlertCount(
	tx: OrgTx,
	orgId: string,
): Promise<number> {
	const [r] = await tx
		.select({ n: count() })
		.from(cryptoAlerts)
		.where(
			and(
				eq(cryptoAlerts.organizationId, orgId),
				isNull(cryptoAlerts.resolvedAt),
			),
		);
	return Number(r?.n ?? 0);
}

// Konten aus both.money für die Abstimmung unter /verwahrung (gleiche
// Rechnung wie die Legacy-Konten, nodeHoldings): Bestand = letzter
// Tagesabschluss der Verbindung mit Blockhöhe und Hash
export async function cryptoHoldingAccounts(
	tx: OrgTx,
	orgId: string,
): Promise<HoldingAccount[]> {
	const [accounts, latest] = await Promise.all([
		tx
			.select()
			.from(cryptoAccounts)
			.where(eq(cryptoAccounts.organizationId, orgId)),
		latestBalances(tx, orgId),
	]);
	return accounts.flatMap((a) => {
		const b = latest
			.get(a.linkId)
			?.accounts.find((x) => x.accountId === a.walletAccountId);
		if (!b || !(a.network in NETWORKS)) return [];
		return [
			{
				network: a.network as WalletNetwork,
				purpose: a.purpose === "client" ? "client" : "own",
				status: a.status,
				balances: b.balances as AccountBalances,
				balanceHeight: b.height,
				balanceHash: b.hash,
				balanceAt: b.at ? new Date(b.at) : null,
			},
		];
	});
}
