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
			className="flex items-center gap-3 rounded-md px-2 py-3 transition-[background-color] hover:bg-muted/60 focus-visible:outline-2 focus-visible:outline-primary"
		>
			<div className="min-w-0 grow">
				<p className="truncate font-medium text-sm" translate="no">
					{quote.pair}
				</p>
				<p className="truncate text-muted-foreground text-xs">{name}</p>
			</div>
			<Sparkline values={quote.spark} />
			<div className="flex w-28 shrink-0 flex-col items-end">
				<span className="font-medium text-sm tabular-nums" translate="no">
					{quote.price !== null
						? `${formatScaled(quote.price, fraction)} ${symbol(quote.pair)}`
						: "—"}
				</span>
				<ChangeBadge bp={quote.changeBp} />
			</div>
		</Link>
	);
}
