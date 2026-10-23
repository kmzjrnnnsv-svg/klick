import { AlertTriangle } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import type { WalletAccount } from "@/db/schema/wallet";
import { ASSETS, type AssetCode } from "@/lib/wallet/core/assets";
import { NETWORKS } from "@/lib/wallet/core/networks";
import { amountText } from "@/lib/wallet/display";

const fmtTime = new Intl.DateTimeFormat("de-DE", {
	dateStyle: "short",
	timeStyle: "short",
	timeZone: "Europe/Berlin",
});

// Bestand eines Kontos laut Knoten, eingefrorene Eingänge abgezogen
export function accountAssets(
	account: Pick<WalletAccount, "network" | "balances">,
	frozen: Partial<Record<AssetCode, bigint>> = {},
) {
	return ASSETS[account.network].map((a) => {
		const b = account.balances?.[a.code];
		const confirmed = BigInt(b?.confirmed ?? "0");
		const pending = BigInt(b?.pending ?? "0");
		const held = frozen[a.code] ?? 0n;
		const available = confirmed - held < 0n ? 0n : confirmed - held;
		return { code: a.code, available, pending, frozen: held };
	});
}

export async function AccountCard({
	account,
	frozen,
	link = true,
}: {
	account: WalletAccount;
	frozen?: Partial<Record<AssetCode, bigint>>;
	// auf der eigenen Detailseite kein Link auf sich selbst
	link?: boolean;
}) {
	const t = await getTranslations("Wallet");
	const assets = accountAssets(account, frozen);
	const shown = assets.filter(
		(a, i) =>
			i === 0 || a.available !== 0n || a.pending !== 0n || a.frozen !== 0n,
	);
	const body = (
		<>
			<div className="flex items-start justify-between gap-2">
				<div className="min-w-0">
					<p className="truncate font-medium">{account.name}</p>
					<p className="truncate text-muted-foreground text-xs">
						{NETWORKS[account.network].label}
					</p>
				</div>
				<Badge variant="outline">{t(`kind_${account.kind}`)}</Badge>
			</div>
			<ul className="flex flex-col gap-1">
				{shown.map((a) => (
					<li
						key={a.code}
						className="flex items-baseline justify-between gap-2"
					>
						<span className="font-semibold text-lg lining-nums" translate="no">
							{amountText(account.network, a.code, a.available)}
						</span>
						<span className="text-right text-muted-foreground text-xs">
							{a.pending !== 0n &&
								t("pendingAmount", {
									amount: amountText(account.network, a.code, a.pending),
								})}
							{a.frozen !== 0n && (
								<span className="block text-destructive">
									{t("frozenAmount", {
										amount: amountText(account.network, a.code, a.frozen),
									})}
								</span>
							)}
						</span>
					</li>
				))}
			</ul>
			<p className="flex items-center gap-1.5 text-muted-foreground text-xs">
				{account.syncError ? (
					<>
						<AlertTriangle className="size-3.5 text-destructive" aria-hidden />
						<span className="truncate text-destructive">
							{t("syncError", { error: account.syncError })}
						</span>
					</>
				) : account.syncedAt ? (
					t("syncAt", { time: fmtTime.format(account.syncedAt) })
				) : (
					t("syncNever")
				)}
			</p>
		</>
	);
	const box =
		"flex flex-col gap-3 rounded-lg border border-border/60 bg-card p-4";
	return link ? (
		<Link
			href={`/wallet/konten/${account.id}`}
			className={`${box} transition-[border-color,background-color] hover:border-foreground/30 focus-visible:outline-2 focus-visible:outline-primary`}
		>
			{body}
		</Link>
	) : (
		<div className={box}>{body}</div>
	);
}
