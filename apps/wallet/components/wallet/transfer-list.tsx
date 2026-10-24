import type { TransferRow } from "@wallet/lib/wallet/queries";
import { ArrowDownLeft, ArrowUpRight, Snowflake } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { amountText, shortHash } from "@/lib/wallet/display";

const fmtTime = new Intl.DateTimeFormat("de-DE", {
	dateStyle: "medium",
	timeStyle: "short",
	timeZone: "Europe/Berlin",
});

export async function TransferStatus({
	row,
}: {
	row: Pick<TransferRow, "status" | "confirmations" | "frozen">;
}) {
	const t = await getTranslations("Wallet");
	if (row.frozen)
		return (
			<Badge variant="destructive">
				<Snowflake aria-hidden />
				{t("frozen")}
			</Badge>
		);
	if (row.status === "confirmed")
		return <Badge variant="success">{t("status_confirmed")}</Badge>;
	if (row.status === "dropped")
		return <Badge variant="muted">{t("status_dropped")}</Badge>;
	return (
		<Badge variant="warning">
			{t("status_pending", { n: row.confirmations })}
		</Badge>
	);
}

// Kompakte Liste (Startseite, Konto): Richtung, Betrag, Konto, Zeit, Status
export async function TransferList({
	rows,
	showAccount = true,
}: {
	rows: TransferRow[];
	showAccount?: boolean;
}) {
	const t = await getTranslations("Wallet");
	if (rows.length === 0)
		return (
			<p className="rounded-2xl bg-card px-4 py-3 text-muted-foreground text-subhead">
				{t("movementsEmpty")}
			</p>
		);
	return (
		<ul className="overflow-hidden rounded-2xl bg-card">
			{rows.map((r) => {
				const incoming = r.direction === "in";
				const Icon = incoming ? ArrowDownLeft : ArrowUpRight;
				const when = r.blockTime ?? r.firstSeenAt;
				return (
					<li
						key={r.id}
						className="relative flex min-h-14 items-center gap-3 px-4 py-2.5 before:pointer-events-none before:absolute before:top-0 before:right-0 before:left-16 before:h-px before:bg-border/70 first:before:hidden"
					>
						<span
							className={`flex size-9 shrink-0 items-center justify-center rounded-full ${
								incoming
									? "bg-success/15 text-success"
									: "bg-muted text-foreground"
							}`}
						>
							<Icon className="size-4" aria-hidden />
						</span>
						<div className="min-w-0 grow">
							<p className="truncate text-subhead">
								{r.outputRef === "out:fee"
									? t("fee")
									: incoming
										? t("dir_in")
										: t("dir_out")}
								{showAccount && (
									<span className="text-muted-foreground">
										{" "}
										· {r.accountName}
									</span>
								)}
							</p>
							<p
								className="truncate text-footnote text-muted-foreground"
								title={r.txid}
								translate="no"
							>
								{fmtTime.format(when)} · {shortHash(r.txid)}
							</p>
						</div>
						<div className="flex shrink-0 flex-col items-end gap-1">
							<span
								className={`whitespace-nowrap font-medium text-subhead tabular-nums ${
									incoming ? "text-success" : ""
								}`}
								translate="no"
							>
								{incoming ? "+" : "−"}
								{amountText(r.network, r.asset, r.amount)}
							</span>
							<TransferStatus row={r} />
						</div>
					</li>
				);
			})}
		</ul>
	);
}
