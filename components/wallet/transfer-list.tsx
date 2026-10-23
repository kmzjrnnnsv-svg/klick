import { ArrowDownLeft, ArrowUpRight, Snowflake } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { amountText, shortHash } from "@/lib/wallet/display";
import type { TransferRow } from "@/lib/wallet/queries";

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
			<p className="text-muted-foreground text-sm">{t("movementsEmpty")}</p>
		);
	return (
		<ul className="divide-y divide-border/60">
			{rows.map((r) => {
				const incoming = r.direction === "in";
				const Icon = incoming ? ArrowDownLeft : ArrowUpRight;
				const when = r.blockTime ?? r.firstSeenAt;
				return (
					<li key={r.id} className="flex items-center gap-3 py-3">
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
							<p className="truncate text-sm">
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
								className="truncate text-muted-foreground text-xs"
								title={r.txid}
								translate="no"
							>
								{fmtTime.format(when)} · {shortHash(r.txid)}
							</p>
						</div>
						<div className="flex shrink-0 flex-col items-end gap-1">
							<span
								className={`whitespace-nowrap text-sm tabular-nums ${
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
