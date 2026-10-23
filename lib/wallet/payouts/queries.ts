import { and, desc, eq, inArray } from "drizzle-orm";
import { walletAccounts, walletAddressBook, walletPayouts } from "@/db/schema";
import type { OrgTx } from "@/lib/db/with-org";
import { effectiveStatus } from "@/lib/wallet/address-book";
import { ASSETS, type AssetCode } from "@/lib/wallet/core/assets";
import { OPEN_PAYOUT_STATUS } from "./plan";

// Lesen für Senden und Auszahlungen (Org-Kontext)

export async function listPayouts(tx: OrgTx, orgId: string, limit = 200) {
	return tx
		.select({ payout: walletPayouts, account: walletAccounts })
		.from(walletPayouts)
		.innerJoin(walletAccounts, eq(walletAccounts.id, walletPayouts.accountId))
		.where(eq(walletPayouts.organizationId, orgId))
		.orderBy(desc(walletPayouts.createdAt))
		.limit(limit);
}

export async function payoutDetail(tx: OrgTx, orgId: string, id: string) {
	const [row] = await tx
		.select({ payout: walletPayouts, account: walletAccounts })
		.from(walletPayouts)
		.innerJoin(walletAccounts, eq(walletAccounts.id, walletPayouts.accountId))
		.where(
			and(eq(walletPayouts.id, id), eq(walletPayouts.organizationId, orgId)),
		)
		.limit(1);
	return row ?? null;
}

export type SendAccount = {
	id: string;
	name: string;
	network: (typeof walletAccounts.$inferSelect)["network"];
	// verfügbar = bestätigt laut Knoten minus offene Auszahlungen (Basiseinheiten)
	available: Partial<Record<AssetCode, string>>;
};

export async function sendOptions(tx: OrgTx, orgId: string, now = new Date()) {
	const accounts = await tx
		.select()
		.from(walletAccounts)
		.where(
			and(
				eq(walletAccounts.organizationId, orgId),
				eq(walletAccounts.kind, "hot"),
				eq(walletAccounts.status, "active"),
			),
		)
		.orderBy(walletAccounts.name);
	const open =
		accounts.length > 0
			? await tx
					.select({
						accountId: walletPayouts.accountId,
						asset: walletPayouts.asset,
						amount: walletPayouts.amount,
					})
					.from(walletPayouts)
					.where(
						and(
							inArray(
								walletPayouts.accountId,
								accounts.map((a) => a.id),
							),
							inArray(walletPayouts.status, [...OPEN_PAYOUT_STATUS]),
						),
					)
			: [];
	const out: SendAccount[] = accounts.map((a) => ({
		id: a.id,
		name: a.name,
		network: a.network,
		available: Object.fromEntries(
			ASSETS[a.network].map((asset) => {
				const confirmed = BigInt(a.balances?.[asset.code]?.confirmed ?? "0");
				const reserved = open
					.filter((o) => o.accountId === a.id && o.asset === asset.code)
					.reduce((s, o) => s + BigInt(o.amount), 0n);
				const free = confirmed - reserved;
				return [asset.code, (free > 0n ? free : 0n).toString()];
			}),
		),
	}));
	const destinations = (
		await tx
			.select()
			.from(walletAddressBook)
			.where(eq(walletAddressBook.organizationId, orgId))
			.orderBy(walletAddressBook.label)
	)
		.filter((d) => effectiveStatus(d, now) === "active")
		.map((d) => ({
			id: d.id,
			network: d.network,
			label: d.label,
			address: d.address,
		}));
	return { accounts: out, destinations };
}
