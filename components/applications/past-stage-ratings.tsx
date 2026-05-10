"use client";

import { ChevronDown, ChevronUp, Star } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { rateStage } from "@/app/actions/applications";
import { Button } from "@/components/ui/button";

const DIMENSIONS = ["clarity", "respect", "effort", "responseTime"] as const;
type Dim = (typeof DIMENSIONS)[number];

type PastStage = {
	id: string;
	name: string;
};

export function PastStageRatings({
	applicationId,
	stages,
}: {
	applicationId: string;
	stages: PastStage[];
}) {
	const t = useTranslations("Applications");
	const [openId, setOpenId] = useState<string | null>(null);
	const [doneIds, setDoneIds] = useState<Set<string>>(new Set());
	const [scores, setScores] = useState<Record<Dim, number | null>>({
		clarity: null,
		respect: null,
		effort: null,
		responseTime: null,
	});
	const [comment, setComment] = useState("");
	const [isPending, startTransition] = useTransition();

	if (stages.length === 0) return null;

	function reset() {
		setScores({
			clarity: null,
			respect: null,
			effort: null,
			responseTime: null,
		});
		setComment("");
	}

	function set(dim: Dim, val: number) {
		setScores((s) => ({ ...s, [dim]: val }));
	}

	function submit(stageId: string) {
		startTransition(async () => {
			const res = await rateStage({
				applicationId,
				jobStageId: stageId,
				clarity: scores.clarity,
				respect: scores.respect,
				effort: scores.effort,
				responseTime: scores.responseTime,
				comment,
			});
			if (res.ok) {
				setDoneIds((prev) => new Set([...prev, stageId]));
				setOpenId(null);
				reset();
			}
		});
	}

	return (
		<section className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 sm:p-6">
			<p className="lv-eyebrow text-[0.55rem] text-amber-700 dark:text-amber-300">
				{t("pastRatings.eyebrow")}
			</p>
			<h2 className="mt-2 font-serif-display text-base">
				{t("pastRatings.title")}
			</h2>
			<p className="mt-1 mb-4 text-muted-foreground text-xs leading-relaxed">
				{t("pastRatings.hint")}
			</p>

			<ul className="space-y-2">
				{stages.map((s) => {
					const isOpen = openId === s.id;
					const isDone = doneIds.has(s.id);
					return (
						<li
							key={s.id}
							className={`rounded-md border bg-background ${
								isDone ? "border-emerald-500/30" : "border-border"
							}`}
						>
							{isDone ? (
								<div className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
									<span>{s.name}</span>
									<span className="text-emerald-700 text-xs dark:text-emerald-300">
										{t("pastRatings.done")}
									</span>
								</div>
							) : (
								<>
									<button
										type="button"
										onClick={() => {
											setOpenId(isOpen ? null : s.id);
											if (!isOpen) reset();
										}}
										className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-sm hover:bg-muted/30"
									>
										<span className="font-medium">{s.name}</span>
										<span className="flex items-center gap-2 text-muted-foreground text-xs">
											{t("pastRatings.rate")}
											{isOpen ? (
												<ChevronUp className="h-3.5 w-3.5" strokeWidth={1.5} />
											) : (
												<ChevronDown
													className="h-3.5 w-3.5"
													strokeWidth={1.5}
												/>
											)}
										</span>
									</button>
									{isOpen && (
										<div className="border-border border-t p-3">
											<dl className="space-y-2">
												{DIMENSIONS.map((d) => (
													<div
														key={d}
														className="flex items-center justify-between gap-3"
													>
														<dt className="text-foreground/90 text-xs">
															{t(`ratingDim.${d}`)}
														</dt>
														<dd className="flex items-center gap-1">
															{[1, 2, 3, 4, 5].map((n) => (
																<button
																	key={n}
																	type="button"
																	aria-label={`${n}/5`}
																	onClick={() => set(d, n)}
																	className="p-0.5 transition-colors"
																>
																	<Star
																		className={`h-4 w-4 ${
																			(scores[d] ?? 0) >= n
																				? "fill-amber-400 text-amber-400"
																				: "text-muted-foreground/40"
																		}`}
																		strokeWidth={1.5}
																	/>
																</button>
															))}
														</dd>
													</div>
												))}
											</dl>
											<textarea
												value={comment}
												onChange={(e) => setComment(e.target.value)}
												rows={2}
												maxLength={500}
												placeholder={t("ratingCommentPlaceholder")}
												className="mt-3 block w-full rounded-sm border border-border bg-background px-3 py-2 text-sm focus-visible:border-foreground focus-visible:outline-none"
											/>
											<div className="mt-3 flex gap-2">
												<Button
													onClick={() => submit(s.id)}
													disabled={isPending}
													size="sm"
												>
													{isPending ? t("sending") : t("ratingSubmit")}
												</Button>
												<Button
													type="button"
													variant="ghost"
													size="sm"
													onClick={() => {
														setOpenId(null);
														reset();
													}}
												>
													{t("ratingSkip")}
												</Button>
											</div>
										</div>
									)}
								</>
							)}
						</li>
					);
				})}
			</ul>
		</section>
	);
}
