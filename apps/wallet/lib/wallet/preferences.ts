import { walletPreferences } from "@wallet/db/schema";
import type { OrgTx } from "@wallet/lib/db/with-org";
import { cleanWatchlist } from "@wallet/lib/wallet/market";
import { and, eq } from "drizzle-orm";
import type { Pair } from "@/lib/wallet/core/feeds";

// Persönliche Einstellungen im Wallet-Bereich (je Person und Org, RLS)

export async function getWalletPreferences(
	tx: OrgTx,
	orgId: string,
	userId: string,
) {
	const [row] = await tx
		.select()
		.from(walletPreferences)
		.where(
			and(
				eq(walletPreferences.organizationId, orgId),
				eq(walletPreferences.userId, userId),
			),
		)
		.limit(1);
	return {
		pairs: cleanWatchlist(row?.pairs) as Pair[],
		introStep: row?.introStep ?? null,
		introCompletedAt: row?.introCompletedAt ?? null,
		introDeferredAt: row?.introDeferredAt ?? null,
	};
}

export async function upsertWalletPreferences(
	tx: OrgTx,
	orgId: string,
	userId: string,
	patch: Partial<{
		pairs: string[];
		introStep: string | null;
		introCompletedAt: Date | null;
		introDeferredAt: Date | null;
	}>,
) {
	await tx
		.insert(walletPreferences)
		.values({ organizationId: orgId, userId, ...patch })
		.onConflictDoUpdate({
			target: [walletPreferences.organizationId, walletPreferences.userId],
			set: patch,
		});
}
