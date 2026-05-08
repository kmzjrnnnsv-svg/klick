import { useTranslations } from "next-intl";
import type {
	ApplicationJobSnapshot,
	ApplicationMatchSnapshot,
	ApplicationProfileSnapshot,
} from "@/db/schema";

export function SnapshotCompare({
	jobSnap,
	profileSnap,
	matchSnap,
	currentSkills,
}: {
	jobSnap: ApplicationJobSnapshot;
	profileSnap: ApplicationProfileSnapshot;
	matchSnap: ApplicationMatchSnapshot | null;
	// If provided (candidate's view), shows skills the candidate gained
	// SINCE applying — useful when re-applying.
	currentSkills?: { name: string; level?: number }[];
}) {
	const t = useTranslations("Applications");

	const reqSkills = (jobSnap.requirements ?? []).map((r) => ({
		name: r.name,
		weight: r.weight,
		minLevel: r.minLevel,
	}));
	const snapSkillNames = new Set(
		(profileSnap.skills ?? []).map((s) => s.name.toLowerCase()),
	);
	const currentSkillNames = new Set(
		(currentSkills ?? []).map((s) => s.name.toLowerCase()),
	);
	const newSinceSnap = (currentSkills ?? []).filter(
		(s) => !snapSkillNames.has(s.name.toLowerCase()),
	);

	return (
		<div className="space-y-6">
			<div className="grid gap-4 sm:grid-cols-2">
				{/* Was die Stelle wollte */}
				<div className="rounded-sm border border-border bg-background p-4">
					<p className="lv-eyebrow text-[0.55rem] text-primary">
						{t("compareJob")}
					</p>
					<h4 className="mt-2 font-serif-display text-base">{jobSnap.title}</h4>
					<dl className="mt-3 space-y-2 text-xs">
						{jobSnap.yearsExperienceMin !== null &&
							jobSnap.yearsExperienceMin !== undefined &&
							jobSnap.yearsExperienceMin > 0 && (
								<div className="flex justify-between">
									<dt className="text-muted-foreground">
										{t("yearsRequired")}
									</dt>
									<dd>≥ {jobSnap.yearsExperienceMin}</dd>
								</div>
							)}
						{(jobSnap.salaryMin || jobSnap.salaryMax) && (
							<div className="flex justify-between">
								<dt className="text-muted-foreground">{t("salaryRange")}</dt>
								<dd className="font-mono">
									{jobSnap.salaryMin
										? `${jobSnap.salaryMin.toLocaleString()} €`
										: ""}
									{jobSnap.salaryMax
										? ` – ${jobSnap.salaryMax.toLocaleString()} €`
										: ""}
								</dd>
							</div>
						)}
					</dl>
					<p className="mt-3 lv-eyebrow text-[0.5rem] text-muted-foreground">
						{t("requiredSkills")}
					</p>
					<ul className="mt-2 flex flex-wrap gap-1.5">
						{reqSkills.map((r) => {
							const haveSnap = snapSkillNames.has(r.name.toLowerCase());
							const haveCurrent = currentSkillNames.has(r.name.toLowerCase());
							const tone =
								r.weight === "must"
									? haveSnap
										? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
										: haveCurrent
											? "bg-amber-500/10 text-amber-700 dark:text-amber-300"
											: "bg-rose-500/10 text-rose-700 dark:text-rose-300"
									: "border border-border bg-background text-foreground";
							const suffix = haveSnap
								? "✓"
								: haveCurrent
									? "★"
									: r.weight === "must"
										? "✗"
										: "";
							return (
								<li
									key={r.name}
									className={`rounded-sm px-2 py-0.5 font-mono text-[11px] ${tone}`}
								>
									{r.name}
									{r.weight === "must" && (
										<span className="ml-1 opacity-60">{t("must")}</span>
									)}
									{suffix && <span className="ml-1">{suffix}</span>}
								</li>
							);
						})}
					</ul>
					<p className="mt-3 text-[10px] text-muted-foreground leading-relaxed">
						{t("compareLegend")}
					</p>
				</div>

				{/* Was du damals mitgebracht hast */}
				<div className="rounded-sm border border-border bg-background p-4">
					<p className="lv-eyebrow text-[0.55rem] text-primary">
						{t("compareProfile")}
					</p>
					<h4 className="mt-2 font-serif-display text-base">
						{profileSnap.headline ?? t("noHeadline")}
					</h4>
					<dl className="mt-3 space-y-2 text-xs">
						{profileSnap.yearsExperience !== null &&
							profileSnap.yearsExperience !== undefined && (
								<div className="flex justify-between">
									<dt className="text-muted-foreground">{t("yearsHave")}</dt>
									<dd>{profileSnap.yearsExperience}</dd>
								</div>
							)}
						{profileSnap.salaryDesired !== null &&
							profileSnap.salaryDesired !== undefined &&
							profileSnap.salaryDesired > 0 && (
								<div className="flex justify-between">
									<dt className="text-muted-foreground">
										{t("salaryDesired")}
									</dt>
									<dd className="font-mono">
										{profileSnap.salaryDesired.toLocaleString()} €
									</dd>
								</div>
							)}
					</dl>
					<p className="mt-3 lv-eyebrow text-[0.5rem] text-muted-foreground">
						{t("yourSkillsAtTime")}
					</p>
					<ul className="mt-2 flex flex-wrap gap-1.5">
						{(profileSnap.skills ?? []).map((s) => (
							<li
								key={s.name}
								className="rounded-sm bg-muted px-2 py-0.5 font-mono text-[11px]"
							>
								{s.name}
								{s.level ? ` · ${s.level}` : ""}
							</li>
						))}
					</ul>
				</div>
			</div>

			{/* Match-Score-Snapshot */}
			{matchSnap && (
				<div className="rounded-sm border border-border bg-muted/30 p-4">
					<p className="lv-eyebrow text-[0.55rem] text-primary">
						{t("scoreAtTime")}
					</p>
					<div className="mt-2 flex items-baseline gap-3">
						<span className="font-serif-display text-2xl">
							{matchSnap.softScore}/100
						</span>
						<span className="text-muted-foreground text-xs">
							{t("hardPass", {
								status: matchSnap.hardScore > 0 ? t("pass") : t("notQualified"),
							})}
						</span>
					</div>
					{matchSnap.rationale && (
						<p className="mt-2 text-xs leading-relaxed">
							{matchSnap.rationale}
						</p>
					)}
				</div>
			)}

			{/* Was du seit der Bewerbung dazu gelernt hast */}
			{currentSkills && newSinceSnap.length > 0 && (
				<div className="rounded-sm border border-emerald-500/30 bg-emerald-500/5 p-4">
					<p className="lv-eyebrow text-[0.55rem] text-emerald-700 dark:text-emerald-300">
						{t("newSinceTitle")}
					</p>
					<p className="mt-2 text-foreground/80 text-xs leading-relaxed">
						{t("newSinceHint")}
					</p>
					<ul className="mt-3 flex flex-wrap gap-1.5">
						{newSinceSnap.map((s) => (
							<li
								key={s.name}
								className="rounded-sm bg-emerald-500/15 px-2 py-0.5 font-mono text-[11px] text-emerald-700 dark:text-emerald-300"
							>
								★ {s.name}
								{s.level ? ` · ${s.level}` : ""}
							</li>
						))}
					</ul>
				</div>
			)}
		</div>
	);
}
