import { Clock } from "lucide-react";
import { useTranslations } from "next-intl";
import type { JobStage } from "@/db/schema";

// Transparenz vor der Bewerbung. Statt sich „auf Verdacht" zu bewerben
// und 3 Monate ins Schwarze Loch zu starren, sehen Bewerber vorher
// genau wie viele Stages anstehen und wie lange das dauert. Quelle:
// 60% der Bewerber brechen lange Prozesse ab (Manatal 2026).
export function JobProcessPreview({ stages }: { stages: JobStage[] }) {
	const t = useTranslations("JobDetail");
	if (stages.length === 0) return null;

	const totalDays = stages.reduce((acc, s) => acc + (s.expectedDays ?? 0), 0);

	return (
		<section className="mb-10 rounded-sm border border-border bg-muted/30 p-4 sm:p-6">
			<div className="flex flex-wrap items-baseline justify-between gap-2">
				<div>
					<p className="lv-eyebrow text-[0.6rem] text-primary">
						{t("processEyebrow")}
					</p>
					<h2 className="mt-2 font-serif-display text-xl sm:text-2xl">
						{t("processTitle")}
					</h2>
				</div>
				{totalDays > 0 && (
					<span className="inline-flex items-center gap-1 rounded-sm bg-background px-2 py-1 font-mono text-[10px] text-muted-foreground">
						<Clock className="h-3 w-3" strokeWidth={1.5} />
						{t("processTotalDays", {
							min: Math.max(1, Math.round(totalDays * 0.7)),
							max: Math.max(2, Math.round(totalDays * 1.3)),
						})}
					</span>
				)}
			</div>
			<p className="mt-2 mb-4 text-muted-foreground text-xs leading-relaxed">
				{t("processHint")}
			</p>
			<ol className="space-y-2">
				{stages.map((s, i) => (
					<li
						key={s.id}
						className="grid grid-cols-[auto_1fr_auto] items-baseline gap-3 rounded-sm border border-border bg-background p-3"
					>
						<span className="font-mono text-[10px] text-muted-foreground tabular-nums">
							{String(i + 1).padStart(2, "0")}
						</span>
						<div>
							<p className="font-medium text-sm">{s.name}</p>
							{s.description && (
								<p className="mt-0.5 text-muted-foreground text-xs leading-relaxed">
									{s.description}
								</p>
							)}
						</div>
						{s.expectedDays != null && (
							<span className="font-mono text-[10px] text-muted-foreground tabular-nums">
								{s.expectedDays}d
							</span>
						)}
					</li>
				))}
			</ol>
			<p className="mt-3 text-[10px] text-muted-foreground leading-relaxed">
				{t("processFootnote")}
			</p>
		</section>
	);
}
