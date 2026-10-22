import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import Link from "next/link";
import type { Quote } from "@/lib/wallet/market";
import { pairSlug } from "@/lib/wallet/market";
import { formatScaled } from "@/lib/wallet/prices";
import { Sparkline } from "./sparkline";

const symbol = (pair: string) => (pair.endsWith("/EUR") ? "€" : "$");

// Veränderung mit Zeichen und Pfeil — nie Farbe allein
export function ChangeBadge({ bp }: { bp: number | null }) {
	if (bp === null)
		return <span className="text-muted-foreground text-xs">—</span>;
	const up = bp >= 0;
	const Icon = up ? ArrowUpRight : ArrowDownRight;
	return (
		<span
			className={`inline-flex items-center gap-0.5 text-xs tabular-nums ${up ? "text-success" : "text-destructive"}`}
		>
			<Icon className="size-3" aria-hidden />
			{up ? "+" : "−"}
			{(Math.abs(bp) / 100).toLocaleString("de-DE", {
				minimumFractionDigits: 2,
				maximumFractionDigits: 2,
			})}
			&nbsp;%
		</span>
	);
}

export function QuoteRow({ quote, name }: { quote: Quote; name: string }) {
	const fraction =
		quote.pair.startsWith("USDC") || quote.pair === "EUR/USD" ? 4 : 2;
	return (
		<Link
			href={`/wallet/kurs/${pairSlug(quote.pair)}`}
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
