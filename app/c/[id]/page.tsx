import { eq } from "drizzle-orm";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { getEmployerStats } from "@/app/actions/company-stats";
import { aggregateOutcomesForEmployer } from "@/app/actions/outcomes";
import { auth } from "@/auth";
import { CompanyStatsPanel } from "@/components/company/company-stats-panel";
import { Footer } from "@/components/footer";
import { Header } from "@/components/header";
import { db } from "@/db";
import { employers, jobs } from "@/db/schema";

const MIN_REPORTS_FOR_TRUST_SIGNAL = 5;

export default async function CompanyPublicPage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const session = await auth();
	if (!session?.user) redirect("/login");

	const { id } = await params;
	const t = await getTranslations("Company");
	const fmt = await getFormatter();

	const [employer] = await db
		.select()
		.from(employers)
		.where(eq(employers.id, id))
		.limit(1);
	if (!employer) notFound();

	const openJobs = await db
		.select()
		.from(jobs)
		.where(eq(jobs.employerId, employer.id));
	const published = openJobs.filter((j) => j.status === "published");
	const outcomeStats = await aggregateOutcomesForEmployer(employer.id);
	const decided = outcomeStats.hired + outcomeStats.declined;
	const hireRate =
		decided >= MIN_REPORTS_FOR_TRUST_SIGNAL
			? Math.round((outcomeStats.hired / decided) * 100)
			: null;
	const stats = await getEmployerStats(employer.id);

	return (
		<>
			<Header />
			<main className="mx-auto w-full max-w-3xl flex-1 px-3 pt-6 pb-20 sm:px-6 sm:pt-12">
				<header className="mb-10 border-border border-b pb-8">
					<p className="lv-eyebrow text-[0.6rem] text-primary">
						{employer.isAgency ? t("agency") : t("employer")}
					</p>
					<h1 className="mt-3 font-serif-display text-4xl sm:text-6xl">
						{employer.companyName}
					</h1>
					{employer.website && (
						<a
							href={employer.website}
							target="_blank"
							rel="noopener noreferrer"
							className="mt-3 inline-block text-muted-foreground text-sm underline-offset-4 hover:text-foreground hover:underline"
						>
							{employer.website.replace(/^https?:\/\//, "")} ↗
						</a>
					)}
					<p className="mt-3 text-muted-foreground text-xs">
						{t("memberSince")}:{" "}
						{fmt.dateTime(employer.createdAt, { dateStyle: "long" })}
					</p>
					{hireRate !== null && (
						<div className="mt-5 inline-flex items-center gap-3 rounded-sm border border-emerald-500/30 bg-emerald-500/5 px-4 py-2">
							<span className="font-serif-display text-2xl text-emerald-700 dark:text-emerald-300">
								{hireRate}%
							</span>
							<div>
								<p className="lv-eyebrow text-[0.55rem] text-emerald-700 dark:text-emerald-300">
									{t("trustHireRate")}
								</p>
								<p className="text-[10px] text-muted-foreground">
									{t("trustBasis", { count: decided })}
								</p>
							</div>
						</div>
					)}
				</header>

				{employer.description && (
					<section className="mb-12">
						<p className="lv-eyebrow text-[0.55rem] text-muted-foreground">
							{t("about")}
						</p>
						<p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed sm:text-base">
							{employer.description}
						</p>
					</section>
				)}

				<CompanyStatsPanel stats={stats} />

				<section>
					<p className="lv-eyebrow text-[0.55rem] text-muted-foreground">
						{t("openRoles", { count: published.length })}
					</p>
					{published.length === 0 ? (
						<p className="mt-4 text-muted-foreground text-sm">
							{t("noOpenRoles")}
						</p>
					) : (
						<ul className="mt-4 divide-y divide-border border-border border-t border-b">
							{published.map((j) => (
								<li key={j.id}>
									<Link
										href={`/jobs/browse/${j.id}`}
										className="grid grid-cols-[1fr_auto] items-baseline gap-4 py-4 transition-colors hover:bg-muted/30"
									>
										<div>
											<div className="font-serif-display text-lg sm:text-xl">
												{j.title}
											</div>
											<div className="text-muted-foreground text-xs">
												{j.location ?? t("remote")}
												{j.remotePolicy
													? ` · ${t(`remote_${j.remotePolicy}`)}`
													: ""}
											</div>
										</div>
										{(j.salaryMin || j.salaryMax) && (
											<span className="font-mono text-[11px] text-muted-foreground">
												{j.salaryMin
													? fmt.number(j.salaryMin, {
															style: "currency",
															currency: "EUR",
															maximumFractionDigits: 0,
														})
													: ""}
												{j.salaryMax
													? ` – ${fmt.number(j.salaryMax, {
															style: "currency",
															currency: "EUR",
															maximumFractionDigits: 0,
														})}`
													: ""}
											</span>
										)}
									</Link>
								</li>
							))}
						</ul>
					)}
				</section>
			</main>
			<Footer />
		</>
	);
}
