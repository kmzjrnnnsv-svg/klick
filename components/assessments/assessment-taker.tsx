"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import {
	startAssessmentResponse,
	submitAssessment,
} from "@/app/actions/assessments";
import { Button } from "@/components/ui/button";
import type { JobAssessmentQuestion } from "@/db/schema";

type Answer = { questionId: string; choiceIndex?: number; openText?: string };

export function AssessmentTaker({
	jobId,
	questions,
	alreadySubmitted,
	gradedScore,
	gradedMax,
}: {
	jobId: string;
	questions: JobAssessmentQuestion[];
	alreadySubmitted: boolean;
	gradedScore: number | null;
	gradedMax: number | null;
}) {
	const t = useTranslations("Assessment");
	const [answers, setAnswers] = useState<Answer[]>(
		questions.map((q) => ({ questionId: q.id })),
	);
	const [error, setError] = useState<string | null>(null);
	const [submitted, setSubmitted] = useState(alreadySubmitted);
	const [isPending, startTransition] = useTransition();

	function update(qId: string, patch: Partial<Answer>) {
		setAnswers((as) =>
			as.map((a) => (a.questionId === qId ? { ...a, ...patch } : a)),
		);
	}

	function go() {
		setError(null);
		const allMc = questions
			.filter((q) => q.kind === "mc")
			.every(
				(q) =>
					answers.find((a) => a.questionId === q.id)?.choiceIndex !== undefined,
			);
		if (!allMc) {
			setError(t("answerAllMc"));
			return;
		}
		startTransition(async () => {
			try {
				const { id } = await startAssessmentResponse(jobId);
				await submitAssessment({ responseId: id, answers });
				setSubmitted(true);
			} catch (e) {
				setError(e instanceof Error ? e.message : String(e));
			}
		});
	}

	if (submitted) {
		return (
			<div className="rounded-sm border border-emerald-500/30 bg-emerald-500/5 p-5 text-emerald-700 text-sm dark:text-emerald-300">
				<p className="font-medium">{t("submittedTitle")}</p>
				<p className="mt-2">{t("submittedHint")}</p>
				{gradedScore !== null && gradedMax !== null && (
					<p className="mt-3 font-mono text-base">
						{t("yourScore")}: {gradedScore}/{gradedMax}
					</p>
				)}
			</div>
		);
	}

	return (
		<div className="space-y-6">
			<ol className="space-y-5">
				{questions.map((q, i) => (
					<li
						key={q.id}
						className="space-y-3 rounded-sm border border-border bg-background p-4"
					>
						<p className="lv-eyebrow text-[0.55rem] text-muted-foreground">
							{t("question")} {i + 1} · {q.maxPoints}{" "}
							{q.maxPoints === 1 ? t("point") : t("points")}
						</p>
						<p className="font-medium text-sm">{q.body}</p>
						{q.kind === "mc" ? (
							<div className="space-y-2">
								{(q.choices ?? []).map((c, ci) => (
									<label
										// biome-ignore lint/suspicious/noArrayIndexKey: positional choice array, order is meaningful
										key={`${q.id}-${ci}`}
										className="flex cursor-pointer items-start gap-2 rounded-sm border border-border bg-background p-2 text-sm has-[:checked]:border-primary"
									>
										<input
											type="radio"
											name={`q-${q.id}`}
											checked={
												answers.find((a) => a.questionId === q.id)
													?.choiceIndex === ci
											}
											onChange={() => update(q.id, { choiceIndex: ci })}
											className="mt-1"
										/>
										<span>{c.text}</span>
									</label>
								))}
							</div>
						) : (
							<textarea
								value={
									answers.find((a) => a.questionId === q.id)?.openText ?? ""
								}
								onChange={(e) => update(q.id, { openText: e.target.value })}
								rows={4}
								maxLength={2000}
								placeholder={t("openPlaceholder")}
								className="w-full rounded-sm border border-border bg-background px-3 py-2 text-sm focus-visible:border-foreground focus-visible:outline-none"
							/>
						)}
					</li>
				))}
			</ol>
			{error && (
				<p className="text-rose-700 text-sm dark:text-rose-300">{error}</p>
			)}
			<Button onClick={go} disabled={isPending} className="w-full">
				{isPending ? t("submitting") : t("submit")}
			</Button>
		</div>
	);
}
