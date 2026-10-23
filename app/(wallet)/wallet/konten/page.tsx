import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { EmptyState } from "@/components/entity/empty-state";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { AccountCard } from "@/components/wallet/account-card";
import { NewAccountDialog } from "@/components/wallet/account-form";
import { NewHotAccountDialog } from "@/components/wallet/hot-account-form";
import { requireWalletPage } from "@/lib/auth/gates";
import { toOrgCtx } from "@/lib/auth/guards";
import { allows } from "@/lib/auth/permissions";
import { readOrg } from "@/lib/db/with-org";
import { NETWORKS } from "@/lib/wallet/core/networks";
import { configuredNetworks } from "@/lib/wallet/node-clients";
import {
	custodyWalletOptions,
	frozenByAccount,
	listWalletAccounts,
} from "@/lib/wallet/queries";
import { signerState } from "@/lib/wallet/signer/status";

export const metadata: Metadata = { title: "Konten" };

// /wallet/konten — Konten je Netz; anlegen nur Inhaber:innen (wallet:manage)
export default async function WalletAccountsPage({
	searchParams,
}: {
	searchParams: Promise<{ neu?: string }>;
}) {
	const ctx = await requireWalletPage("/wallet/konten");
	const t = await getTranslations("Wallet");
	const sp = await searchParams;
	const canManage = allows(ctx, { wallet: ["manage"] });
	const { accounts, frozen, custody } = await readOrg(
		toOrgCtx(ctx),
		async (tx) => ({
			accounts: await listWalletAccounts(tx, ctx.orgId, {
				includeRetired: true,
			}),
			frozen: await frozenByAccount(tx, ctx.orgId),
			custody: await custodyWalletOptions(tx, ctx.orgId),
		}),
	);
	const active = accounts.filter((a) => a.status === "active");
	const retired = accounts.filter((a) => a.status === "retired");
	const networks = configuredNetworks()
		.filter((n) => !NETWORKS[n].live)
		.map((n) => ({ key: n, label: NETWORKS[n].label }));
	// Hot-Konten nur, wenn der Signer dieser Org gehört und bereit ist
	const signer = canManage ? await signerState(ctx.orgId) : null;
	const hotNetworks =
		signer?.state === "ready"
			? networks.filter((n) => signer.hello?.networks.includes(n.key))
			: [];
	const create = canManage && (
		<div className="flex flex-wrap gap-2">
			{hotNetworks.length > 0 && <NewHotAccountDialog networks={hotNetworks} />}
			<NewAccountDialog
				networks={networks}
				custodyWallets={custody}
				defaultOpen={sp.neu === "1"}
			/>
		</div>
	);
	return (
		<>
			<PageHeader
				title={t("accountsTitle")}
				lead={t("accountsLead")}
				actions={create}
			/>
			{active.length === 0 ? (
				<EmptyState title={t("homeEmptyTitle")} lead={t("accountsEmpty")} />
			) : (
				<div className="grid grid-cols-1 gap-3 md:grid-cols-2">
					{active.map((a) => (
						<AccountCard key={a.id} account={a} frozen={frozen.get(a.id)} />
					))}
				</div>
			)}
			{retired.length > 0 && (
				<section className="mt-10">
					<h2 className="mb-3 font-serif-display text-lg text-primary">
						{t("retired")}
					</h2>
					<ul className="flex flex-col gap-2 text-sm">
						{retired.map((a) => (
							<li key={a.id} className="flex items-center gap-2">
								<span className="truncate">{a.name}</span>
								<Badge variant="muted">{NETWORKS[a.network].label}</Badge>
							</li>
						))}
					</ul>
				</section>
			)}
		</>
	);
}
