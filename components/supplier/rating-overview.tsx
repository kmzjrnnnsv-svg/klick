import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { LatestRating } from "@/lib/compliance/queries-ratings";
import { cn } from "@/lib/utils";

const TRAFFIC_BAR = {
	red: "bg-destructive",
	amber: "bg-warning",
	green: "bg-success",
} as const;
const TRAFFIC_ORDER = ["green", "amber", "red"] as const;

// Übersicht der internen Lieferantenbewertung (Excel-„Dashboard“):
// Kennzahlen, Verteilung nach Ampel, Bewertung je Lieferant in Prozent.
export async function RatingOverview({
	providers,
	ratings,
	today,
}: {
	providers: {
		id: string;
		name: string;
		status: string;
		nextAssessmentAt: string | null;
	}[];
	ratings: Map<string, LatestRating>;
	today: string;
}) {
	const t = await getTranslations("Rating");
	const active = providers.filter(
		(p) => p.status !== "terminated" && p.status !== "paused",
	);
	const rated = active.filter((p) => {
		const r = ratings.get(p.id);
		return r && r.totalScore !== null && !r.draft;
	});
	const completed = active
		.map((p) => ({ p, r: ratings.get(p.id) }))
		.filter((x): x is { p: (typeof active)[number]; r: LatestRating } =>
			Boolean(x.r && x.r.totalScore !== null),
		);
	const inProgress = active.filter((p) => ratings.get(p.id)?.draft).length;
	const overdue = active.filter(
		(p) => p.nextAssessmentAt && p.nextAssessmentAt < today,
	).length;
	const avg =
		completed.length > 0
			? completed.reduce((s, x) => s + (x.r.totalScore ?? 0), 0) /
				completed.length
			: null;
	const byTraffic = Object.fromEntries(
		TRAFFIC_ORDER.map((k) => [
			k,
			completed.filter((x) => x.r.traffic === k).length,
		]),
	) as Record<(typeof TRAFFIC_ORDER)[number], number>;
	const sorted = [...completed].sort(
		(a, b) => (a.r.totalScore ?? 0) - (b.r.totalScore ?? 0),
	);
	const kpis: [string, string | number][] = [
		[t("kpiPlanned"), active.length],
		[t("kpiRated"), completed.length],
		[t("kpiPending"), active.length - rated.length],
		[t("kpiInProgress"), inProgress],
		[t("kpiOverdue"), overdue],
		[
			t("kpiAverage"),
			avg === null
				? "—"
				: `${avg.toFixed(2).replace(".", ",")} · ${Math.round((avg / 5) * 100)} %`,
		],
	];
	return (
		<div className="flex flex-col gap-8">
			<dl className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
				{kpis.map(([label, value]) => (
					<div key={label} className="rounded-md border p-3">
						<dt className="text-muted-foreground text-xs">{label}</dt>
						<dd className="font-medium text-2xl tabular-nums">{value}</dd>
					</div>
				))}
			</dl>
			<section aria-labelledby="ro-traffic" className="flex flex-col gap-3">
				<h2 id="ro-traffic" className="font-medium">
					{t("trafficTitle")}
				</h2>
				<ul className="grid gap-3 sm:grid-cols-3">
					{TRAFFIC_ORDER.map((k) => (
						<li
							key={k}
							className="flex items-center gap-3 rounded-md border p-3"
						>
							<span
								aria-hidden
								className={cn("size-3 shrink-0 rounded-full", TRAFFIC_BAR[k])}
							/>
							<span className="flex-1 text-sm">{t(`traffic_${k}`)}</span>
							<span className="font-medium text-xl tabular-nums">
								{byTraffic[k]}
							</span>
						</li>
					))}
				</ul>
			</section>
			<section aria-labelledby="ro-bars" className="flex flex-col gap-3">
				<h2 id="ro-bars" className="font-medium">
					{t("barsTitle")}
				</h2>
				{sorted.length === 0 ? (
					<p className="text-muted-foreground text-sm">{t("barsEmpty")}</p>
				) : (
					<ul className="flex flex-col gap-2 text-sm">
						{sorted.map(({ p, r }) => {
							const pct = Math.round(((r.totalScore ?? 0) / 5) * 100);
							return (
								<li
									key={p.id}
									className="grid items-center gap-2 sm:grid-cols-[14rem_1fr_8rem]"
								>
									<Link
										href={`/dienstleister/${p.id}?tab=bewertungen`}
										className="truncate hover:underline"
									>
										{p.name}
									</Link>
									<span
										className="relative h-3 rounded-sm bg-muted"
										title={`${p.name}: ${pct} % · ${r.level ?? ""}`}
									>
										<span
											className={cn(
												"absolute inset-y-0 left-0 rounded-r-[4px]",
												r.traffic ? TRAFFIC_BAR[r.traffic] : "bg-foreground/40",
											)}
											style={{ width: `${pct}%` }}
										/>
									</span>
									<span className="tabular-nums">
										{pct} % · {r.level}
									</span>
								</li>
							);
						})}
					</ul>
				)}
			</section>
		</div>
	);
}
