import {
	AlertTriangle,
	Award,
	Briefcase,
	CheckCircle2,
	Clock,
	GraduationCap,
	Sparkles,
	TrendingUp,
} from "lucide-react";
import { useTranslations } from "next-intl";
import type { CandidateInsights } from "@/lib/insights/types";
import { cn } from "@/lib/utils";

function monthsToYears(m: number): string {
	const y = m / 12;
	if (y < 1) return `${Math.round(m)} Monate`;
	if (y < 2) return `${m >= 12 ? "1 Jahr" : `${Math.round(m)} Monate`}`;
	return `${Math.round(y)} Jahre`;
}

export function CandidateInsightsView({
	insights,
	emptyHint,
}: {
	insights: CandidateInsights | null;
	emptyHint?: string;
}) {
	const t = useTranslations("Insights");
	if (!insights) {
		return (
			<div className="rounded-lg border border-border border-dashed p-6 text-center text-muted-foreground text-sm">
				{emptyHint ?? t("empty")}
			</div>
		);
	}

	const { experience, tenure, certificates, narrative } = insights;
	const yearText = (n: number) =>
		n === 0 ? t("less.year") : n === 1 ? t("one.year") : t("many.years", { n });

	const conflictTone =
		experience.conflict.severity === "major"
			? "border-rose-500/40 bg-rose-500/5"
			: experience.conflict.severity === "minor"
				? "border-amber-500/40 bg-amber-500/5"
				: "";

	return (
		<div className="space-y-6">
			{narrative && (
				<section className="rounded-lg border border-primary/30 bg-primary/5 p-5">
					<div className="mb-2 flex items-center gap-2 text-primary text-xs uppercase tracking-wide">
						<Sparkles className="h-3.5 w-3.5" strokeWidth={1.5} />
						{t("narrativeTitle")}
					</div>
					<p className="text-sm leading-relaxed">{narrative.summary}</p>
					{narrative.workStyle.length > 0 && (
						<div className="mt-3 flex flex-wrap gap-1.5">
							{narrative.workStyle.map((tag) => (
								<span
									key={tag}
									className="rounded-full border border-primary/40 bg-primary/10 px-2.5 py-0.5 text-primary text-xs"
								>
									{tag}
								</span>
							))}
						</div>
					)}
					{narrative.strengths.length > 0 && (
						<ul className="mt-4 space-y-1.5 text-muted-foreground text-xs">
							{narrative.strengths.map((s) => (
								<li key={s} className="flex items-start gap-1.5">
									<TrendingUp
										className="mt-0.5 h-3 w-3 shrink-0 text-primary"
										strokeWidth={1.5}
									/>
									<span>{s}</span>
								</li>
							))}
						</ul>
					)}
				</section>
			)}

			<section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
				<Stat
					icon={Briefcase}
					label={t("yearsActive")}
					value={yearText(experience.yearsActive)}
					hint={t("yearsActiveHint")}
				/>
				<Stat
					icon={Clock}
					label={t("yearsContinuous")}
					value={yearText(experience.yearsContinuous)}
					hint={t("yearsContinuousHint")}
				/>
				<Stat
					icon={GraduationCap}
					label={t("totalRoles")}
					value={String(tenure.totalRoles)}
					hint={t("totalRolesHint")}
				/>
			</section>

			{experience.conflict.severity !== "none" && (
				<section
					className={cn(
						"flex items-start gap-3 rounded-lg border p-4",
						conflictTone,
					)}
				>
					<AlertTriangle
						className={cn(
							"mt-0.5 h-4 w-4 shrink-0",
							experience.conflict.severity === "major"
								? "text-rose-600 dark:text-rose-300"
								: "text-amber-600 dark:text-amber-300",
						)}
						strokeWidth={1.5}
					/>
					<div>
						<p className="font-medium text-sm">{t("conflictTitle")}</p>
						<p className="mt-1 text-muted-foreground text-xs leading-relaxed">
							{t("conflictBody", {
								declared: experience.conflict.declared,
								computed: experience.conflict.computed,
							})}
						</p>
					</div>
				</section>
			)}

			{(tenure.currentRole || tenure.firstJob) && (
				<section className="space-y-2">
					{tenure.currentRole && (
						<KvRow
							label={t("currentRole")}
							value={`${tenure.currentRole.role} · ${tenure.currentRole.company}`}
							hint={t("currentRoleSince", {
								duration: monthsToYears(tenure.currentRole.monthsOngoing),
								since: tenure.currentRole.sinceYearMonth,
							})}
						/>
					)}
					{tenure.firstJob && (
						<KvRow
							label={t("firstJob")}
							value={`${tenure.firstJob.role} · ${tenure.firstJob.company}`}
							hint={t("firstJobSince", {
								year: tenure.firstJob.startYearMonth.slice(0, 4),
							})}
						/>
					)}
					{tenure.totalRoles > 0 && (
						<KvRow
							label={t("avgTenure")}
							value={monthsToYears(tenure.averageMonths)}
							hint={t("tenureRange", {
								min: monthsToYears(tenure.shortestMonths),
								max: monthsToYears(tenure.longestMonths),
							})}
						/>
					)}
					{tenure.gaps.length > 0 && (
						<KvRow
							label={t("gaps")}
							value={t("gapsValue", { n: tenure.gaps.length })}
							hint={tenure.gaps
								.map(
									(g) =>
										`${g.fromYearMonth} → ${g.toYearMonth} (${monthsToYears(g.months)})`,
								)
								.join(" · ")}
						/>
					)}
				</section>
			)}

			<section className="rounded-lg border border-border bg-background p-4">
				<div className="mb-3 flex items-center gap-2 font-medium text-sm">
					<Award className="h-4 w-4" strokeWidth={1.5} />
					{t("certs.title")}
				</div>
				{certificates.total === 0 ? (
					<p className="text-muted-foreground text-xs">{t("certs.empty")}</p>
				) : (
					<div className="space-y-2 text-sm">
						<KvRow
							label={t("certs.count")}
							value={`${certificates.total}`}
							hint={t(`certs.pattern.${certificates.pattern}`)}
						/>
						<KvRow
							label={t("certs.validity")}
							value={
								<span className="flex items-center gap-2">
									<span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
										<CheckCircle2 className="h-3.5 w-3.5" strokeWidth={1.5} />
										{certificates.valid}
									</span>
									{certificates.expired > 0 && (
										<span className="text-muted-foreground">
											· {certificates.expired} {t("certs.expired")}
										</span>
									)}
								</span>
							}
						/>
						{Object.keys(certificates.perYear).length > 0 && (
							<KvRow
								label={t("certs.perYear")}
								value={
									<span className="font-mono text-xs">
										{Object.entries(certificates.perYear)
											.sort(([a], [b]) => b.localeCompare(a))
											.map(([y, n]) => `${y}: ${n}`)
											.join(" · ")}
									</span>
								}
							/>
						)}
						{certificates.issuers.length > 0 && (
							<KvRow
								label={t("certs.issuers")}
								value={certificates.issuers.join(" · ")}
							/>
						)}
					</div>
				)}
			</section>
		</div>
	);
}

function Stat({
	icon: Icon,
	label,
	value,
	hint,
}: {
	icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
	label: string;
	value: string;
	hint?: string;
}) {
	return (
		<div className="rounded-lg border border-border bg-background p-4">
			<div className="mb-1 flex items-center gap-1.5 text-muted-foreground text-xs">
				<Icon className="h-3.5 w-3.5" strokeWidth={1.5} />
				{label}
			</div>
			<div className="font-semibold text-lg">{value}</div>
			{hint && (
				<div className="mt-0.5 text-muted-foreground text-xs">{hint}</div>
			)}
		</div>
	);
}

function KvRow({
	label,
	value,
	hint,
}: {
	label: string;
	value: React.ReactNode;
	hint?: string;
}) {
	return (
		<div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-3">
			<span className="text-muted-foreground text-xs sm:w-32 sm:shrink-0">
				{label}
			</span>
			<span className="text-sm">{value}</span>
			{hint && <span className="text-muted-foreground text-xs">{hint}</span>}
		</div>
	);
}
