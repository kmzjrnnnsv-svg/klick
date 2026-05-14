"use client";

import { Loader2, Sparkles } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState, useTransition } from "react";
import { refreshCareerAnalysis } from "@/app/actions/career";
import { Button } from "@/components/ui/button";
import type { CareerAnalysis } from "@/lib/ai/types";

const DEMAND_TONE: Record<string, string> = {
	high: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
	medium: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
	low: "bg-rose-500/10 text-rose-700 dark:text-rose-300",
};

const STEPS = [
	{ at: 0, label: "Profil lesen" },
	{ at: 18, label: "Stärken & Lücken bewerten" },
	{ at: 38, label: "Branchen-Treffer suchen" },
	{ at: 58, label: "Zertifizierungs-Pfade prüfen" },
	{ at: 78, label: "Markt vergleichen" },
	{ at: 92, label: "Auswertung schreiben" },
];

// Platzhalter für eine leere Liste — verhindert, dass eine Sektion nur
// aus ihrer Überschrift besteht (sah aus wie ein Render-Bug). Greift bei
// Teil-Analysen aus früheren Schema-Versionen; der Incomplete-Banner
// oben weist parallel auf "neu auswerten" hin.
function EmptyLine() {
	return <li className="text-muted-foreground/50 text-sm">—</li>;
}

// Echter Progress-Bar: asymptotisch auf 92%, snapt auf 100% wenn die
// Server-Action zurückkommt. Status-Text wechselt automatisch je nach
// Fortschritt. Zeitkonstante 25s → bei 60s API-Antwort ist die Anzeige
// bei ~85%, fühlt sich nicht "festgefroren bei 92%" an.
function ProgressPanel({
	tone,
	done,
}: {
	tone: "panel" | "inline";
	done: boolean;
}) {
	const [pct, setPct] = useState(0);

	useEffect(() => {
		if (done) {
			setPct(100);
			return;
		}
		const start = Date.now();
		const id = setInterval(() => {
			const elapsed = (Date.now() - start) / 1000;
			const next = Math.min(92, 92 * (1 - Math.exp(-elapsed / 25)));
			setPct((p) => Math.max(p, next));
		}, 120);
		return () => clearInterval(id);
	}, [done]);

	const currentStep =
		STEPS.filter((s) => s.at <= pct).at(-1)?.label ?? STEPS[0].label;

	const wrap =
		tone === "panel"
			? "rounded-sm border border-primary/30 bg-primary/5 p-5"
			: "rounded-sm border border-border bg-background p-4";

	return (
		<div className={wrap}>
			<div className="flex items-center justify-between gap-3">
				<div className="flex items-center gap-3">
					{done ? (
						<span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-emerald-50 text-xs">
							✓
						</span>
					) : (
						<Loader2
							className="h-5 w-5 animate-spin text-primary"
							strokeWidth={1.5}
						/>
					)}
					<p className="text-foreground text-sm">
						{done ? "Fertig — Auswertung wird angezeigt." : `${currentStep} …`}
					</p>
				</div>
				<span className="font-mono text-[11px] text-muted-foreground tabular-nums">
					{Math.round(pct)} %
				</span>
			</div>
			<div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-muted">
				<div
					className="h-full rounded-full bg-primary transition-[width] duration-200 ease-out"
					style={{ width: `${pct}%` }}
				/>
			</div>
			<ol className="mt-4 grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] sm:grid-cols-3">
				{STEPS.map((s) => {
					const reached = pct >= s.at;
					return (
						<li
							key={s.label}
							className={
								reached ? "text-foreground" : "text-muted-foreground opacity-50"
							}
						>
							{reached ? "●" : "○"} {s.label}
						</li>
					);
				})}
			</ol>
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
	const localeRaw = useLocale();
	const uiLocale: "de" | "en" = localeRaw === "en" ? "en" : "de";
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
		if (isPending) return <ProgressPanel tone="panel" done={false} />;
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

	// Defensive: ältere DB-Einträge können einzelne Listen-Felder als
	// undefined haben (Schema-Drift). Mit leeren Defaults wird gerendert
	// statt zu crashen.
	const strengths = analysis.strengths ?? [];
	const growthAreas = analysis.growthAreas ?? [];
	const primaryIndustries = analysis.primaryIndustries ?? [];
	const adjacentIndustries = analysis.adjacentIndustries ?? [];
	const roleSuggestions = analysis.roleSuggestions ?? [];
	const certificationSuggestions = analysis.certificationSuggestions ?? [];
	const hiringPros = analysis.hiringPros ?? [];
	const hiringCons = analysis.hiringCons ?? [];
	const marketContext = analysis.marketContext ?? null;

	// Schema-Drift-Erkennung: das KI-Schema verlangt JEDE Liste gefüllt.
	// Ist hier auch nur eine leer, stammt die Analyse aus einer früheren
	// Profil-Version oder einem Teil-Fehlschlag — den User auf "neu
	// auswerten" stoßen, damit z. B. die Pro/Contra-Argumente nicht leer
	// bleiben.
	const looksIncomplete =
		strengths.length === 0 ||
		growthAreas.length === 0 ||
		primaryIndustries.length === 0 ||
		adjacentIndustries.length === 0 ||
		certificationSuggestions.length === 0 ||
		roleSuggestions.length === 0 ||
		hiringPros.length === 0 ||
		hiringCons.length === 0;

	// Sprach-Mismatch: Analyse ist auf z. B. Deutsch, UI ist EN. Den User
	// auf neu auswerten stoßen — die KI generiert dann direkt in der
	// aktuellen UI-Sprache. Alte Einträge ohne `language`-Feld gelten
	// implizit als deutsch (das war der Default bevor wir die Locale
	// durchgereicht haben).
	const analysisLanguage: "de" | "en" = analysis.language ?? "de";
	const localeMismatch = !looksIncomplete && analysisLanguage !== uiLocale;

	return (
		<div className="space-y-6">
			{isPending && <ProgressPanel tone="inline" done={false} />}
			{looksIncomplete && !isPending && (
				<div className="flex flex-wrap items-center justify-between gap-3 rounded-sm border border-amber-500/30 bg-amber-500/5 p-3">
					<p className="text-amber-800 text-xs leading-relaxed dark:text-amber-200">
						{t("incompleteHint")}
					</p>
					<button
						type="button"
						onClick={refresh}
						disabled={isPending}
						className="lv-eyebrow inline-flex items-center gap-2 rounded-sm border border-amber-500/40 bg-background px-3 py-1.5 text-[0.55rem] text-amber-800 hover:bg-amber-500/10 disabled:opacity-60 dark:text-amber-200"
					>
						<Sparkles className="h-3 w-3" strokeWidth={1.5} />
						{t("regenerateNow")}
					</button>
				</div>
			)}
			{localeMismatch && !isPending && (
				<div className="flex flex-wrap items-center justify-between gap-3 rounded-sm border border-primary/30 bg-primary/5 p-3">
					<p className="text-foreground/90 text-xs leading-relaxed">
						{t("localeMismatchHint", {
							lang: analysisLanguage === "de" ? "Deutsch" : "English",
						})}
					</p>
					<button
						type="button"
						onClick={refresh}
						disabled={isPending}
						className="lv-eyebrow inline-flex items-center gap-2 rounded-sm border border-primary/40 bg-background px-3 py-1.5 text-[0.55rem] text-primary hover:bg-primary/10 disabled:opacity-60"
					>
						<Sparkles className="h-3 w-3" strokeWidth={1.5} />
						{t("regenerateInLocale", { lang: uiLocale.toUpperCase() })}
					</button>
				</div>
			)}
			<div className="flex flex-wrap items-end justify-between gap-3">
				<div className="flex-1">
					<p className="text-foreground/90 text-sm leading-relaxed">
						{analysis.headline ?? ""}
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

			{/* Salary band — defensiv: gespeicherte Analysen aus früheren
			    Schema-Iterationen können ohne salary kommen, dann skippen. */}
			{analysis.salary?.mid != null && (
				<div className="rounded-sm border border-border bg-muted/30 p-4">
					<p className="lv-eyebrow text-[0.55rem] text-primary">
						{t("salaryBand")}
					</p>
					<div className="mt-2 flex flex-wrap items-baseline gap-3">
						<span className="font-serif-display text-3xl">
							{analysis.salary.mid.toLocaleString()} €
						</span>
						{analysis.salary.low != null && analysis.salary.high != null && (
							<span className="text-muted-foreground text-xs">
								{t("salaryRange", {
									low: analysis.salary.low.toLocaleString(),
									high: analysis.salary.high.toLocaleString(),
								})}
							</span>
						)}
					</div>
					{analysis.salary.rationale && (
						<p className="mt-2 text-muted-foreground text-xs leading-relaxed">
							{analysis.salary.rationale}
						</p>
					)}
				</div>
			)}

			{/* Strengths + growth areas */}
			<div className="grid gap-4 sm:grid-cols-2">
				<div>
					<p className="lv-eyebrow text-[0.55rem] text-emerald-700 dark:text-emerald-300">
						{t("strengths")}
					</p>
					<ul className="mt-2 space-y-1.5 text-xs">
						{strengths.length > 0 ? (
							strengths.map((s) => (
								<li key={s} className="flex gap-2">
									<span className="text-emerald-700 dark:text-emerald-300">
										+
									</span>
									<span>{s}</span>
								</li>
							))
						) : (
							<EmptyLine />
						)}
					</ul>
				</div>
				<div>
					<p className="lv-eyebrow text-[0.55rem] text-amber-700 dark:text-amber-300">
						{t("growthAreas")}
					</p>
					<ul className="mt-2 space-y-1.5 text-xs">
						{growthAreas.length > 0 ? (
							growthAreas.map((g) => (
								<li key={g} className="flex gap-2">
									<span className="text-amber-700 dark:text-amber-300">→</span>
									<span>{g}</span>
								</li>
							))
						) : (
							<EmptyLine />
						)}
					</ul>
				</div>
			</div>

			{/* Industries */}
			<div>
				<p className="lv-eyebrow text-[0.55rem] text-primary">
					{t("primaryIndustries")}
				</p>
				<div className="mt-2 flex flex-wrap gap-1.5">
					{primaryIndustries.length > 0 ? (
						primaryIndustries.map((i) => (
							<span
								key={i}
								className="rounded-sm bg-foreground px-2 py-0.5 font-mono text-[11px] text-background"
							>
								{i}
							</span>
						))
					) : (
						<span className="text-muted-foreground/50 text-sm">—</span>
					)}
				</div>
			</div>

			<div>
				<p className="lv-eyebrow text-[0.55rem] text-primary">
					{t("adjacentIndustries")}
				</p>
				<ul className="mt-2 space-y-2">
					{adjacentIndustries.length > 0 ? (
						adjacentIndustries.map((a) => (
							<li
								key={a.name}
								className="rounded-sm border border-border bg-background p-3 text-xs"
							>
								<p className="font-medium">{a.name}</p>
								<p className="mt-1 text-muted-foreground leading-relaxed">
									{a.rationale}
								</p>
							</li>
						))
					) : (
						<EmptyLine />
					)}
				</ul>
			</div>

			{/* Role suggestions */}
			<div>
				<p className="lv-eyebrow text-[0.55rem] text-primary">
					{t("roleSuggestions")}
				</p>
				<ul className="mt-2 space-y-2">
					{roleSuggestions.length > 0 ? (
						roleSuggestions.map((r) => (
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
						))
					) : (
						<EmptyLine />
					)}
				</ul>
			</div>

			{/* Certifications */}
			<div>
				<p className="lv-eyebrow text-[0.55rem] text-primary">
					{t("certifications")}
				</p>
				<ul className="mt-2 space-y-2">
					{certificationSuggestions.length > 0 ? (
						certificationSuggestions.map((c) => (
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
						))
					) : (
						<EmptyLine />
					)}
				</ul>
			</div>

			{/* Pros / Cons */}
			<div className="grid gap-4 sm:grid-cols-2">
				<div>
					<p className="lv-eyebrow text-[0.55rem] text-emerald-700 dark:text-emerald-300">
						{t("hiringPros")}
					</p>
					<ul className="mt-2 space-y-1.5 text-xs">
						{hiringPros.length > 0 ? (
							hiringPros.map((p) => <li key={p}>{p}</li>)
						) : (
							<EmptyLine />
						)}
					</ul>
				</div>
				<div>
					<p className="lv-eyebrow text-[0.55rem] text-amber-700 dark:text-amber-300">
						{t("hiringCons")}
					</p>
					<ul className="mt-2 space-y-1.5 text-xs">
						{hiringCons.length > 0 ? (
							hiringCons.map((c) => <li key={c}>{c}</li>)
						) : (
							<EmptyLine />
						)}
					</ul>
				</div>
			</div>

			{/* Market context — auch defensiv. */}
			{marketContext && (
				<div className="rounded-sm border border-border bg-muted/30 p-4">
					<div className="flex items-center gap-2">
						<p className="lv-eyebrow text-[0.55rem] text-muted-foreground">
							{t("marketContext")}
						</p>
						{marketContext.demand && (
							<span
								className={`lv-eyebrow rounded-sm px-2 py-0.5 text-[0.5rem] ${
									DEMAND_TONE[marketContext.demand] ?? DEMAND_TONE.medium
								}`}
							>
								{t(`demand.${marketContext.demand}`)}
							</span>
						)}
					</div>
					{marketContext.notes && (
						<p className="mt-2 text-foreground/90 text-xs leading-relaxed">
							{marketContext.notes}
						</p>
					)}
				</div>
			)}
		</div>
	);
}
