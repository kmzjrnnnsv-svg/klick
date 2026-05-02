import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { listResponsesForJob } from "@/app/actions/assessments";
import { getJob } from "@/app/actions/jobs";
import { auth } from "@/auth";
import { Footer } from "@/components/footer";
import { Header } from "@/components/header";

export default async function AssessmentResponsesPage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const session = await auth();
	if (!session?.user) redirect("/login");

	const { id } = await params;
	const job = await getJob(id);
	if (!job) notFound();

	const t = await getTranslations("Assessment");
	const fmt = await getFormatter();
	const items = await listResponsesForJob(id);

	return (
		<>
			<Header />
			<main className="mx-auto w-full max-w-3xl flex-1 px-3 pt-6 pb-20 sm:px-6 sm:pt-12">
				<header className="mb-6">
					<Link
						href={`/jobs/${id}/assessment`}
						className="lv-eyebrow text-[0.55rem] text-muted-foreground hover:text-foreground"
					>
						← {t("back")}
					</Link>
					<p className="mt-3 lv-eyebrow text-[0.6rem] text-primary">
						{t("responsesEyebrow")}
					</p>
					<h1 className="mt-2 font-serif-display text-3xl sm:text-4xl">
						{t("responsesTitle")}
					</h1>
					<p className="mt-2 text-muted-foreground text-sm">
						{t("responsesSubtitle", { count: items.length })}
					</p>
				</header>

				{items.length === 0 ? (
					<div className="rounded-sm border border-border border-dashed p-10 text-center sm:p-14">
						<p className="text-muted-foreground text-sm">
							{t("responsesEmpty")}
						</p>
					</div>
				) : (
					<ul className="divide-y divide-border border-border border-t border-b">
						{items.map((r) => (
							<li
								key={r.id}
								className="grid grid-cols-[1fr_auto] items-baseline gap-4 py-4"
							>
								<div>
									<p className="lv-eyebrow text-[0.55rem] text-muted-foreground">
										{t("anonymous", { id: r.candidateUserId.slice(0, 6) })}
									</p>
									<p className="mt-1 font-mono text-[10px] text-muted-foreground">
										{r.submittedAt
											? t("submittedAt", {
													date: fmt.dateTime(r.submittedAt, {
														dateStyle: "short",
														timeStyle: "short",
													}),
												})
											: t("inProgress")}
										{r.status === "graded" && r.gradedAt
											? ` · ${t("graded")}`
											: r.status === "submitted"
												? ` · ${t("grading")}`
												: ""}
									</p>
								</div>
								{r.totalScore !== null && r.maxScore !== null && (
									<span className="font-mono text-base">
										{r.totalScore}/{r.maxScore}
									</span>
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
