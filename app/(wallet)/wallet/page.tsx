import {
	ArrowDownToLine,
	ArrowLeftRight,
	Compass,
	Plus,
	Send,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { EmptyState } from "@/components/entity/empty-state";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { AccountCard, accountAssets } from "@/components/wallet/account-card";
import { QuoteRow } from "@/components/wallet/quote-row";
import { TransferList } from "@/components/wallet/transfer-list";
import { requireWalletPage } from "@/lib/auth/gates";
import { toOrgCtx } from "@/lib/auth/guards";
import { allows } from "@/lib/auth/permissions";
import { readOrg } from "@/lib/db/with-org";
import { ASSETS, type AssetCode } from "@/lib/wallet/core/assets";
import { NETWORKS, type WalletNetwork } from "@/lib/wallet/core/networks";
import { amountText } from "@/lib/wallet/display";
import { introHref, resumeStep, shouldShowIntro } from "@/lib/wallet/intro";
import { euroPrices, euroValue, watchlistQuotes } from "@/lib/wallet/market";
import { PAIR_NAMES } from "@/lib/wallet/pair-names";
import { getWalletPreferences } from "@/lib/wallet/preferences";
import { formatScaled } from "@/lib/wallet/prices";
import {
	frozenByAccount,
	listTransfers,
	listWalletAccounts,
} from "@/lib/wallet/queries";

export const metadata: Metadata = { title: "Wallet" };

// /wallet — Startseite: Gesamtwert in Euro, Bestand je Netz und Asset, drei
// Handlungen, Kurse der Watchlist, Konten, letzte Bewegungen.
export default async function WalletHomePage() {
	const ctx = await requireWalletPage("/wallet");
	const t = await getTranslations("Wallet");
	const canManage = allows(ctx, { wallet: ["manage"] });
	const { accounts, frozen, recent, prefs } = await readOrg(
		toOrgCtx(ctx),
		async (tx) => ({
			accounts: await listWalletAccounts(tx, ctx.orgId),
			frozen: await frozenByAccount(tx, ctx.orgId),
			recent: await listTransfers(tx, ctx.orgId, { limit: 6 }),
			prefs: await getWalletPreferences(tx, ctx.orgId, ctx.userId),
		}),
	);
	// Beim ersten Öffnen führt die Einführung (bis abgeschlossen oder „Später“)
	if (shouldShowIntro(prefs)) redirect(introHref(resumeStep(prefs.introStep)));
	const [euro, quotes] = await Promise.all([
		euroPrices(),
		watchlistQuotes(prefs.pairs.slice(0, 3)),
	]);

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
	// Gesamtwert in Euro über alle Netze; ohne Kurs (oder ohne Bestand mit
	// Kurs) kein Wert statt einer falschen Null
	const values = totals.map((x) =>
		euroValue(x.network, x.code, x.sum, euro.prices),
	);
	const euroTotal = values.some((v) => v !== null)
		? values.reduce<bigint>((s, v) => s + (v ?? 0n), 0n)
		: null;
	const anyTestnet = totals.some((x) => !NETWORKS[x.network].live);
	const holdsEurc = totals.some((x) => x.code === "EURC" && x.sum !== 0n);

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
			<PageHeader
				title={t("homeTitle")}
				lead={t("homeLead")}
				actions={
					<Button asChild variant="ghost" size="sm">
						<Link href={introHref("willkommen")}>
							<Compass aria-hidden />
							{t("homeIntro")}
						</Link>
					</Button>
				}
			/>
			<section
				aria-labelledby="wallet-total"
				className="rounded-xl border border-border/60 bg-card p-5 sm:p-6"
			>
				<h2
					id="wallet-total"
					className="lv-eyebrow text-[0.6rem] text-muted-foreground"
				>
					{t("homeValueLabel")}
				</h2>
				<p
					className="mt-2 font-semibold text-4xl lining-nums sm:text-5xl"
					translate="no"
				>
					{euroTotal !== null ? `${formatScaled(euroTotal)} €` : "—"}
				</p>
				<p className="mt-1 text-muted-foreground text-xs">
					{euroTotal === null
						? t("homeValueNone")
						: [
								anyTestnet && t("homeValueTestnet"),
								holdsEurc && t("homeValueAssumption"),
							]
								.filter(Boolean)
								.join(" ")}
				</p>
				<h3 className="sr-only">{t("homeTotalLabel")}</h3>
				<ul className="mt-5 grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
					{totals.map((x) => (
						<li key={`${x.network}:${x.code}`} className="min-w-0">
							<p className="font-semibold text-lg lining-nums" translate="no">
								{amountText(x.network, x.code, x.sum)}
							</p>
							<p className="text-muted-foreground text-xs">
								{NETWORKS[x.network].label} · {t("available")}
							</p>
						</li>
					))}
				</ul>
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

			<section aria-labelledby="wallet-quotes" className="mt-10">
				<div className="mb-2 flex items-center justify-between gap-2">
					<h2
						id="wallet-quotes"
						className="font-serif-display text-xl text-primary"
					>
						{t("homeQuotesTitle")}
					</h2>
					<Link
						href="/wallet/kurse"
						className="text-primary text-sm underline-offset-4 hover:underline"
					>
						{t("homeAllQuotes")}
					</Link>
				</div>
				{quotes.some((q) => q.price !== null) ? (
					<ul className="divide-y divide-border/60 rounded-xl border border-border/60 bg-card px-2">
						{quotes.map((q) => (
							<li key={q.pair}>
								<QuoteRow quote={q} name={PAIR_NAMES[q.pair]} />
							</li>
						))}
					</ul>
				) : (
					<p className="text-muted-foreground text-sm">{t("quotesEmpty")}</p>
				)}
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
