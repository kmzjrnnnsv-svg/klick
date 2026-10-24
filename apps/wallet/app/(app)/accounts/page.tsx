import { AccountCard } from "@wallet/components/wallet/account-card";
import { NewAccountDialog } from "@wallet/components/wallet/account-form";
import { NewHotAccountDialog } from "@wallet/components/wallet/hot-account-form";
import { requireUnlockedPage } from "@wallet/lib/auth/gates";
import { toOrgCtx } from "@wallet/lib/auth/guards";
import { roleAllows } from "@wallet/lib/auth/permissions";
import { readOrg } from "@wallet/lib/db/with-org";
import { custodyFacts } from "@wallet/lib/orgs/custody";
import { hotAccountAllowed } from "@wallet/lib/wallet/custody-gate";
import { configuredNetworks } from "@wallet/lib/wallet/node-clients";
import {
	frozenByAccount,
	listWalletAccounts,
} from "@wallet/lib/wallet/queries";
import { signerState } from "@wallet/lib/wallet/signer/status";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { EmptyState } from "@/components/entity/empty-state";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { NETWORKS } from "@/lib/wallet/core/networks";

export const metadata: Metadata = { title: "Konten" };

// /accounts — Konten je Netz; anlegen nur Inhaber:innen (wallet:manage)
export default async function WalletAccountsPage({
	searchParams,
}: {
	searchParams: Promise<{ new?: string }>;
}) {
	const ctx = await requireUnlockedPage("/accounts");
	const t = await getTranslations("Wallet");
	const sp = await searchParams;
	const canManage = roleAllows(ctx.role, "wallet:manage");
	const { accounts, frozen, custody } = await readOrg(
		toOrgCtx(ctx),
		async (tx) => ({
			accounts: await listWalletAccounts(tx, ctx.orgId, {
				includeRetired: true,
			}),
			frozen: await frozenByAccount(tx, ctx.orgId),
			custody: await custodyFacts(tx, ctx.orgId),
		}),
	);
	const active = accounts.filter((a) => a.status === "active");
	const retired = accounts.filter((a) => a.status === "retired");
	const networks = configuredNetworks()
		.filter((n) => !NETWORKS[n].live)
		.map((n) => ({ key: n, label: NETWORKS[n].label }));
	// Hot-Konten nur, wenn die Org sie haben darf (Sperre für Kundengelder)
	// und der Signer dieser Org gehört und bereit ist
	const signer =
		canManage && hotAccountAllowed(custody)
			? await signerState(ctx.orgId)
			: null;
	const hotNetworks =
		signer?.state === "ready"
			? networks.filter((n) => signer.hello?.networks.includes(n.key))
			: [];
	const create = canManage && (
		<div className="flex flex-wrap gap-2">
			{hotNetworks.length > 0 && <NewHotAccountDialog networks={hotNetworks} />}
			<NewAccountDialog networks={networks} defaultOpen={sp.new === "1"} />
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
					<h2 className="mb-3 font-semibold text-headline">{t("retired")}</h2>
					<ul className="flex flex-col gap-2 text-subhead">
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
