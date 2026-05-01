import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getJob } from "@/app/actions/jobs";
import { listMatchesForJob } from "@/app/actions/matches";
import { auth } from "@/auth";
import { Footer } from "@/components/footer";
import { Header } from "@/components/header";
import { JobForm } from "@/components/jobs/job-form";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default async function EditJobPage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const session = await auth();
	if (!session?.user?.id) redirect("/login");

	const { id } = await params;
	const job = await getJob(id);
	if (!job) notFound();

	const t = await getTranslations("Jobs");
	const tm = await getTranslations("Matches");
	const matchCount =
		job.status === "published" ? (await listMatchesForJob(id)).length : 0;

	return (
		<>
			<Header />
			<main className="mx-auto w-full max-w-3xl flex-1 px-4 pt-12 pb-24 sm:px-6 sm:pt-16">
				<header className="mb-8 flex items-end justify-between gap-4">
					<div>
						<Link
							href="/jobs"
							className="text-muted-foreground text-xs hover:text-foreground"
						>
							← {t("title")}
						</Link>
						<h1 className="mt-1 font-semibold text-2xl tracking-tight sm:text-3xl">
							{job.title || t("editJob")}
						</h1>
					</div>
					{job.status === "published" && (
						<Link
							href={`/jobs/${id}/candidates`}
							className={cn(buttonVariants({ size: "sm", variant: "outline" }))}
						>
							{tm("seeCandidates", { count: matchCount })}
						</Link>
					)}
				</header>
				{job.salaryBenchmarkLow != null && job.salaryBenchmarkHigh != null && (
					<div
						className={cn(
							"mb-6 rounded-lg border p-4",
							job.salaryFairness === "under"
								? "border-rose-500/30 bg-rose-500/5"
								: job.salaryFairness === "over"
									? "border-amber-500/30 bg-amber-500/5"
									: "border-emerald-500/30 bg-emerald-500/5",
						)}
					>
						<p className="font-medium text-sm">
							{t("benchmarkTitle")}{" "}
							<span className="font-mono text-xs">
								{job.salaryBenchmarkLow.toLocaleString("de-DE")} –{" "}
								{job.salaryBenchmarkHigh.toLocaleString("de-DE")} €
							</span>
						</p>
						{job.salaryFairness && job.salaryDeltaPct != null && (
							<p className="mt-1 text-muted-foreground text-xs leading-snug">
								{job.salaryFairness === "under" &&
									t("benchmarkUnder", { pct: Math.abs(job.salaryDeltaPct) })}
								{job.salaryFairness === "over" &&
									t("benchmarkOver", { pct: job.salaryDeltaPct })}
								{job.salaryFairness === "fair" && t("benchmarkFair")}
							</p>
						)}
					</div>
				)}
				<JobForm initial={job} />
			</main>
			<Footer />
		</>
	);
}
