import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import {
	answerJobQuestion,
	listQuestionsForJob,
} from "@/app/actions/job-questions";
import { getJob } from "@/app/actions/jobs";
import { auth } from "@/auth";
import { Footer } from "@/components/footer";
import { Header } from "@/components/header";
import { Button } from "@/components/ui/button";

export default async function JobQuestionsPage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const session = await auth();
	if (!session?.user) redirect("/login");

	const { id } = await params;
	const job = await getJob(id);
	if (!job) notFound();

	const t = await getTranslations("EmployerQuestions");
	const fmt = await getFormatter();
	const items = await listQuestionsForJob(id);

	async function answer(formData: FormData) {
		"use server";
		const questionId = formData.get("questionId")?.toString();
		const text = formData.get("answer")?.toString().trim() ?? "";
		const makePublic = formData.get("makePublic") === "on";
		if (!questionId || text.length < 1) return;
		await answerJobQuestion({ questionId, answer: text, makePublic });
	}

	const open = items.filter((q) => !q.answer);
	const answered = items.filter((q) => q.answer);

	return (
		<>
			<Header />
			<main className="mx-auto w-full max-w-3xl flex-1 px-3 pt-6 pb-20 sm:px-6 sm:pt-12">
				<header className="mb-6">
					<Link
						href={`/jobs/${id}`}
						className="lv-eyebrow text-[0.55rem] text-muted-foreground hover:text-foreground"
					>
						← {job.title}
					</Link>
					<p className="mt-3 lv-eyebrow text-[0.6rem] text-primary">
						{t("eyebrow")}
					</p>
					<h1 className="mt-2 font-serif-display text-3xl sm:text-4xl">
						{t("title")}
					</h1>
					<p className="mt-2 text-muted-foreground text-sm">
						{t("subtitle", { count: items.length })}
					</p>
				</header>

				{items.length === 0 ? (
					<div className="rounded-sm border border-border border-dashed p-10 text-center sm:p-14">
						<p className="text-muted-foreground text-sm">{t("empty")}</p>
					</div>
				) : (
					<>
						{open.length > 0 && (
							<section className="mb-10">
								<p className="lv-eyebrow text-[0.55rem] text-amber-700 dark:text-amber-300">
									{t("openSection", { count: open.length })}
								</p>
								<ul className="mt-3 space-y-4">
									{open.map((q) => (
										<li
											key={q.id}
											className="rounded-sm border border-amber-500/30 bg-amber-500/5 p-4"
										>
											<p className="text-foreground/90 text-sm leading-relaxed">
												{q.body}
											</p>
											<p className="mt-2 font-mono text-[10px] text-muted-foreground">
												{t("anonymousAt", {
													date: fmt.dateTime(q.createdAt, {
														dateStyle: "short",
														timeStyle: "short",
													}),
												})}
											</p>
											<form action={answer} className="mt-4 space-y-3">
												<input type="hidden" name="questionId" value={q.id} />
												<textarea
													name="answer"
													rows={3}
													required
													maxLength={1500}
													placeholder={t("answerPlaceholder")}
													className="w-full rounded-sm border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground/60 focus-visible:border-foreground focus-visible:outline-none"
												/>
												<div className="flex flex-wrap items-center justify-between gap-3">
													<label className="flex items-center gap-2 text-xs">
														<input type="checkbox" name="makePublic" />
														<span className="text-muted-foreground">
															{t("makePublic")}
														</span>
													</label>
													<Button type="submit" size="sm">
														{t("answer")}
													</Button>
												</div>
											</form>
										</li>
									))}
								</ul>
							</section>
						)}

						{answered.length > 0 && (
							<section>
								<p className="lv-eyebrow text-[0.55rem] text-muted-foreground">
									{t("answeredSection", { count: answered.length })}
								</p>
								<ul className="mt-3 space-y-3">
									{answered.map((q) => (
										<li
											key={q.id}
											className="rounded-sm border border-border bg-background p-4"
										>
											<div className="flex items-start justify-between gap-3">
												<p className="text-foreground/90 text-sm">{q.body}</p>
												{q.isPublic && (
													<span className="lv-eyebrow shrink-0 rounded-sm bg-emerald-500/10 px-2 py-1 text-[0.5rem] text-emerald-700 dark:text-emerald-300">
														{t("public")}
													</span>
												)}
											</div>
											<div className="mt-3 border-primary/30 border-l-2 pl-3">
												<p className="lv-eyebrow text-[0.5rem] text-primary">
													{t("yourAnswer")}
												</p>
												<div className="mt-1">
													<p className="whitespace-pre-wrap text-foreground/90 text-sm leading-relaxed">
														{q.answer}
													</p>
												</div>
											</div>
										</li>
									))}
								</ul>
							</section>
						)}
					</>
				)}
			</main>
			<Footer />
		</>
	);
}
