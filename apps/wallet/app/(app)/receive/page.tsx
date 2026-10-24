import { ReceivePanel } from "@wallet/components/wallet/receive-panel";
import { requireUnlockedPage } from "@wallet/lib/auth/gates";
import { toOrgCtx } from "@wallet/lib/auth/guards";
import { readOrg } from "@wallet/lib/db/with-org";
import {
	issuedAddresses,
	listWalletAccounts,
} from "@wallet/lib/wallet/queries";
import { ExternalLink } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { EmptyState } from "@/components/entity/empty-state";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { NETWORKS } from "@/lib/wallet/core/networks";
import { FAUCETS } from "@/lib/wallet/display";

export const metadata: Metadata = { title: "Empfangen" };

const fmtTime = new Intl.DateTimeFormat("de-DE", {
	dateStyle: "medium",
	timeStyle: "short",
	timeZone: "Europe/Berlin",
});

// /receive — Konto wählen (?account=), Adresse + QR, ausgegebene
// Adressen mit Zahlungsstand. Eine neue Adresse entsteht nur per Knopf
// (nie beim bloßen Aufruf der Seite).
export default async function WalletReceivePage({
	searchParams,
}: {
	searchParams: Promise<{ account?: string }>;
}) {
	const sp = await searchParams;
	const ctx = await requireUnlockedPage(
		sp.account
			? `/receive?account=${encodeURIComponent(sp.account)}`
			: "/receive",
	);
	const t = await getTranslations("Wallet");
	const data = await readOrg(toOrgCtx(ctx), async (tx) => {
		const accounts = await listWalletAccounts(tx, ctx.orgId);
		const account = accounts.find((a) => a.id === sp.account) ?? accounts[0];
		return {
			accounts,
			account,
			addresses: account
				? await issuedAddresses(tx, ctx.orgId, account.id)
				: [],
		};
	});
	const { account } = data;
	if (!account)
		return (
			<>
				<PageHeader title={t("receiveTitle")} lead={t("receiveLead")} />
				<EmptyState title={t("homeEmptyTitle")} lead={t("accountsEmpty")} />
			</>
		);
	const net = NETWORKS[account.network];
	// Bitcoin: jüngste noch unbenutzte Adresse; Ethereum: die eine Adresse
	const current =
		net.chain === "ethereum"
			? data.addresses.find((a) => a.index === 0)
			: (data.addresses.find((a) => !a.firstSeenAt) ?? data.addresses[0]);
	const faucets = FAUCETS[account.network] ?? [];

	return (
		<>
			<PageHeader title={t("receiveTitle")} lead={t("receiveLead")} />
			{data.accounts.length > 1 && (
				<nav
					aria-label={t("receiveAccount")}
					className="mb-6 flex flex-wrap gap-2"
				>
					{data.accounts.map((a) => (
						<Link
							key={a.id}
							href={`/receive?account=${a.id}`}
							aria-current={a.id === account.id ? "page" : undefined}
							className={cn(
								"rounded-md border px-3 py-1.5 text-sm transition-[background-color,border-color] focus-visible:outline-2 focus-visible:outline-primary",
								a.id === account.id
									? "border-foreground/40 bg-muted font-medium"
									: "border-border/60 hover:bg-muted/60",
							)}
						>
							{a.name}
							<span className="ml-1.5 text-muted-foreground text-xs">
								{NETWORKS[a.network].label}
							</span>
						</Link>
					))}
				</nav>
			)}

			<section className="rounded-xl border border-border/60 bg-card p-5 sm:p-6">
				{current ? (
					<ReceivePanel
						key={current.address}
						accountId={account.id}
						network={account.network}
						address={current.address}
						kind={account.kind}
						reused={!!current.firstSeenAt && net.chain === "bitcoin"}
					/>
				) : (
					<p className="text-muted-foreground text-sm">{t("syncNever")}</p>
				)}
				{net.chain === "ethereum" && (
					<p className="mt-4 text-muted-foreground text-xs">
						{t("receiveTokens", { network: net.label })}
					</p>
				)}
			</section>

			{!net.live && (
				<div className="mt-4 rounded-md border border-border/60 bg-muted/30 p-4 text-sm">
					<p>{t("receiveTestnet")}</p>
					<ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
						{faucets.map((f) => (
							<li key={f.href}>
								<a
									href={f.href}
									target="_blank"
									rel="noopener noreferrer"
									className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline"
								>
									{t(f.key)}
									<ExternalLink className="size-3" aria-hidden />
								</a>
							</li>
						))}
					</ul>
				</div>
			)}

			{net.chain === "bitcoin" && data.addresses.length > 0 && (
				<section className="mt-10" aria-labelledby="rc-recent">
					<h2
						id="rc-recent"
						className="mb-3 font-serif-display text-xl text-primary"
					>
						{t("receiveRecent")}
					</h2>
					<ul className="divide-y divide-border/60 text-sm">
						{data.addresses.slice(0, 10).map((a) => (
							<li
								key={a.id}
								className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2"
							>
								<span
									className="min-w-0 grow truncate font-mono text-xs"
									title={a.address}
									translate="no"
								>
									{a.address}
								</span>
								{a.label && (
									<span className="text-muted-foreground text-xs">
										{a.label}
									</span>
								)}
								<Badge variant={a.firstSeenAt ? "success" : "muted"}>
									{a.firstSeenAt ? t("receivePaid") : t("receiveWaiting")}
								</Badge>
								{a.issuedAt && (
									<span className="text-muted-foreground text-xs">
										{fmtTime.format(a.issuedAt)}
									</span>
								)}
							</li>
						))}
					</ul>
				</section>
			)}
		</>
	);
}
