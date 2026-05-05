"use client";

import { Loader2, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { refreshCareerAnalysis } from "@/app/actions/career";
import { Button } from "@/components/ui/button";
import type { CareerAnalysis } from "@/lib/ai/types";

const DEMAND_TONE: Record<string, string> = {
	high: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
	medium: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
	low: "bg-rose-500/10 text-rose-700 dark:text-rose-300",
};

function AnalysisSkeleton({ tone }: { tone: "panel" | "inline" }) {
	const wrap =
		tone === "panel"
			? "rounded-sm border border-primary/30 bg-primary/5 p-5"
			: "rounded-sm border border-border bg-background p-4";
	return (
		<div className={wrap}>
			<div className="flex items-center gap-3">
				<Loader2
					className="h-5 w-5 animate-spin text-primary"
					strokeWidth={1.5}
				/>
				<p className="text-foreground text-sm">
					KI liest dein Profil und schreibt die Auswertung — ~30 s …
				</p>
			</div>
			<div className="mt-5 space-y-2.5">
				{[80, 95, 70, 55, 88].map((w, i) => (
					<div
						// biome-ignore lint/suspicious/noArrayIndexKey: cosmetic skeleton
						key={i}
						className="h-2 animate-pulse rounded-full bg-muted"
						style={{ width: `${w}%` }}
					/>
				))}
			</div>
		</div>
	);
}

export function CareerAnalysisView({
	initial,
	updatedAt,
}: {
	initial: CareerAnalysis | null;
	updatedAt: Date | null;
}) {
	const t = useTranslations("Career");
	const [analysis, setAnalysis] = useState<CareerAnalysis | null>(initial);
	const [generatedAt, setGeneratedAt] = useState<Date | null>(updatedAt);
	const [error, setError] = useState<string | null>(null);
	const [isPending, startTransition] = useTransition();

	function refresh() {
		setError(null);
		startTransition(async () => {
			try {
				const result = await refreshCareerAnalysis();
				if (!result.ok) {
					setError(result.error);
					return;
				}
				setAnalysis(result.analysis);
				setGeneratedAt(new Date());
			} catch (e) {
				setError(e instanceof Error ? e.message : String(e));
			}
		});
	}

	if (!analysis) {
		if (isPending) return <AnalysisSkeleton tone="panel" />;
		return (
			<div className="rounded-sm border border-primary/30 bg-primary/5 p-5">
				<p className="text-muted-foreground text-xs leading-relaxed">
					{t("emptyHint")}
				</p>
				<Button
					onClick={refresh}
					disabled={isPending}
					size="sm"
					className="mt-4"
				>
					<Sparkles className="h-3 w-3" strokeWidth={1.5} />
					{t("generate")}
				</Button>
				{error && (
					<p className="mt-3 text-rose-700 text-xs dark:text-rose-300">
						{error}
					</p>
				)}
			</div>
		);
	}

	return (
		<div className="space-y-6">
			{isPending && <AnalysisSkeleton tone="inline" />}
			<div className="flex flex-wrap items-end justify-between gap-3">
				<div className="flex-1">
					<p className="text-foreground/90 text-sm leading-relaxed">
						{analysis.headline}
					</p>
					{generatedAt && (
						<p className="mt-2 font-mono text-[10px] text-muted-foreground">
							{t("updatedAt", { date: generatedAt.toLocaleDateString() })}
						</p>
					)}
				</div>
				<button
					type="button"
					onClick={refresh}
					disabled={isPending}
					className="lv-eyebrow inline-flex items-center gap-2 rounded-sm border border-primary/40 bg-primary/5 px-3 py-1.5 text-[0.55rem] text-primary hover:bg-primary hover:text-primary-foreground disabled:opacity-60"
				>
					{isPending ? (
						<Loader2 className="h-3 w-3 animate-spin" strokeWidth={1.5} />
					) : (
						<Sparkles className="h-3 w-3" strokeWidth={1.5} />
					)}
					{isPending ? t("regenerating") : t("regenerate")}
				</button>
			</div>
			{error && (
				<p className="rounded-sm border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-rose-700 text-xs dark:text-rose-300">
					{error}
				</p>
			)}

			{/* Salary band */}
			<div className="rounded-sm border border-border bg-muted/30 p-4">
				<p className="lv-eyebrow text-[0.55rem] text-primary">
					{t("salaryBand")}
				</p>
				<div className="mt-2 flex flex-wrap items-baseline gap-3">
					<span className="font-serif-display text-3xl">
						{analysis.salary.mid.toLocaleString()} €
					</span>
					<span className="text-muted-foreground text-xs">
						{t("salaryRange", {
							low: analysis.salary.low.toLocaleString(),
							high: analysis.salary.high.toLocaleString(),
						})}
					</span>
				</div>
				<p className="mt-2 text-muted-foreground text-xs leading-relaxed">
					{analysis.salary.rationale}
				</p>
			</div>

			{/* Strengths + growth areas */}
			<div className="grid gap-4 sm:grid-cols-2">
				<div>
					<p className="lv-eyebrow text-[0.55rem] text-emerald-700 dark:text-emerald-300">
						{t("strengths")}
					</p>
					<ul className="mt-2 space-y-1.5 text-xs">
						{analysis.strengths.map((s) => (
							<li key={s} className="flex gap-2">
								<span className="text-emerald-700 dark:text-emerald-300">
									+
								</span>
								<span>{s}</span>
							</li>
						))}
					</ul>
				</div>
				<div>
					<p className="lv-eyebrow text-[0.55rem] text-amber-700 dark:text-amber-300">
						{t("growthAreas")}
					</p>
					<ul className="mt-2 space-y-1.5 text-xs">
						{analysis.growthAreas.map((g) => (
							<li key={g} className="flex gap-2">
								<span className="text-amber-700 dark:text-amber-300">→</span>
								<span>{g}</span>
							</li>
						))}
					</ul>
				</div>
			</div>

			{/* Industries */}
			<div>
				<p className="lv-eyebrow text-[0.55rem] text-primary">
					{t("primaryIndustries")}
				</p>
				<div className="mt-2 flex flex-wrap gap-1.5">
					{analysis.primaryIndustries.map((i) => (
						<span
							key={i}
							className="rounded-sm bg-foreground px-2 py-0.5 font-mono text-[11px] text-background"
						>
							{i}
						</span>
					))}
				</div>
			</div>

			<div>
				<p className="lv-eyebrow text-[0.55rem] text-primary">
					{t("adjacentIndustries")}
				</p>
				<ul className="mt-2 space-y-2">
					{analysis.adjacentIndustries.map((a) => (
						<li
							key={a.name}
							className="rounded-sm border border-border bg-background p-3 text-xs"
						>
							<p className="font-medium">{a.name}</p>
							<p className="mt-1 text-muted-foreground leading-relaxed">
								{a.rationale}
							</p>
						</li>
					))}
				</ul>
			</div>

			{/* Role suggestions */}
			<div>
				<p className="lv-eyebrow text-[0.55rem] text-primary">
					{t("roleSuggestions")}
				</p>
				<ul className="mt-2 space-y-2">
					{analysis.roleSuggestions.map((r) => (
						<li
							key={r.title}
							className="grid grid-cols-[auto_1fr] gap-3 rounded-sm border border-border bg-background p-3 text-xs"
						>
							<span
								className={`lv-eyebrow rounded-sm px-2 py-0.5 text-[0.5rem] ${
									r.obvious
										? "bg-muted text-muted-foreground"
										: "bg-primary/10 text-primary"
								}`}
							>
								{r.obvious ? t("obvious") : t("hidden")}
							</span>
							<div>
								<p className="font-medium">{r.title}</p>
								<p className="mt-1 text-muted-foreground leading-relaxed">
									{r.rationale}
								</p>
							</div>
						</li>
					))}
				</ul>
			</div>

			{/* Certifications */}
			<div>
				<p className="lv-eyebrow text-[0.55rem] text-primary">
					{t("certifications")}
				</p>
				<ul className="mt-2 space-y-2">
					{analysis.certificationSuggestions.map((c) => (
						<li
							key={c.name}
							className="rounded-sm border border-border bg-background p-3 text-xs"
						>
							<div className="flex items-baseline justify-between gap-3">
								<p className="font-medium">{c.name}</p>
								<span className="font-mono text-[10px] text-muted-foreground">
									{t("effortHours", { hours: c.effortHours })}
								</span>
							</div>
							<p className="mt-0.5 text-[10px] text-muted-foreground">
								{t("issuedBy", { issuer: c.issuer })}
							</p>
							<p className="mt-1 text-muted-foreground leading-relaxed">
								{c.why}
							</p>
						</li>
					))}
				</ul>
			</div>

			{/* Pros / Cons */}
			<div className="grid gap-4 sm:grid-cols-2">
				<div>
					<p className="lv-eyebrow text-[0.55rem] text-emerald-700 dark:text-emerald-300">
						{t("hiringPros")}
					</p>
					<ul className="mt-2 space-y-1.5 text-xs">
						{analysis.hiringPros.map((p) => (
							<li key={p}>{p}</li>
						))}
					</ul>
				</div>
				<div>
					<p className="lv-eyebrow text-[0.55rem] text-amber-700 dark:text-amber-300">
						{t("hiringCons")}
					</p>
					<ul className="mt-2 space-y-1.5 text-xs">
						{analysis.hiringCons.map((c) => (
							<li key={c}>{c}</li>
						))}
					</ul>
				</div>
			</div>

			{/* Market context */}
			<div className="rounded-sm border border-border bg-muted/30 p-4">
				<div className="flex items-center gap-2">
					<p className="lv-eyebrow text-[0.55rem] text-muted-foreground">
						{t("marketContext")}
					</p>
					<span
						className={`lv-eyebrow rounded-sm px-2 py-0.5 text-[0.5rem] ${
							DEMAND_TONE[analysis.marketContext.demand] ?? DEMAND_TONE.medium
						}`}
					>
						{t(`demand.${analysis.marketContext.demand}`)}
					</span>
				</div>
				<p className="mt-2 text-foreground/90 text-xs leading-relaxed">
					{analysis.marketContext.notes}
				</p>
			</div>
		</div>
	);
}
