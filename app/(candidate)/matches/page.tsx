import { redirect } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { listMatchesForCandidate } from "@/app/actions/matches";
import { auth } from "@/auth";
import { Footer } from "@/components/footer";
import { Header } from "@/components/header";
import { cn } from "@/lib/utils";

export default async function MatchesPage() {
	const session = await auth();
	if (!session?.user) redirect("/login");

	const t = await getTranslations("Matches");
	const fmt = await getFormatter();
	const matches = await listMatchesForCandidate();

	return (
		<>
			<Header />
			<main className="mx-auto w-full max-w-3xl flex-1 px-4 pt-12 pb-24 sm:px-6 sm:pt-16">
				<header className="mb-8">
					<h1 className="font-semibold text-2xl tracking-tight sm:text-3xl">
						{t("title")}
					</h1>
					<p className="mt-2 text-muted-foreground text-sm leading-relaxed">
						{t("subtitle")}
					</p>
				</header>

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
