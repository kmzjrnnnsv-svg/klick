import { redirect } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { listMatchesForCandidate } from "@/app/actions/matches";
import { auth } from "@/auth";
import { Footer } from "@/components/footer";
import { Header } from "@/components/header";
import { MatchFilters } from "@/components/matches/match-filters";
import { cn } from "@/lib/utils";

export default async function MatchesPage({
	searchParams,
}: {
	searchParams: Promise<{
		remote?: string;
		minSalary?: string;
		maxCommuteMinutes?: string;
		sort?: string;
	}>;
}) {
	const session = await auth();
	if (!session?.user) redirect("/login");

	const t = await getTranslations("Matches");
	const fmt = await getFormatter();
	const params = await searchParams;
	const remote =
		params.remote === "remote_only" || params.remote === "no_remote"
			? params.remote
			: "any";
	const minSalary = params.minSalary
		? Number.parseInt(params.minSalary, 10) || 0
		: 0;
	const maxCommuteMinutes = params.maxCommuteMinutes
		? Number.parseInt(params.maxCommuteMinutes, 10) || 0
		: 0;
	const sort: "score" | "commute" | "salary" =
		params.sort === "commute" || params.sort === "salary"
			? params.sort
			: "score";
	const matches = await listMatchesForCandidate({
		remote,
		minSalary: minSalary || undefined,
		maxCommuteMinutes: maxCommuteMinutes || undefined,
		sort,
	});

	return (
		<>
			<Header />
			<main className="mx-auto w-full max-w-3xl flex-1 px-3 pt-6 pb-20 sm:px-6 sm:pt-12">
				<header className="mb-4 sm:mb-6">
					<h1 className="font-semibold text-xl tracking-tight sm:text-3xl">
						{t("title")}
					</h1>
					<p className="mt-1.5 text-muted-foreground text-sm leading-snug">
						{t("subtitle")}
					</p>
				</header>

				<MatchFilters />

				{matches.length === 0 ? (
					<div className="rounded-lg border border-border border-dashed p-10 text-center sm:p-16">
						<p className="text-muted-foreground text-sm">{t("empty")}</p>
					</div>
				) : (
					<ul className="space-y-3">
						{matches.map(({ match, job, employer }) => (
							<li
								key={match.id}
								className="rounded-lg border border-border bg-background p-4 sm:p-5"
							>
								<div className="flex items-start justify-between gap-3">
									<div className="min-w-0 flex-1">
										<div className="font-medium text-sm">{job.title}</div>
										<div className="mt-0.5 text-muted-foreground text-xs">
											{employer.companyName}
											{job.location && ` · ${job.location}`} ·{" "}
											{t(`remoteOptions.${job.remotePolicy}`)}
										</div>
									</div>
									<div className="flex flex-col items-end">
										<span
											className={cn(
												"rounded-md px-2 py-0.5 font-mono text-[11px]",
												match.softScore >= 70
													? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
													: match.softScore >= 40
														? "bg-amber-500/10 text-amber-700 dark:text-amber-300"
														: "bg-zinc-500/10 text-muted-foreground",
											)}
										>
											{match.softScore}/100
										</span>
										<span className="mt-1 text-muted-foreground text-[11px]">
											{fmt.dateTime(match.computedAt, { dateStyle: "short" })}
										</span>
									</div>
								</div>
								{match.rationale && (
									<p className="mt-3 text-foreground/90 text-sm leading-relaxed">
										{match.rationale}
									</p>
								)}
								{match.matchedSkills && match.matchedSkills.length > 0 && (
									<div className="mt-3 flex flex-wrap gap-1.5">
										{match.matchedSkills.map((s) => (
											<span
												key={s}
												className="rounded-md bg-muted px-2 py-0.5 font-mono text-[11px]"
											>
												{s}
											</span>
										))}
										{match.adjacentSkills?.map((s) => (
											<span
												key={`adj-${s}`}
												title={t("adjacentTooltip")}
												className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 font-mono text-[11px] text-amber-700 dark:text-amber-300"
											>
												{s} ⤴
											</span>
										))}
									</div>
								)}
								{match.commute && (
									<div className="mt-2 text-muted-foreground text-xs">
										{t("commute", {
											km: match.commute.km,
											minutes: match.commute.minutes,
											mode: t(`mode.${match.commute.mode}`),
										})}
									</div>
								)}
								{job.salaryMin && (
									<div className="mt-2 text-muted-foreground text-xs">
										{t("salary")}:{" "}
										{fmt.number(job.salaryMin, {
											style: "currency",
											currency: "EUR",
											maximumFractionDigits: 0,
										})}
										{job.salaryMax &&
											` – ${fmt.number(job.salaryMax, { style: "currency", currency: "EUR", maximumFractionDigits: 0 })}`}
									</div>
								)}
							</li>
						))}
					</ul>
				)}
			</main>
			<Footer />
		</>
	);
}
