import { ChangeBadge } from "@wallet/components/wallet/change-badge";
import { Sparkline } from "@wallet/components/wallet/sparkline";
import type { Quote } from "@wallet/lib/wallet/market";
import { pairSlug } from "@wallet/lib/wallet/market";
import Link from "next/link";
import { formatScaled } from "@/lib/wallet/prices";

const symbol = (pair: string) => (pair.endsWith("/EUR") ? "€" : "$");

export function QuoteRow({ quote, name }: { quote: Quote; name: string }) {
	const fraction =
		quote.pair.startsWith("USDC") || quote.pair === "EUR/USD" ? 4 : 2;
	return (
		<Link
			href={`/prices/${pairSlug(quote.pair)}`}
			className="flex min-h-14 items-center gap-3 px-4 py-2.5 transition-[background-color] hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
		>
			<div className="min-w-0 grow">
				<p className="truncate font-semibold text-subhead" translate="no">
					{quote.pair}
				</p>
				<p className="truncate text-footnote text-muted-foreground">{name}</p>
			</div>
			<Sparkline values={quote.spark} />
			<div className="flex w-28 shrink-0 flex-col items-end">
				<span className="font-medium text-subhead tabular-nums" translate="no">
					{quote.price !== null
						? `${formatScaled(quote.price, fraction)} ${symbol(quote.pair)}`
						: "—"}
				</span>
				<ChangeBadge bp={quote.changeBp} />
			</div>
		</Link>
	);
}
