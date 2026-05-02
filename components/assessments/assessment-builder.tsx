"use client";

import { Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { upsertAssessment } from "@/app/actions/assessments";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type {
	AssessmentChoice,
	JobAssessment,
	JobAssessmentQuestion,
} from "@/db/schema";

type Q = {
	kind: "mc" | "open";
	body: string;
	choices?: AssessmentChoice[];
	correctChoice?: number;
	rubric?: string;
	maxPoints: number;
};

function emptyMc(): Q {
	return {
		kind: "mc",
		body: "",
		choices: [
			{ text: "", weight: 1 },
			{ text: "", weight: 0 },
		],
		correctChoice: 0,
		maxPoints: 1,
	};
}

function emptyOpen(): Q {
	return { kind: "open", body: "", rubric: "", maxPoints: 3 };
}

export function AssessmentBuilder({
	jobId,
	initial,
}: {
	jobId: string;
	initial: {
		assessment: JobAssessment;
		questions: JobAssessmentQuestion[];
	} | null;
}) {
	const t = useTranslations("Assessment");
	const [title, setTitle] = useState(initial?.assessment.title ?? "");
	const [description, setDescription] = useState(
		initial?.assessment.description ?? "",
	);
	const [questions, setQuestions] = useState<Q[]>(
		initial?.questions.map((q) => ({
			kind: q.kind,
			body: q.body,
			choices: q.choices ?? undefined,
			correctChoice: q.correctChoice ?? undefined,
			rubric: q.rubric ?? "",
			maxPoints: q.maxPoints,
		})) ?? [emptyMc()],
	);
	const [error, setError] = useState<string | null>(null);
	const [savedAt, setSavedAt] = useState<Date | null>(null);
	const [isPending, startTransition] = useTransition();

	function update(i: number, patch: Partial<Q>) {
		setQuestions((qs) =>
			qs.map((q, idx) => (idx === i ? { ...q, ...patch } : q)),
		);
	}

	function addChoice(i: number) {
		setQuestions((qs) =>
			qs.map((q, idx) =>
				idx === i
					? {
							...q,
							choices: [...(q.choices ?? []), { text: "", weight: 0 }],
						}
					: q,
			),
		);
	}

	function removeChoice(i: number, ci: number) {
		setQuestions((qs) =>
			qs.map((q, idx) =>
				idx === i
					? {
							...q,
							choices: (q.choices ?? []).filter((_, c) => c !== ci),
							correctChoice:
								q.correctChoice !== undefined && q.correctChoice >= ci
									? Math.max(0, q.correctChoice - 1)
									: q.correctChoice,
						}
					: q,
			),
		);
	}

	function save() {
		setError(null);
		if (!title.trim()) {
			setError(t("titleRequired"));
			return;
		}
		const valid = questions.every(
			(q) =>
				q.body.trim().length > 0 &&
				(q.kind === "open" ||
					((q.choices?.length ?? 0) >= 2 &&
						q.choices?.every((c) => c.text.trim()))),
		);
		if (!valid) {
			setError(t("invalidQuestion"));
			return;
		}
		startTransition(async () => {
			try {
				await upsertAssessment({
					jobId,
					title: title.trim(),
					description: description.trim() || undefined,
					questions,
				});
				setSavedAt(new Date());
			} catch (e) {
				setError(e instanceof Error ? e.message : String(e));
			}
		});
	}

	return (
		<div className="space-y-6">
			<div className="space-y-3">
				<label className="block space-y-1.5">
					<span className="lv-eyebrow text-[0.55rem] text-muted-foreground">
						{t("title")}
					</span>
					<Input
						value={title}
						onChange={(e) => setTitle(e.target.value)}
						placeholder={t("titlePlaceholder")}
					/>
				</label>
				<label className="block space-y-1.5">
					<span className="lv-eyebrow text-[0.55rem] text-muted-foreground">
						{t("description")}
					</span>
					<textarea
						value={description}
						onChange={(e) => setDescription(e.target.value)}
						rows={2}
						className="w-full rounded-sm border border-border bg-background px-3 py-2 text-sm focus-visible:border-foreground focus-visible:outline-none"
						placeholder={t("descriptionPlaceholder")}
					/>
				</label>
			</div>

			<ol className="space-y-5">
				{questions.map((q, i) => (
					<li
						// biome-ignore lint/suspicious/noArrayIndexKey: positional question array, order is meaningful
						key={i}
						className="space-y-3 rounded-sm border border-border bg-background p-4"
					>
						<div className="flex items-start justify-between gap-3">
							<p className="lv-eyebrow text-[0.55rem] text-primary">
								{`${t("question")} ${i + 1} · ${
									q.kind === "mc" ? t("multipleChoice") : t("openQuestion")
								}`}
							</p>
							<button
								type="button"
								onClick={() =>
									setQuestions((qs) => qs.filter((_, idx) => idx !== i))
								}
								className="text-muted-foreground hover:text-rose-700"
								aria-label={t("removeQuestion")}
							>
								<Trash2 className="h-4 w-4" strokeWidth={1.5} />
							</button>
						</div>
						<textarea
							value={q.body}
							onChange={(e) => update(i, { body: e.target.value })}
							rows={2}
							className="w-full rounded-sm border border-border bg-background px-3 py-2 text-sm focus-visible:border-foreground focus-visible:outline-none"
							placeholder={t("questionPlaceholder")}
						/>
						{q.kind === "mc" ? (
							<div className="space-y-2">
								{(q.choices ?? []).map((c, ci) => (
									<div
										// biome-ignore lint/suspicious/noArrayIndexKey: positional choice array
										key={ci}
										className="flex items-center gap-2"
									>
										<input
											type="radio"
											name={`correct-${i}`}
											checked={q.correctChoice === ci}
											onChange={() => update(i, { correctChoice: ci })}
											aria-label={t("markCorrect")}
										/>
										<input
											type="text"
											value={c.text}
											onChange={(e) =>
												update(i, {
													choices: q.choices?.map((cc, idx) =>
														idx === ci ? { ...cc, text: e.target.value } : cc,
													),
												})
											}
											placeholder={t("choicePlaceholder")}
											className="flex-1 rounded-sm border border-border bg-background px-2 py-1 text-sm"
										/>
										<button
											type="button"
											onClick={() => removeChoice(i, ci)}
											className="text-muted-foreground hover:text-rose-700"
											aria-label={t("removeChoice")}
										>
											<Trash2 className="h-3 w-3" strokeWidth={1.5} />
										</button>
									</div>
								))}
								<button
									type="button"
									onClick={() => addChoice(i)}
									className="lv-eyebrow inline-flex items-center gap-1 text-[0.55rem] text-primary hover:opacity-80"
								>
									<Plus className="h-3 w-3" strokeWidth={1.5} />
									{t("addChoice")}
								</button>
							</div>
						) : (
							<textarea
								value={q.rubric ?? ""}
								onChange={(e) => update(i, { rubric: e.target.value })}
								rows={2}
								className="w-full rounded-sm border border-border bg-background px-3 py-2 text-xs focus-visible:border-foreground focus-visible:outline-none"
								placeholder={t("rubricPlaceholder")}
							/>
						)}
						<div className="flex items-center gap-3">
							<label className="flex items-center gap-2 text-xs">
								<span className="lv-eyebrow text-[0.5rem] text-muted-foreground">
									{t("maxPoints")}
								</span>
								<input
									type="number"
									min={1}
									max={10}
									value={q.maxPoints}
									onChange={(e) =>
										update(i, {
											maxPoints: Math.max(
												1,
												Math.min(10, Number(e.target.value) || 1),
											),
										})
									}
									className="w-16 rounded-sm border border-border bg-background px-2 py-1 text-sm"
								/>
							</label>
						</div>
					</li>
				))}
			</ol>

			<div className="flex flex-wrap gap-2">
				<Button
					type="button"
					variant="outline"
					size="sm"
					onClick={() => setQuestions((qs) => [...qs, emptyMc()])}
				>
					{t("addMc")}
				</Button>
				<Button
					type="button"
					variant="outline"
					size="sm"
					onClick={() => setQuestions((qs) => [...qs, emptyOpen()])}
				>
					{t("addOpen")}
				</Button>
			</div>

			{error && (
				<p className="text-rose-700 text-sm dark:text-rose-300">{error}</p>
			)}

			<div className="flex items-center justify-between border-border border-t pt-4">
				<p className="text-muted-foreground text-xs">
					{savedAt
						? t("savedAt", { time: savedAt.toLocaleTimeString() })
						: t("notSaved")}
				</p>
				<Button onClick={save} disabled={isPending}>
					{isPending ? t("saving") : t("save")}
				</Button>
			</div>
		</div>
	);
}
