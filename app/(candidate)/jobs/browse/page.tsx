import { redirect } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { browseJobs } from "@/app/actions/matches";
import { auth } from "@/auth";
import { Footer } from "@/components/footer";
import { Header } from "@/components/header";
import { JobBrowseFilters } from "@/components/jobs/job-browse-filters";
import { cn } from "@/lib/utils";

export default async function JobsBrowsePage({
	searchParams,
}: {
	searchParams: Promise<{
		q?: string;
		remote?: string;
		minSalary?: string;
	}>;
}) {
	const session = await auth();
	if (!session?.user) redirect("/login");

	const t = await getTranslations("Browse");
	const fmt = await getFormatter();
	const params = await searchParams;
	const remote =
		params.remote === "remote_only" || params.remote === "no_remote"
			? params.remote
			: "any";
	const minSalary = params.minSalary
		? Number.parseInt(params.minSalary, 10) || 0
		: 0;

	const jobs = await browseJobs({
		q: params.q,
		remote,
		minSalary: minSalary || undefined,
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

				<JobBrowseFilters />

				{jobs.length === 0 ? (
					<div className="rounded-lg border border-border border-dashed p-8 text-center text-muted-foreground text-sm sm:p-14">
						{t("empty")}
					</div>
				) : (
					<ul className="space-y-2.5">
						{jobs.map(
							({
								job,
								companyName,
								hardPass,
								softScore,
								matchedSkills,
								missingSkills,
								commute,
							}) => (
								<li
									key={job.id}
									className="rounded-lg border border-border bg-background p-3 sm:p-4"
								>
									<div className="flex items-start justify-between gap-3">
										<div className="min-w-0 flex-1">
											<div className="font-medium text-sm">{job.title}</div>
											<div className="mt-0.5 text-muted-foreground text-xs">
												{companyName}
												{job.location && ` · ${job.location}`} ·{" "}
												{t(`remote.${job.remotePolicy}`)}
											</div>
											{job.salaryMin && (
												<div className="mt-1 font-mono text-muted-foreground text-xs">
													{fmt.number(job.salaryMin, {
														style: "currency",
														currency: "EUR",
														maximumFractionDigits: 0,
													})}
													{job.salaryMax &&
														` – ${fmt.number(job.salaryMax, { style: "currency", currency: "EUR", maximumFractionDigits: 0 })}`}
												</div>
											)}
										</div>
										<span
											className={cn(
												"shrink-0 rounded-md px-2 py-0.5 font-mono text-[11px]",
												hardPass && softScore >= 70
													? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
													: hardPass
														? "bg-amber-500/10 text-amber-700 dark:text-amber-300"
														: "bg-zinc-500/10 text-muted-foreground",
											)}
											title={t("scoreHint")}
										>
											{hardPass ? `${softScore}/100` : t("notQualified")}
										</span>
									</div>
									{matchedSkills.length > 0 && (
										<div className="mt-2 flex flex-wrap gap-1">
											{matchedSkills.slice(0, 6).map((s) => (
												<span
													key={s}
													className="rounded-md bg-emerald-500/10 px-1.5 py-0.5 font-mono text-[11px] text-emerald-700 dark:text-emerald-300"
												>
													{s}
												</span>
											))}
											{missingSkills.slice(0, 3).map((s) => (
												<span
													key={`miss-${s}`}
													className="rounded-md bg-rose-500/10 px-1.5 py-0.5 font-mono text-[11px] text-rose-700 dark:text-rose-300"
												>
													{s}
												</span>
											))}
										</div>
									)}
									{commute && (
										<div className="mt-2 text-muted-foreground text-xs">
											{commute.km} km · ~{commute.minutes} min
											{commute.exceedsLimit && ` · ${t("commuteOverLimit")}`}
										</div>
									)}
								</li>
							),
						)}
					</ul>
				)}
			</main>
			<Footer />
		</>
	);
}
