import { eq } from "drizzle-orm";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import {
	listMyQuestionsForJob,
	listPublicQuestionsForJob,
} from "@/app/actions/job-questions";
import { auth } from "@/auth";
import { Footer } from "@/components/footer";
import { Header } from "@/components/header";
import { JobQuestionForm } from "@/components/jobs/job-question-form";
import { db } from "@/db";
import { employers, jobs } from "@/db/schema";

export default async function JobDetailPage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const session = await auth();
	if (!session?.user) redirect("/login");

	const { id } = await params;
	const t = await getTranslations("JobDetail");
	const fmt = await getFormatter();

	const [row] = await db
		.select({
			job: jobs,
			employerId: employers.id,
			employerName: employers.companyName,
			isAgency: employers.isAgency,
		})
		.from(jobs)
		.leftJoin(employers, eq(employers.id, jobs.employerId))
		.where(eq(jobs.id, id))
		.limit(1);
	if (!row || row.job.status !== "published") notFound();
	const { job } = row;

	const publicQA = await listPublicQuestionsForJob(id);
	let myQA: Awaited<ReturnType<typeof listMyQuestionsForJob>> = [];
	try {
		myQA = await listMyQuestionsForJob(id);
	} catch {
		myQA = [];
	}

	return (
		<>
			<Header />
			<main className="mx-auto w-full max-w-3xl flex-1 px-3 pt-6 pb-20 sm:px-6 sm:pt-12">
				<Link
					href="/jobs/browse"
					className="lv-eyebrow text-[0.55rem] text-muted-foreground hover:text-foreground"
				>
					← {t("backToList")}
				</Link>

				<header className="mt-3 mb-8 border-border border-b pb-6">
					<p className="lv-eyebrow text-[0.6rem] text-primary">
						{row.isAgency
							? t("via", { name: row.employerName ?? "" })
							: row.employerName}
					</p>
					<h1 className="mt-3 font-serif-display text-3xl sm:text-5xl">
						{job.title}
					</h1>
					<div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-muted-foreground text-sm">
						{job.location && <span>{job.location}</span>}
						<span>{t(`remote.${job.remotePolicy}`)}</span>
						<span>{t(`employmentType.${job.employmentType}`)}</span>
						{(job.salaryMin || job.salaryMax) && (
							<span className="font-mono text-xs">
								{job.salaryMin
									? fmt.number(job.salaryMin, {
											style: "currency",
											currency: "EUR",
											maximumFractionDigits: 0,
										})
									: ""}
								{job.salaryMax
									? ` – ${fmt.number(job.salaryMax, {
											style: "currency",
											currency: "EUR",
											maximumFractionDigits: 0,
										})}`
									: ""}
							</span>
						)}
					</div>
				</header>

				<section className="mb-10">
					<p className="lv-eyebrow text-[0.55rem] text-muted-foreground">
						{t("description")}
					</p>
					<div className="mt-3 whitespace-pre-wrap text-foreground/90 text-sm leading-relaxed sm:text-base">
						{job.description}
					</div>
				</section>

				{job.requirements && job.requirements.length > 0 && (
					<section className="mb-10">
						<p className="lv-eyebrow text-[0.55rem] text-muted-foreground">
							{t("requirements")}
						</p>
						<ul className="mt-3 flex flex-wrap gap-2">
							{job.requirements.map((r) => (
								<li
									key={r.name}
									className={`rounded-sm px-2 py-1 font-mono text-xs ${
										r.weight === "must"
											? "bg-foreground text-background"
											: "border border-border bg-background"
									}`}
								>
									{r.name}
									{r.weight === "must" && (
										<span className="ml-1 opacity-60">{t("must")}</span>
									)}
								</li>
							))}
						</ul>
					</section>
				)}

				{row.employerId && (
					<section className="mb-10 flex flex-wrap gap-3">
						<Link
							href={`/c/${row.employerId}`}
							className="lv-eyebrow rounded-sm border border-foreground/30 px-4 py-2 text-[0.6rem] text-foreground transition-colors hover:bg-foreground hover:text-background"
						>
							{t("viewCompany")}
						</Link>
					</section>
				)}

				{/* Anonymous Q&A — ask the employer */}
				<section className="mb-10 rounded-sm border border-border bg-muted/30 p-4 sm:p-6">
					<p className="lv-eyebrow text-[0.6rem] text-primary">
						{t("askEyebrow")}
					</p>
					<h2 className="mt-2 font-serif-display text-xl sm:text-2xl">
						{t("askTitle")}
					</h2>
					<p className="mt-2 mb-4 text-muted-foreground text-xs leading-relaxed">
						{t("askHint")}
					</p>
					<JobQuestionForm jobId={id} />

					{myQA.length > 0 && (
						<div className="mt-6 space-y-3 border-border border-t pt-4">
							<p className="lv-eyebrow text-[0.55rem] text-muted-foreground">
								{t("yourQuestions")}
							</p>
							<ul className="space-y-2">
								{myQA.map((q) => (
									<li
										key={q.id}
										className="rounded-sm border border-border bg-background p-3 text-xs"
									>
										<p className="font-medium">{q.body}</p>
										{q.answer ? (
											<div className="mt-2 border-primary/40 border-l-2 pl-3">
												<p className="lv-eyebrow text-[0.5rem] text-primary">
													{t("employerAnswered")}
												</p>
												<p className="mt-1 text-foreground/90 leading-relaxed">
													{q.answer}
												</p>
											</div>
										) : (
											<p className="mt-2 text-muted-foreground italic">
												{t("waitingForAnswer")}
											</p>
										)}
									</li>
								))}
							</ul>
						</div>
					)}
				</section>

				{publicQA.length > 0 && (
					<section className="mb-10">
						<p className="lv-eyebrow text-[0.6rem] text-primary">
							{t("publicFaqEyebrow")}
						</p>
						<h2 className="mt-2 font-serif-display text-xl sm:text-2xl">
							{t("publicFaqTitle")}
						</h2>
						<dl className="mt-4 divide-y divide-border border-border border-t border-b">
							{publicQA.map((qa) => (
								<div
									key={`${qa.answeredAt.getTime()}-${qa.body.slice(0, 32)}`}
									className="grid gap-2 py-4 sm:grid-cols-[1fr_2fr] sm:gap-6"
								>
									<dt className="font-serif-display text-sm">{qa.body}</dt>
									<dd className="text-muted-foreground text-sm leading-relaxed">
										{qa.answer}
									</dd>
								</div>
							))}
						</dl>
					</section>
				)}
			</main>
			<Footer />
		</>
	);
}
