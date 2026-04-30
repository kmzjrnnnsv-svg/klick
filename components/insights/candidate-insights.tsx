import {
	AlertTriangle,
	Award,
	BadgeCheck,
	Briefcase,
	CheckCircle2,
	Clock,
	GraduationCap,
	Sparkles,
	Target,
	TrendingUp,
} from "lucide-react";
import { useTranslations } from "next-intl";
import type { CandidateProfile } from "@/db/schema";
import { classifyIssuer } from "@/lib/insights/issuers";
import type { CandidateInsights } from "@/lib/insights/types";
import { cn } from "@/lib/utils";

// Subset of CandidateProfile we surface in the "extracted from CV" section.
// Passed in optionally so the component still works on screens that don't
// have the full profile loaded (e.g. employer match list).
export type ProfileExtras = Pick<
	CandidateProfile,
	| "industries"
	| "awards"
	| "certificationsMentioned"
	| "mobility"
	| "preferredRoleLevel"
>;

function monthsToYears(m: number): string {
	const y = m / 12;
	if (y < 1) return `${Math.round(m)} Monate`;
	if (y < 2) return `${m >= 12 ? "1 Jahr" : `${Math.round(m)} Monate`}`;
	return `${Math.round(y)} Jahre`;
}

export function CandidateInsightsView({
	insights,
	profileExtras,
	emptyHint,
}: {
	insights: CandidateInsights | null;
	profileExtras?: ProfileExtras | null;
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

	const { experience, tenure, tenureScore, certificates, narrative } = insights;
	const hasExtras =
		!!profileExtras &&
		((profileExtras.industries?.length ?? 0) > 0 ||
			(profileExtras.awards?.length ?? 0) > 0 ||
			(profileExtras.certificationsMentioned?.length ?? 0) > 0 ||
			!!profileExtras.mobility ||
			!!profileExtras.preferredRoleLevel);
	const yearText = (n: number) =>
		n === 0 ? t("less.year") : n === 1 ? t("one.year") : t("many.years", { n });

	const conflictTone =
		experience.conflict.severity === "major"
			? "border-rose-500/40 bg-rose-500/5"
			: experience.conflict.severity === "minor"
				? "border-amber-500/40 bg-amber-500/5"
				: "";

	return (
		<div className="space-y-4">
			{narrative && (
				<section className="rounded-lg border border-primary/30 bg-primary/5 p-3.5 sm:p-4">
					<div className="mb-1.5 flex items-center gap-2 text-primary text-xs uppercase tracking-wide">
						<Sparkles className="h-3.5 w-3.5" strokeWidth={1.5} />
						{t("narrativeTitle")}
					</div>
					<p className="text-sm leading-snug">{narrative.summary}</p>
					{narrative.workStyle.length > 0 && (
						<div className="mt-2.5 flex flex-wrap gap-1">
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
						<ul className="mt-3 space-y-1 text-muted-foreground text-xs">
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

			<section className="grid grid-cols-3 gap-2 sm:gap-3">
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

			{tenure.totalRoles > 0 && (
				<section className="rounded-lg border border-border bg-background p-3 sm:p-4">
					<div className="mb-1.5 flex items-center justify-between gap-2">
						<div className="flex items-center gap-2 font-medium text-sm">
							<Target className="h-4 w-4" strokeWidth={1.5} />
							{t("tenureScore.title")}
						</div>
						<span
							className={cn(
								"rounded-md px-2 py-0.5 font-mono text-[11px]",
								tenureScore.band === "strong"
									? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
									: tenureScore.band === "good"
										? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-300"
										: tenureScore.band === "ok"
											? "bg-amber-500/10 text-amber-700 dark:text-amber-300"
											: "bg-rose-500/10 text-rose-700 dark:text-rose-300",
							)}
						>
							{tenureScore.value}/100 ·{" "}
							{t(`tenureScore.band.${tenureScore.band}`)}
						</span>
					</div>
					<p className="text-muted-foreground text-xs">
						{tenureScore.rationale}
					</p>
				</section>
			)}

			{(() => {
				const m = tenure.mix;
				const totalMixMonths =
					m.employedMonths +
					m.founderMonths +
					m.selfEmployedMonths +
					m.freelanceMonths +
					m.internshipMonths +
					m.otherMonths;
				if (totalMixMonths < 6) return null;
				const segments = (
					[
						{
							key: "employedMonths",
							value: m.employedMonths,
							labelKey: "Insights.mix.employee",
							color: "bg-primary",
						},
						{
							key: "founderMonths",
							value: m.founderMonths,
							labelKey: "Insights.mix.founder",
							color: "bg-fuchsia-500",
						},
						{
							key: "selfEmployedMonths",
							value: m.selfEmployedMonths,
							labelKey: "Insights.mix.self_employed",
							color: "bg-emerald-500",
						},
						{
							key: "freelanceMonths",
							value: m.freelanceMonths,
							labelKey: "Insights.mix.freelance",
							color: "bg-amber-500",
						},
						{
							key: "internshipMonths",
							value: m.internshipMonths,
							labelKey: "Insights.mix.internship",
							color: "bg-zinc-500",
						},
						{
							key: "otherMonths",
							value: m.otherMonths,
							labelKey: "Insights.mix.other",
							color: "bg-zinc-400",
						},
					] as const
				).filter((s) => s.value > 0);
				return (
					<section className="rounded-lg border border-border bg-background p-3 sm:p-4">
						<div className="mb-2 font-medium text-sm">{t("mix.title")}</div>
						<div className="flex h-2 w-full overflow-hidden rounded-full bg-muted">
							{segments.map((s) => (
								<div
									key={s.key}
									className={s.color}
									style={{
										width: `${(s.value / totalMixMonths) * 100}%`,
									}}
								/>
							))}
						</div>
						<ul className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs sm:grid-cols-3">
							{segments.map((s) => (
								<li key={s.key} className="flex items-center gap-1.5">
									<span
										className={cn("h-2 w-2 shrink-0 rounded-full", s.color)}
									/>
									<span className="text-muted-foreground">
										{t(s.labelKey.replace("Insights.", ""))}:
									</span>
									<span className="font-medium">{monthsToYears(s.value)}</span>
								</li>
							))}
						</ul>
					</section>
				);
			})()}

			{(() => {
				const f = tenure.focus;
				const totalFocusMonths = f.focusedMonths + f.detourMonths;
				if (totalFocusMonths < 6 || f.focusedRoles + f.detourRoles < 2)
					return null;
				const focusedPct = Math.round(
					(f.focusedMonths / totalFocusMonths) * 100,
				);
				return (
					<section className="rounded-lg border border-border bg-background p-3 sm:p-4">
						<div className="mb-1.5 flex items-center justify-between gap-2">
							<div className="font-medium text-sm">{t("focus.title")}</div>
							<span
								className={cn(
									"rounded-md px-2 py-0.5 font-mono text-[11px]",
									focusedPct >= 75
										? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
										: focusedPct >= 50
											? "bg-amber-500/10 text-amber-700 dark:text-amber-300"
											: "bg-zinc-500/10 text-muted-foreground",
								)}
							>
								{focusedPct}% {t("focus.onTrack")}
							</span>
						</div>
						<p className="text-muted-foreground text-xs">
							{t("focus.body", {
								focused: f.focusedRoles,
								detour: f.detourRoles,
							})}
						</p>
						{f.detours.length > 0 && (
							<details className="mt-2 text-xs">
								<summary className="cursor-pointer text-muted-foreground">
									{t("focus.showDetours", { n: f.detours.length })}
								</summary>
								<ul className="mt-2 space-y-1">
									{f.detours.map((d) => (
										<li
											key={`${d.company}:${d.role}`}
											className="flex items-baseline justify-between gap-2"
										>
											<span className="truncate">
												{d.role}
												<span className="text-muted-foreground">
													{" "}
													· {d.company}
												</span>
											</span>
											<span className="shrink-0 font-mono text-muted-foreground">
												{monthsToYears(d.months)}
											</span>
										</li>
									))}
								</ul>
							</details>
						)}
					</section>
				);
			})()}

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

			<section className="rounded-lg border border-border bg-background p-3 sm:p-4">
				<div className="mb-2 flex items-center gap-2 font-medium text-sm">
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
								value={
									<span className="flex flex-wrap items-center gap-1.5">
										{certificates.issuers.map((iss) => {
											const cls = classifyIssuer(iss);
											return (
												<span
													key={iss}
													className={cn(
														"inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs",
														cls.verified
															? "border border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300"
															: "bg-muted text-muted-foreground",
													)}
													title={
														cls.verified
															? t(`certs.cat.${cls.category}`)
															: undefined
													}
												>
													{cls.verified && (
														<BadgeCheck
															className="h-3 w-3 shrink-0"
															strokeWidth={1.5}
														/>
													)}
													{iss}
												</span>
											);
										})}
									</span>
								}
								hint={t("certs.issuerLegitimacy", {
									verified: certificates.verifiedIssuers,
									unknown: certificates.unknownIssuers,
								})}
							/>
						)}
						{certificates.total > 0 && (
							<KvRow
								label={t("certs.alignment")}
								value={
									<span
										className={cn(
											"font-mono",
											certificates.careerAlignmentPct >= 70
												? "text-emerald-600 dark:text-emerald-300"
												: certificates.careerAlignmentPct >= 40
													? "text-amber-600 dark:text-amber-300"
													: "text-muted-foreground",
										)}
									>
										{certificates.careerAlignmentPct}%
									</span>
								}
								hint={t("certs.alignmentHint")}
							/>
						)}
					</div>
				)}
			</section>

			{hasExtras && profileExtras && (
				<section className="rounded-lg border border-border bg-background p-3 sm:p-4">
					<div className="mb-2 font-medium text-sm">{t("extras.title")}</div>
					<div className="space-y-2">
						{profileExtras.preferredRoleLevel && (
							<KvRow
								label={t("extras.level")}
								value={t(`extras.levels.${profileExtras.preferredRoleLevel}`)}
							/>
						)}
						{profileExtras.mobility && (
							<KvRow
								label={t("extras.mobility")}
								value={profileExtras.mobility}
							/>
						)}
						{profileExtras.industries &&
							profileExtras.industries.length > 0 && (
								<KvRow
									label={t("extras.industries")}
									value={
										<span className="flex flex-wrap gap-1.5">
											{profileExtras.industries.map((i) => (
												<span
													key={i}
													className="rounded-md bg-muted px-2 py-0.5 text-xs"
												>
													{i}
												</span>
											))}
										</span>
									}
								/>
							)}
						{profileExtras.awards && profileExtras.awards.length > 0 && (
							<KvRow
								label={t("extras.awards")}
								value={
									<ul className="list-disc space-y-0.5 pl-4 text-xs">
										{profileExtras.awards.map((a) => (
											<li key={a}>{a}</li>
										))}
									</ul>
								}
							/>
						)}
						{profileExtras.certificationsMentioned &&
							profileExtras.certificationsMentioned.length > 0 && (
								<KvRow
									label={t("extras.certificationsMentioned")}
									value={
										<ul className="space-y-0.5 text-xs">
											{profileExtras.certificationsMentioned.map((c) => (
												<li key={`${c.name}:${c.issuer ?? ""}:${c.year ?? ""}`}>
													{c.name}
													{c.issuer && (
														<span className="text-muted-foreground">
															{" "}
															— {c.issuer}
														</span>
													)}
													{c.year && (
														<span className="text-muted-foreground">
															{" "}
															({c.year})
														</span>
													)}
												</li>
											))}
										</ul>
									}
									hint={t("extras.certificationsMentionedHint")}
								/>
							)}
					</div>
				</section>
			)}
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
		<div className="rounded-lg border border-border bg-background p-2.5 sm:p-3">
			<div className="flex items-center gap-1.5 text-muted-foreground text-[11px] leading-tight sm:text-xs">
				<Icon className="h-3 w-3 shrink-0" strokeWidth={1.5} />
				<span className="truncate">{label}</span>
			</div>
			<div className="mt-1 font-semibold text-base sm:text-lg">{value}</div>
			{hint && (
				<div className="mt-0.5 hidden text-muted-foreground text-xs sm:block">
					{hint}
				</div>
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
		<div className="grid grid-cols-[7rem_1fr] items-baseline gap-x-3 gap-y-0 sm:grid-cols-[8rem_1fr]">
			<span className="text-muted-foreground text-xs">{label}</span>
			<span className="text-sm">{value}</span>
			{hint && (
				<span className="col-start-2 text-muted-foreground text-xs">
					{hint}
				</span>
			)}
		</div>
	);
}
