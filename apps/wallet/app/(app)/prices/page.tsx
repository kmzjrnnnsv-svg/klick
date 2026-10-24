import { QuoteRow } from "@wallet/components/wallet/quote-row";
import { WatchlistForm } from "@wallet/components/wallet/watchlist-form";
import { requireUnlockedPage } from "@wallet/lib/auth/gates";
import { toOrgCtx } from "@wallet/lib/auth/guards";
import { readOrg } from "@wallet/lib/db/with-org";
import { watchlistQuotes } from "@wallet/lib/wallet/market";
import { getWalletPreferences } from "@wallet/lib/wallet/preferences";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { EmptyState } from "@/components/entity/empty-state";
import { PageHeader } from "@/components/page-header";
import { PAIRS } from "@/lib/wallet/core/feeds";
import { PAIR_NAMES } from "@/lib/wallet/pair-names";

export const metadata: Metadata = { title: "Kurse" };

const fmtTime = new Intl.DateTimeFormat("de-DE", {
	dateStyle: "medium",
	timeStyle: "short",
	timeZone: "Europe/Berlin",
});

// /prices — Watchlist mit Kurs, 24-h-Veränderung und Wochenverlauf.
// Quelle: Chainlink-Feeds über den eigenen Ethereum-Knoten (Job price-tick).
export default async function WalletQuotesPage() {
	const ctx = await requireUnlockedPage("/prices");
	const t = await getTranslations("Wallet");
	const prefs = await readOrg(toOrgCtx(ctx), (tx) =>
		getWalletPreferences(tx, ctx.orgId, ctx.userId),
	);
	const quotes = await watchlistQuotes(prefs.pairs);
	const latest = quotes
		.map((q) => q.at)
		.filter((d): d is Date => !!d)
		.sort((a, b) => +b - +a)[0];
	return (
		<>
			<PageHeader
				title={t("quotesTitle")}
				lead={t("quotesLead")}
				actions={
					<WatchlistForm
						all={PAIRS}
						selected={prefs.pairs}
						names={PAIR_NAMES}
					/>
				}
			/>
			{latest ? (
				<>
					<ul className="divide-y divide-border/60 rounded-xl border border-border/60 bg-card px-2">
						{quotes.map((q) => (
							<li key={q.pair}>
								<QuoteRow quote={q} name={PAIR_NAMES[q.pair]} />
							</li>
						))}
					</ul>
					<p className="mt-3 text-muted-foreground text-xs">
						{t("quotesSource", { time: fmtTime.format(latest) })}
					</p>
				</>
			) : (
				<EmptyState title={t("quotesEmptyTitle")} lead={t("quotesEmpty")} />
			)}
		</>
	);
}
