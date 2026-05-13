"use client";

import { TrendingDown, TrendingUp } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { getSalaryHistory } from "@/app/actions/profile";

type Entry = {
	low: number;
	mid: number;
	high: number;
	currency: string;
	rationale: string;
	at: Date;
};

// Zeigt die letzten N Salary-Empfehlungen für ein Land als kleine
// Trend-Liste. Markiert nicht-trivale Sprünge gegenüber dem direkten
// Vorgänger mit Up-/Down-Pfeil + Prozent.
export function SalaryHistory({ country }: { country: string }) {
	const t = useTranslations("Profile.salaryByCountry");
	const fmt = useFormatter();
	const [entries, setEntries] = useState<Entry[]>([]);
	const [loaded, setLoaded] = useState(false);

	useEffect(() => {
		let cancelled = false;
		(async () => {
			const rows = await getSalaryHistory(country);
			if (cancelled) return;
			// Server liefert Date-Objekte als ISO-Strings über die Boundary —
			// in Date konvertieren.
			setEntries(
				rows.map((r) => ({
					...r,
					at: typeof r.at === "string" ? new Date(r.at) : r.at,
				})),
			);
			setLoaded(true);
		})();
		return () => {
			cancelled = true;
		};
	}, [country]);

	if (!loaded) return null;
	if (entries.length < 2) return null; // erst ab 2 Einträgen interessant

	return (
		<div className="mt-2 rounded-sm border border-border bg-muted/30 p-2 text-[11px]">
			<p className="lv-eyebrow text-[0.55rem] text-muted-foreground">
				{t("salaryTrendLabel")}
			</p>
			<ol className="mt-1 space-y-0.5">
				{entries.map((e, idx) => {
					const prev = entries[idx + 1];
					const delta = prev
						? Math.round(((e.mid - prev.mid) / prev.mid) * 100)
						: null;
					return (
						<li
							key={e.at.toISOString()}
							className="flex items-baseline justify-between gap-2"
						>
							<span className="font-mono text-muted-foreground tabular-nums">
								{fmt.dateTime(e.at, { dateStyle: "short" })}
							</span>
							<span className="font-mono">
								{e.low.toLocaleString()}–{e.high.toLocaleString()} {e.currency}
							</span>
							{delta !== null && Math.abs(delta) >= 1 && (
								<span
									className={`inline-flex items-center gap-0.5 font-mono ${
										delta > 0
											? "text-emerald-700 dark:text-emerald-300"
											: "text-amber-700 dark:text-amber-300"
									}`}
								>
									{delta > 0 ? (
										<TrendingUp className="h-3 w-3" strokeWidth={1.5} />
									) : (
										<TrendingDown className="h-3 w-3" strokeWidth={1.5} />
									)}
									{delta > 0 ? "+" : ""}
									{delta}%
								</span>
							)}
						</li>
					);
				})}
			</ol>
		</div>
	);
}
