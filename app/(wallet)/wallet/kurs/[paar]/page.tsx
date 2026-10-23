import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/page-header";
import { ChangeBadge } from "@/components/wallet/change-badge";
import { type ChartMarker, PriceChart } from "@/components/wallet/price-chart";
import { requireWalletPage } from "@/lib/auth/gates";
import { toOrgCtx } from "@/lib/auth/guards";
import { readOrg } from "@/lib/db/with-org";
import { cn } from "@/lib/utils";
import type { AssetCode } from "@/lib/wallet/core/assets";
import { assetOf } from "@/lib/wallet/core/assets";
import { NETWORKS } from "@/lib/wallet/core/networks";
import { amountText } from "@/lib/wallet/display";
import {
	isRange,
	loadPairSeries,
	pairFromSlug,
	RANGES,
	type RangeKey,
} from "@/lib/wallet/market";
import { PAIR_NAMES } from "@/lib/wallet/pair-names";
import {
	amountValue,
	changeBp,
	formatScaled,
	priceAt,
	toNumber,
} from "@/lib/wallet/prices";
import { listWalletAccounts, transfersForAsset } from "@/lib/wallet/queries";

export const metadata: Metadata = { title: "Kursverlauf" };

const fmtDate = new Intl.DateTimeFormat("de-DE", {
	dateStyle: "medium",
	timeStyle: "short",
	timeZone: "Europe/Berlin",
});

// /wallet/kurs/[paar] — Kursverlauf mit eigenen Ein- und Ausgängen als
// Punkte (Betrag, Kurs, Wert zum Zeitpunkt), Durchschnittskurs der Eingänge
// und Wertentwicklung seitdem. Zeitraum über ?zeitraum=1t|1w|1m|1j|alles.
export default async function WalletPairPage({
	params,
	searchParams,
}: {
	params: Promise<{ paar: string }>;
	searchParams: Promise<{ zeitraum?: string }>;
}) {
	const { paar } = await params;
	const pair = pairFromSlug(paar);
	const ctx = await requireWalletPage(`/wallet/kurs/${paar}`);
	if (!pair) notFound();
	const t = await getTranslations("Wallet");
	const sp = await searchParams;
	const range: RangeKey = isRange(sp.zeitraum) ? sp.zeitraum : "1m";
	const [base, quote] = pair.split("/") as [string, "EUR" | "USD"];
	const asset = (
		["BTC", "ETH", "USDC"].includes(base) ? base : null
	) as AssetCode | null;
	const now = new Date();

	const { transfers, accounts } = await readOrg(toOrgCtx(ctx), async (tx) => ({
		transfers: asset ? await transfersForAsset(tx, ctx.orgId, asset) : [],
		accounts: asset ? await listWalletAccounts(tx, ctx.orgId) : [],
	}));
	const rangeMs = RANGES[range].ms;
	const rangeStart = rangeMs ? new Date(+now - rangeMs) : new Date(0);
	const firstTransfer = transfers[0]?.at;
	const since =
		firstTransfer && +firstTransfer < +rangeStart ? firstTransfer : rangeStart;
	const full = await loadPairSeries(pair, since);
	const series = full.filter((p) => +p.at >= +rangeStart);
	const current = full[full.length - 1]?.value ?? null;
	const fraction = base === "USDC" || pair === "EUR/USD" ? 4 : 2;
	const sym = quote === "EUR" ? "€" : "$";
	const money = (v: bigint) => `${formatScaled(v, fraction)} ${sym}`;

	// Ein-/Ausgänge mit Kurs zum Zeitpunkt
	const priced = transfers
		.map((tr) => {
			const price = priceAt(full, tr.at);
			const decimals = assetOf(tr.network, asset as AssetCode)?.decimals ?? 8;
			return price === null
				? null
				: {
						...tr,
						price,
						value: amountValue(BigInt(tr.amount), decimals, price),
					};
		})
		.filter((x): x is NonNullable<typeof x> => x !== null);
	const markers: ChartMarker[] = priced
		.filter((p) => +p.at >= +rangeStart)
		.map((p) => ({
			id: p.id,
			t: +p.at,
			v: toNumber(p.price),
			dir: p.direction,
			title: `${p.direction === "in" ? t("dir_in") : t("dir_out")} · ${fmtDate.format(p.at)}`,
			lines: [
				amountText(p.network, asset as AssetCode, p.amount),
				t("chartPriceAt", { price: money(p.price) }),
				t("chartValueAt", { value: money(p.value) }),
			],
		}));
	const testnet = priced.some((p) => !NETWORKS[p.network].live);

	// Durchschnittskurs der Eingänge (gewichtet nach Menge) und Entwicklung
	const ins = priced.filter((p) => p.direction === "in");
	const inAmount = ins.reduce((s, p) => s + BigInt(p.amount), 0n);
	const inValue = ins.reduce((s, p) => s + p.value * 10n ** 8n, 0n);
	const decimals = asset
		? (assetOf(ins[0]?.network ?? "bitcoin_signet", asset)?.decimals ?? 8)
		: 8;
	const avg =
		inAmount > 0n
			? (inValue * 10n ** BigInt(decimals)) / inAmount / 10n ** 8n
			: null;
	const sinceAvgBp =
		avg && current ? Number(((current - avg) * 10_000n) / avg) : null;
	const holding = accounts
		.filter((a) => asset && a.balances?.[asset])
		.reduce(
			(s, a) => s + BigInt(a.balances?.[asset as AssetCode]?.confirmed ?? "0"),
			0n,
		);

	const timeFormat =
		range === "1t"
			? "time"
			: range === "1j" || range === "alles"
				? "month"
				: "day";
	return (
		<>
			<PageHeader eyebrow={PAIR_NAMES[pair]} title={pair} />
			<section className="rounded-xl border border-border/60 bg-card p-4 sm:p-6">
				<div className="flex flex-wrap items-end justify-between gap-3">
					<div>
						<p className="font-semibold text-4xl lining-nums" translate="no">
							{current !== null ? money(current) : "—"}
						</p>
						<p className="mt-1 flex items-center gap-2 text-muted-foreground text-xs">
							<ChangeBadge bp={changeBp(series, rangeStart)} />
							<span>{t("chartRange", { range: RANGES[range].label })}</span>
						</p>
					</div>
					<nav aria-label={t("chartRangeLabel")} className="flex gap-1">
						{(Object.keys(RANGES) as RangeKey[]).map((r) => (
							<Link
								key={r}
								href={`/wallet/kurs/${paar}?zeitraum=${r}`}
								aria-current={r === range ? "page" : undefined}
								className={cn(
									"rounded-md px-2.5 py-1 text-xs focus-visible:outline-2 focus-visible:outline-primary",
									r === range
										? "bg-foreground font-medium text-background"
										: "text-muted-foreground hover:bg-muted",
								)}
							>
								{RANGES[r].label}
							</Link>
						))}
					</nav>
				</div>
				{markers.length > 0 && (
					<ul
						className="mt-4 flex gap-4 text-muted-foreground text-xs"
						aria-label={t("chartLegend")}
					>
						<li className="flex items-center gap-1.5">
							<span
								className="inline-block size-2.5 rounded-full bg-foreground"
								aria-hidden
							/>
							{t("dir_in")}
						</li>
						<li className="flex items-center gap-1.5">
							<span
								className="inline-block size-2.5 rounded-full border-2 border-foreground"
								aria-hidden
							/>
							{t("dir_out")}
						</li>
					</ul>
				)}
				<div className="mt-3">
					<PriceChart
						points={series.map((p) => ({ t: +p.at, v: toNumber(p.value) }))}
						markers={markers}
						currency={quote}
						timeFormat={timeFormat}
						label={t("chartLabel", {
							pair: PAIR_NAMES[pair],
							range: RANGES[range].label,
						})}
					/>
				</div>
				<p className="mt-2 text-muted-foreground text-xs">{t("chartSource")}</p>
			</section>

			{asset && (
				<section aria-labelledby="pair-stats" className="mt-8">
					<h2 id="pair-stats" className="sr-only">
						{t("chartStats")}
					</h2>
					<dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
						<div className="rounded-lg border border-border/60 p-4">
							<dt className="text-muted-foreground text-xs">
								{t("statAvgIn")}
							</dt>
							<dd className="mt-1 font-semibold text-xl lining-nums">
								{avg !== null ? money(avg) : "—"}
							</dd>
						</div>
						<div className="rounded-lg border border-border/60 p-4">
							<dt className="text-muted-foreground text-xs">
								{t("statSinceAvg")}
							</dt>
							<dd className="mt-1 text-xl">
								<ChangeBadge bp={sinceAvgBp} />
							</dd>
						</div>
						<div className="rounded-lg border border-border/60 p-4">
							<dt className="text-muted-foreground text-xs">
								{t("statHolding")}
							</dt>
							<dd className="mt-1 font-semibold text-xl lining-nums">
								{current !== null && holding > 0n
									? money(amountValue(holding, decimals, current))
									: "—"}
							</dd>
						</div>
					</dl>
					{testnet && (
						<p className="mt-2 text-muted-foreground text-xs">
							{t("chartTestnet")}
						</p>
					)}
				</section>
			)}

			{priced.length > 0 && (
				<details className="mt-8 text-sm">
					<summary className="cursor-pointer text-muted-foreground hover:text-foreground">
						{t("chartTable")}
					</summary>
					<table className="mt-3 w-full text-left text-sm">
						<thead className="text-muted-foreground text-xs">
							<tr>
								<th className="py-1 font-normal">{t("colTime")}</th>
								<th className="py-1 font-normal">{t("colDirection")}</th>
								<th className="py-1 text-right font-normal">
									{t("colAmount")}
								</th>
								<th className="py-1 text-right font-normal">
									{t("chartPriceCol")}
								</th>
								<th className="py-1 text-right font-normal">
									{t("chartValueCol")}
								</th>
							</tr>
						</thead>
						<tbody className="divide-y divide-border/60">
							{priced.map((p) => (
								<tr key={p.id}>
									<td className="py-1.5">{fmtDate.format(p.at)}</td>
									<td>{p.direction === "in" ? t("dir_in") : t("dir_out")}</td>
									<td className="text-right tabular-nums" translate="no">
										{amountText(p.network, asset as AssetCode, p.amount)}
									</td>
									<td className="text-right tabular-nums">{money(p.price)}</td>
									<td className="text-right tabular-nums">{money(p.value)}</td>
								</tr>
							))}
						</tbody>
					</table>
				</details>
			)}
		</>
	);
}
