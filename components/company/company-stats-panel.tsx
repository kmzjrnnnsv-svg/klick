import { Star } from "lucide-react";
import { useTranslations } from "next-intl";
import type { EmployerStats } from "@/app/actions/company-stats";

const DIMS = ["clarity", "respect", "effort", "responseTime"] as const;

function ratingTone(value: number | null): string {
	if (value == null) return "text-muted-foreground";
	if (value >= 4) return "text-emerald-700 dark:text-emerald-300";
	if (value >= 3) return "text-amber-700 dark:text-amber-300";
	return "text-rose-700 dark:text-rose-300";
}

export function CompanyStatsPanel({ stats }: { stats: EmployerStats }) {
	const t = useTranslations("CompanyStats");

	if (!stats.hasEnoughData && stats.totalApplications === 0) {
		return null;
	}

	return (
		<section className="mt-12 mb-12">
			<p className="lv-eyebrow text-[0.55rem] text-muted-foreground">
				{t("eyebrow")}
			</p>
			<h2 className="mt-2 mb-4 font-serif-display text-xl">{t("title")}</h2>

			<p className="mb-6 text-muted-foreground text-xs leading-relaxed">
				{t("methodology")}
			</p>

			{/* Top-Level numbers */}
			<dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
				{stats.closureRate !== null && (
					<div className="rounded-sm border border-border bg-background p-3">
						<dt className="lv-eyebrow text-[0.5rem] text-muted-foreground">
							{t("closureRate")}
						</dt>
						<dd className="mt-1 font-serif-display text-2xl">
							{stats.closureRate}%
						</dd>
						<p className="mt-0.5 text-[10px] text-muted-foreground">
							{t("closureRateBasis", { count: stats.totalApplications })}
						</p>
					</div>
				)}
				{stats.avgDaysToDecision !== null && stats.totalDecided > 0 && (
					<div className="rounded-sm border border-border bg-background p-3">
						<dt className="lv-eyebrow text-[0.5rem] text-muted-foreground">
							{t("avgDays")}
						</dt>
						<dd className="mt-1 font-serif-display text-2xl">
							{stats.avgDaysToDecision}d
						</dd>
						<p className="mt-0.5 text-[10px] text-muted-foreground">
							{t("avgDaysHint")}
						</p>
					</div>
				)}
				{stats.hasEnoughData && (
					<div className="col-span-2 rounded-sm border border-border bg-background p-3">
						<dt className="lv-eyebrow text-[0.5rem] text-muted-foreground">
							{t("ratingBasis", { count: stats.totalRatings })}
						</dt>
						<dd className="mt-1 font-mono text-[10px] text-muted-foreground">
							{t("ratingHint")}
						</dd>
					</div>
				)}
			</dl>

			{/* Per-dimension stars */}
			{stats.hasEnoughData && (
				<dl className="mt-4 space-y-2 rounded-sm border border-border bg-background p-4">
					{DIMS.map((d) => {
						const v = stats.dimensions[d];
						return (
							<div
								key={d}
								className="grid grid-cols-[1fr_auto_auto] items-center gap-3"
							>
								<dt className="text-foreground/90 text-xs">{t(`dim.${d}`)}</dt>
								<dd className="flex items-center gap-0.5">
									{[1, 2, 3, 4, 5].map((n) => (
										<Star
											key={n}
											className={`h-3.5 w-3.5 ${
												v != null && v >= n
													? "fill-amber-400 text-amber-400"
													: "text-muted-foreground/30"
											}`}
											strokeWidth={1.5}
										/>
									))}
								</dd>
								<dd className={`font-mono text-xs ${ratingTone(v)}`}>
									{v != null ? v.toFixed(1) : "—"}
								</dd>
							</div>
						);
					})}
				</dl>
			)}

			{/* Reject-Reason-Breakdown */}
			{stats.rejectReasonBreakdown.length > 0 && (
				<div className="mt-4 rounded-sm border border-border bg-background p-4">
					<p className="lv-eyebrow text-[0.5rem] text-muted-foreground">
						{t("rejectBreakdown")}
					</p>
					<p className="mt-1 text-[11px] text-muted-foreground">
						{t("rejectBreakdownHint")}
					</p>
					<dl className="mt-3 space-y-1.5">
						{stats.rejectReasonBreakdown.map((r) => (
							<div key={r.reason} className="grid grid-cols-[1fr_auto] gap-3">
								<dt className="text-xs">{t(`rejectReason.${r.reason}`)}</dt>
								<dd className="font-mono text-[10px] text-muted-foreground tabular-nums">
									{r.pct}% <span className="opacity-60">({r.count})</span>
								</dd>
							</div>
						))}
					</dl>
				</div>
			)}

			{!stats.hasEnoughData && stats.totalApplications > 0 && (
				<p className="mt-4 rounded-sm border border-border border-dashed bg-muted/30 p-3 text-muted-foreground text-xs leading-relaxed">
					{t("notEnoughYet")}
				</p>
			)}
		</section>
	);
}
