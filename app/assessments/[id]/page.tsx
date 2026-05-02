import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { getResponseDetail } from "@/app/actions/assessments";
import { auth } from "@/auth";
import { Footer } from "@/components/footer";
import { Header } from "@/components/header";

export default async function AssessmentResponseDetailPage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const session = await auth();
	if (!session?.user) redirect("/login");

	const { id } = await params;
	const detail = await getResponseDetail(id);
	if (!detail) notFound();
	const { response, questions, assessment, isOwn } = detail;
	const t = await getTranslations("AssessmentDetail");
	const fmt = await getFormatter();

	const byId = new Map(questions.map((q) => [q.id, q]));

	return (
		<>
			<Header />
			<main className="mx-auto w-full max-w-3xl flex-1 px-3 pt-6 pb-20 sm:px-6 sm:pt-12">
				<header className="mb-6">
					<Link
						href={
							isOwn
								? `/jobs/browse/${response.jobId}`
								: `/jobs/${response.jobId}/assessment/responses`
						}
						className="lv-eyebrow text-[0.55rem] text-muted-foreground hover:text-foreground"
					>
						← {t("back")}
					</Link>
					<p className="mt-3 lv-eyebrow text-[0.6rem] text-primary">
						{isOwn ? t("yourScore") : t("candidateScore")}
					</p>
					<h1 className="mt-2 font-serif-display text-3xl sm:text-4xl">
						{assessment?.title ?? t("title")}
					</h1>
					<div className="mt-3 flex items-center gap-3">
						<div className="font-serif-display text-3xl">
							{response.totalScore ?? "—"}/{response.maxScore ?? "—"}
						</div>
						<span className="lv-eyebrow rounded-sm bg-muted px-2 py-1 text-[0.5rem] text-muted-foreground">
							{t(`status.${response.status}`)}
						</span>
						{response.gradedAt && (
							<span className="font-mono text-[10px] text-muted-foreground">
								{t("gradedAt", {
									date: fmt.dateTime(response.gradedAt, {
										dateStyle: "short",
										timeStyle: "short",
									}),
								})}
							</span>
						)}
					</div>
				</header>

				<ol className="space-y-4">
					{response.answers.map((a, idx) => {
						const q = byId.get(a.questionId);
						if (!q) return null;
						const ratio =
							a.pointsEarned !== undefined && q.maxPoints > 0
								? a.pointsEarned / q.maxPoints
								: 0;
						const tone =
							ratio >= 0.7
								? "border-emerald-500/30 bg-emerald-500/5"
								: ratio >= 0.4
									? "border-amber-500/30 bg-amber-500/5"
									: "border-rose-500/30 bg-rose-500/5";
						return (
							<li
								key={a.questionId}
								className={`rounded-sm border ${tone} p-4 sm:p-5`}
							>
								<div className="flex items-start justify-between gap-3">
									<p className="lv-eyebrow text-[0.55rem] text-muted-foreground">
										{`${t("question")} ${idx + 1} · ${
											q.kind === "mc" ? t("multipleChoice") : t("openQuestion")
										}`}
									</p>
									<span className="font-mono text-sm">
										{a.pointsEarned ?? 0}/{q.maxPoints}
									</span>
								</div>
								<p className="mt-2 font-medium text-sm">{q.body}</p>

								{q.kind === "mc" && q.choices && (
									<ul className="mt-3 space-y-1.5 text-xs">
										{q.choices.map((c, ci) => {
											const chosen = a.choiceIndex === ci;
											const correct = q.correctChoice === ci;
											return (
												<li
													// biome-ignore lint/suspicious/noArrayIndexKey: positional choice
													key={`${q.id}-${ci}`}
													className={`rounded-sm px-2 py-1.5 ${
														correct
															? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
															: chosen
																? "bg-rose-500/10 text-rose-700 dark:text-rose-300"
																: "text-muted-foreground"
													}`}
												>
													<span className="mr-2 font-mono">
														{chosen ? "▶" : correct ? "✓" : "·"}
													</span>
													{c.text}
												</li>
											);
										})}
									</ul>
								)}

								{q.kind === "open" && a.openText && (
									<>
										<div className="mt-3 rounded-sm bg-background/60 p-3 text-foreground/90 text-xs leading-relaxed">
											{a.openText}
										</div>
										{q.rubric && !isOwn && (
											<details className="mt-2 text-[11px] text-muted-foreground">
												<summary className="cursor-pointer">
													{t("showRubric")}
												</summary>
												<p className="mt-1 italic">{q.rubric}</p>
											</details>
										)}
										{a.aiFeedback && (
											<div className="mt-3 border-primary/30 border-l-2 bg-muted/40 p-2 text-xs">
												<p className="lv-eyebrow text-[0.5rem] text-primary">
													{t("aiFeedback")}
												</p>
												<p className="mt-1 leading-relaxed">{a.aiFeedback}</p>
											</div>
										)}
									</>
								)}
							</li>
						);
					})}
				</ol>
			</main>
			<Footer />
		</>
	);
}
