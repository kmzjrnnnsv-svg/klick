import {
	AccountCard,
	accountAssets,
} from "@wallet/components/wallet/account-card";
import { QuoteRow } from "@wallet/components/wallet/quote-row";
import { TransferList } from "@wallet/components/wallet/transfer-list";
import { requireUnlockedPage } from "@wallet/lib/auth/gates";
import { toOrgCtx } from "@wallet/lib/auth/guards";
import { roleAllows } from "@wallet/lib/auth/permissions";
import { readOrg } from "@wallet/lib/db/with-org";
import {
	euroPrices,
	euroValue,
	watchlistQuotes,
} from "@wallet/lib/wallet/market";
import { getWalletPreferences } from "@wallet/lib/wallet/preferences";
import {
	frozenByAccount,
	listTransfers,
	listWalletAccounts,
} from "@wallet/lib/wallet/queries";
import {
	isOwnSigner,
	loadSignerAnchor,
} from "@wallet/lib/wallet/signer/context";
import { signerState } from "@wallet/lib/wallet/signer/status";
import { welcomeHref } from "@wallet/lib/welcome";
import {
	ArrowDownToLine,
	ArrowLeftRight,
	Compass,
	Plus,
	Send,
} from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { EmptyState } from "@/components/entity/empty-state";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { ASSETS, type AssetCode } from "@/lib/wallet/core/assets";
import { NETWORKS, type WalletNetwork } from "@/lib/wallet/core/networks";
import { amountText } from "@/lib/wallet/display";
import { resumeStep, shouldShowIntro } from "@/lib/wallet/intro";
import { PAIR_NAMES } from "@/lib/wallet/pair-names";
import { formatScaled } from "@/lib/wallet/prices";

// Übersicht für angemeldete Personen unter „/“ (app/(home)/page.tsx):
// Gesamtwert in Euro, Bestand je Netz und Asset, drei Handlungen, Kurse der
// Watchlist, Konten, letzte Bewegungen.
export async function WalletHome() {
	const ctx = await requireUnlockedPage("/");
	const t = await getTranslations("Wallet");
	const canManage = roleAllows(ctx.role, "wallet:manage");
	const { accounts, frozen, recent, prefs, anchor } = await readOrg(
		toOrgCtx(ctx),
		async (tx) => ({
			accounts: await listWalletAccounts(tx, ctx.orgId),
			frozen: await frozenByAccount(tx, ctx.orgId),
			recent: await listTransfers(tx, ctx.orgId, { limit: 6 }),
			prefs: await getWalletPreferences(tx, ctx.orgId, ctx.userId),
			anchor: await loadSignerAnchor(tx, ctx.orgId),
		}),
	);
	// Beim ersten Öffnen führt die Einführung (bis abgeschlossen oder „Später“)
	if (shouldShowIntro(prefs))
		redirect(welcomeHref(resumeStep(prefs.introStep)));
	const [euro, quotes, signer] = await Promise.all([
		euroPrices(),
		watchlistQuotes(prefs.pairs.slice(0, 3)),
		signerState(ctx.orgId),
	]);
	// Senden nur mit eigenem Signer (Hot-Konten); Umschichten folgt mit Cold
	const canSend =
		isOwnSigner(signer.state, anchor) &&
		roleAllows(ctx.role, "wallet:initiate");

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
				<PageHeader
					title={t("homeTitle")}
					lead={
						isOwnSigner(signer.state, anchor)
							? t("homeLeadSend")
							: t("homeLead")
					}
				/>
				<EmptyState
					title={t("homeEmptyTitle")}
					lead={canManage ? t("accountsEmpty") : t("homeEmptyBody")}
					actions={
						canManage && (
							<Button asChild size="sm">
								<Link href="/accounts?new=1">
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
				lead={
					isOwnSigner(signer.state, anchor) ? t("homeLeadSend") : t("homeLead")
				}
				actions={
					<Button asChild variant="ghost" size="sm">
						<Link href={welcomeHref("willkommen")}>
							<Compass aria-hidden />
							{t("homeIntro")}
						</Link>
					</Button>
				}
			/>
			<section
				aria-labelledby="wallet-total"
				className="rounded-2xl bg-card p-5 sm:p-6"
			>
				<h2
					id="wallet-total"
					className="font-medium text-muted-foreground text-subhead"
				>
					{t("homeValueLabel")}
				</h2>
				<p
					className="tabular mt-1 font-bold text-large-title sm:text-[2.75rem] sm:leading-tight"
					translate="no"
				>
					{euroTotal !== null ? `${formatScaled(euroTotal)} €` : "—"}
				</p>
				<p className="mt-1 text-footnote text-muted-foreground">
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
							<p className="tabular font-semibold text-title-3" translate="no">
								{amountText(x.network, x.code, x.sum)}
							</p>
							<p className="text-footnote text-muted-foreground">
								{NETWORKS[x.network].label} · {t("available")}
							</p>
						</li>
					))}
				</ul>
				<ul className="mt-6 flex gap-6 sm:gap-8">
					<li>
						<Link
							href="/receive"
							className="group flex flex-col items-center gap-1.5 font-medium text-footnote text-primary focus-visible:outline-none"
						>
							<span className="flex size-12 items-center justify-center rounded-full bg-primary-fill text-white transition-[filter] group-hover:brightness-110 group-active:opacity-70 group-focus-visible:ring-2 group-focus-visible:ring-ring group-focus-visible:ring-offset-2">
								<ArrowDownToLine className="size-5" aria-hidden />
							</span>
							{t("actionReceive")}
						</Link>
					</li>
					{canSend && (
						<li>
							<Link
								href="/send"
								className="group flex flex-col items-center gap-1.5 font-medium text-footnote text-primary focus-visible:outline-none"
							>
								<span className="flex size-12 items-center justify-center rounded-full bg-primary-fill text-white transition-[filter] group-hover:brightness-110 group-active:opacity-70 group-focus-visible:ring-2 group-focus-visible:ring-ring group-focus-visible:ring-offset-2">
									<Send className="size-5" aria-hidden />
								</span>
								{t("actionSend")}
							</Link>
						</li>
					)}
					{[
						...(canSend ? [] : [{ Icon: Send, label: t("actionSend") }]),
						{ Icon: ArrowLeftRight, label: t("actionMove") },
					].map(({ Icon, label }) => (
						<li
							key={label}
							className="flex flex-col items-center gap-1.5 font-medium text-footnote text-muted-foreground"
							title={t("actionSoon")}
						>
							<span
								className="flex size-12 items-center justify-center rounded-full bg-muted"
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

			<section aria-labelledby="wallet-quotes" className="mt-8">
				<div className="mb-2 flex items-center justify-between gap-2">
					<h2 id="wallet-quotes" className="font-semibold text-title-3">
						{t("homeQuotesTitle")}
					</h2>
					<Link
						href="/prices"
						className="text-primary text-subhead underline-offset-4 hover:underline"
					>
						{t("homeAllQuotes")}
					</Link>
				</div>
				{quotes.some((q) => q.price !== null) ? (
					<ul className="list-inset overflow-hidden rounded-2xl bg-card">
						{quotes.map((q) => (
							<li key={q.pair}>
								<QuoteRow quote={q} name={PAIR_NAMES[q.pair]} />
							</li>
						))}
					</ul>
				) : (
					<p className="rounded-2xl bg-card px-4 py-3 text-muted-foreground text-subhead">
						{t("quotesEmpty")}
					</p>
				)}
			</section>

			<section aria-labelledby="wallet-accounts" className="mt-8">
				<div className="mb-3 flex items-center justify-between gap-2">
					<h2 id="wallet-accounts" className="font-semibold text-title-3">
						{t("homeAccountsTitle")}
					</h2>
					{canManage && (
						<Button asChild variant="ghost" size="sm">
							<Link href="/accounts?new=1">
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

			<section aria-labelledby="wallet-recent" className="mt-8">
				<div className="mb-1 flex items-center justify-between gap-2">
					<h2 id="wallet-recent" className="font-semibold text-title-3">
						{t("homeRecentTitle")}
					</h2>
					<Link
						href="/activity"
						className="text-primary text-subhead underline-offset-4 hover:underline"
					>
						{t("homeAllMovements")}
					</Link>
				</div>
				<TransferList rows={recent.rows} />
			</section>
		</>
	);
}
