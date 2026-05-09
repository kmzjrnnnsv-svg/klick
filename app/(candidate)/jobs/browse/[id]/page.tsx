import { eq } from "drizzle-orm";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { getAssessmentForJob, getMyResponse } from "@/app/actions/assessments";
import {
	listMyQuestionsForJob,
	listPublicQuestionsForJob,
} from "@/app/actions/job-questions";
import { auth } from "@/auth";
import { ApplyButton } from "@/components/applications/apply-button";
import { AssessmentTaker } from "@/components/assessments/assessment-taker";
import { Footer } from "@/components/footer";
import { Header } from "@/components/header";
import { JobQuestionThread } from "@/components/jobs/job-question-thread";
import { db } from "@/db";
import { employers, jobMandates, jobs } from "@/db/schema";

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

	// Mandate (only "named" or "anonymous" leak to public). "private" stays
	// internal to the agency.
	const [mandateRow] = await db
		.select()
		.from(jobMandates)
		.where(eq(jobMandates.jobId, id))
		.limit(1);
	const mandate =
		mandateRow && mandateRow.clientVisibility !== "private" ? mandateRow : null;

	const publicQA = await listPublicQuestionsForJob(id);
	let myQA: Awaited<ReturnType<typeof listMyQuestionsForJob>> = [];
	try {
		myQA = await listMyQuestionsForJob(id);
	} catch {
		myQA = [];
	}

	const assessmentBundle = await getAssessmentForJob(id);
	let myResponse: Awaited<ReturnType<typeof getMyResponse>> = null;
	if (assessmentBundle) {
		try {
			myResponse = await getMyResponse(id);
		} catch {
			myResponse = null;
		}
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
					{mandate && (
						<p className="mt-2 text-muted-foreground text-xs">
							{mandate.clientVisibility === "named"
								? t("mandateNamed", { client: mandate.clientName })
								: t("mandateAnonymous", {
										industry:
											mandate.clientIndustry ?? t("mandateGenericIndustry"),
									})}
						</p>
					)}
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

				<section className="mb-10 flex flex-wrap items-center gap-3">
					<ApplyButton jobId={id} />
					{row.employerId && (
						<Link
							href={`/c/${row.employerId}`}
							className="lv-eyebrow rounded-sm border border-foreground/30 px-4 py-2 text-[0.6rem] text-foreground transition-colors hover:bg-foreground hover:text-background"
						>
							{t("viewCompany")}
						</Link>
					)}
				</section>

				{assessmentBundle && (
					<section className="mb-10 rounded-sm border border-primary/30 bg-primary/5 p-4 sm:p-6">
						<p className="lv-eyebrow text-[0.6rem] text-primary">
							{t("assessmentEyebrow")}
						</p>
						<h2 className="mt-2 font-serif-display text-xl sm:text-2xl">
							{assessmentBundle.assessment.title}
						</h2>
						{assessmentBundle.assessment.description && (
							<p className="mt-2 text-muted-foreground text-xs leading-relaxed">
								{assessmentBundle.assessment.description}
							</p>
						)}
						<p className="mt-3 mb-4 text-muted-foreground text-xs">
							{t("assessmentHint", {
								count: assessmentBundle.questions.length,
							})}
						</p>
						<AssessmentTaker
							jobId={id}
							questions={assessmentBundle.questions}
							alreadySubmitted={
								myResponse?.status === "submitted" ||
								myResponse?.status === "graded"
							}
							gradedScore={myResponse?.totalScore ?? null}
							gradedMax={myResponse?.maxScore ?? null}
							responseId={myResponse?.id ?? null}
						/>
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
					<JobQuestionThread
						jobId={id}
						initial={myQA
							.slice()
							.reverse()
							.map((q) => ({
								id: q.id,
								body: q.body,
								answer: q.answer,
								createdAt: q.createdAt,
								answeredAt: q.answeredAt,
							}))}
					/>
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
