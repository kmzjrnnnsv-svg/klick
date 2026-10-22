import { ArrowDownToLine, ArrowLeftRight, Plus, Send } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { EmptyState } from "@/components/entity/empty-state";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { AccountCard, accountAssets } from "@/components/wallet/account-card";
import { TransferList } from "@/components/wallet/transfer-list";
import { requireWalletPage } from "@/lib/auth/gates";
import { toOrgCtx } from "@/lib/auth/guards";
import { allows } from "@/lib/auth/permissions";
import { readOrg } from "@/lib/db/with-org";
import { ASSETS, type AssetCode } from "@/lib/wallet/core/assets";
import { NETWORKS, type WalletNetwork } from "@/lib/wallet/core/networks";
import { amountText } from "@/lib/wallet/display";
import {
	frozenByAccount,
	listTransfers,
	listWalletAccounts,
} from "@/lib/wallet/queries";

export const metadata: Metadata = { title: "Wallet" };

// /wallet — Startseite: Bestand je Netz und Asset, drei Handlungen, Konten,
// letzte Bewegungen. Euro-Werte folgen mit den Kursen (eigener Knoten).
export default async function WalletHomePage() {
	const ctx = await requireWalletPage("/wallet");
	const t = await getTranslations("Wallet");
	const canManage = allows(ctx, { wallet: ["manage"] });
	const { accounts, frozen, recent } = await readOrg(
		toOrgCtx(ctx),
		async (tx) => ({
			accounts: await listWalletAccounts(tx, ctx.orgId),
			frozen: await frozenByAccount(tx, ctx.orgId),
			recent: await listTransfers(tx, ctx.orgId, { limit: 6 }),
		}),
	);

	// Summen je Netz und Asset — Testnetz und echtes Netz nie zusammen; je
	// Netz die Assets mit Bestand, sonst das Netz-eigene mit 0
	const byNetwork = new Map<WalletNetwork, Map<AssetCode, bigint>>();
	for (const a of accounts) {
		const m = byNetwork.get(a.network) ?? new Map<AssetCode, bigint>();
		for (const x of accountAssets(a, frozen.get(a.id)))
			m.set(x.code, (m.get(x.code) ?? 0n) + x.available);
		byNetwork.set(a.network, m);
	}
	const totals = [...byNetwork].flatMap(([network, m]) => {
		const held = [...m].filter(([, v]) => v !== 0n);
		const list: [AssetCode, bigint][] = held.length
			? held
			: [[ASSETS[network][0]?.code ?? "BTC", 0n]];
		return list.map(([code, sum]) => ({ network, code, sum }));
	});

	if (accounts.length === 0)
		return (
			<>
				<PageHeader title={t("homeTitle")} lead={t("homeLead")} />
				<EmptyState
					title={t("homeEmptyTitle")}
					lead={canManage ? t("accountsEmpty") : t("homeEmptyBody")}
					actions={
						canManage && (
							<Button asChild variant="brown" size="sm">
								<Link href="/wallet/konten?neu=1">
									<Plus aria-hidden />
									{t("homeAddAccount")}
								</Link>
							</Button>
						)
					}
				/>
			</>
		);

	return (
		<>
			<PageHeader title={t("homeTitle")} lead={t("homeLead")} />
			<section
				aria-labelledby="wallet-total"
				className="rounded-xl border border-border/60 bg-card p-5 sm:p-6"
			>
				<h2
					id="wallet-total"
					className="lv-eyebrow text-[0.6rem] text-muted-foreground"
				>
					{t("homeTotalLabel")}
				</h2>
				<ul className="mt-3 grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
					{totals.map((x) => (
						<li key={`${x.network}:${x.code}`} className="min-w-0">
							<p
								className="font-serif-display text-3xl text-primary lining-nums tabular-nums sm:text-4xl"
								translate="no"
							>
								{amountText(x.network, x.code, x.sum)}
							</p>
							<p className="text-muted-foreground text-xs">
								{NETWORKS[x.network].label} · {t("available")}
							</p>
						</li>
					))}
				</ul>
				<p className="mt-4 text-muted-foreground text-xs">
					{t("homeTotalHint")}
				</p>
				<ul className="mt-6 flex gap-6 sm:gap-8">
					<li>
						<Link
							href="/wallet/empfangen"
							className="group flex flex-col items-center gap-1.5 text-xs focus-visible:outline-none"
						>
							<span className="flex size-12 items-center justify-center rounded-full bg-brown text-brown-foreground transition-opacity group-hover:opacity-90 group-focus-visible:ring-2 group-focus-visible:ring-ring group-focus-visible:ring-offset-2">
								<ArrowDownToLine className="size-5" aria-hidden />
							</span>
							{t("actionReceive")}
						</Link>
					</li>
					{[
						{ Icon: Send, label: t("actionSend") },
						{ Icon: ArrowLeftRight, label: t("actionMove") },
					].map(({ Icon, label }) => (
						<li
							key={label}
							className="flex flex-col items-center gap-1.5 text-muted-foreground text-xs"
							title={t("actionSoon")}
						>
							<span
								className="flex size-12 items-center justify-center rounded-full border border-border bg-muted/40"
								aria-hidden
							>
								<Icon className="size-5" />
							</span>
							<span>
								{label}
								<span className="sr-only"> – {t("actionSoon")}</span>
							</span>
						</li>
					))}
				</ul>
			</section>

			<section aria-labelledby="wallet-accounts" className="mt-10">
				<div className="mb-3 flex items-center justify-between gap-2">
					<h2
						id="wallet-accounts"
						className="font-serif-display text-xl text-primary"
					>
						{t("homeAccountsTitle")}
					</h2>
					{canManage && (
						<Button asChild variant="ghost" size="sm">
							<Link href="/wallet/konten?neu=1">
								<Plus aria-hidden />
								{t("homeAddAccount")}
							</Link>
						</Button>
					)}
				</div>
				<div className="grid grid-cols-1 gap-3 md:grid-cols-2">
					{accounts.map((a) => (
						<AccountCard key={a.id} account={a} frozen={frozen.get(a.id)} />
					))}
				</div>
			</section>

			<section aria-labelledby="wallet-recent" className="mt-10">
				<div className="mb-1 flex items-center justify-between gap-2">
					<h2
						id="wallet-recent"
						className="font-serif-display text-xl text-primary"
					>
						{t("homeRecentTitle")}
					</h2>
					<Link
						href="/wallet/bewegungen"
						className="text-primary text-sm underline-offset-4 hover:underline"
					>
						{t("homeAllMovements")}
					</Link>
				</div>
				<TransferList rows={recent.rows} />
			</section>
		</>
	);
}
