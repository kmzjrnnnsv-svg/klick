"use client";

import { Star } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { rateStage } from "@/app/actions/applications";
import { Button } from "@/components/ui/button";

const DIMENSIONS = ["clarity", "respect", "effort", "responseTime"] as const;
type Dim = (typeof DIMENSIONS)[number];

export function StageRatingPrompt({
	applicationId,
	jobStageId,
	stageName,
}: {
	applicationId: string;
	jobStageId: string;
	stageName: string;
}) {
	const t = useTranslations("Applications");
	const [open, setOpen] = useState(false);
	const [done, setDone] = useState(false);
	const [scores, setScores] = useState<Record<Dim, number | null>>({
		clarity: null,
		respect: null,
		effort: null,
		responseTime: null,
	});
	const [comment, setComment] = useState("");
	const [isPending, startTransition] = useTransition();

	function set(dim: Dim, val: number) {
		setScores((s) => ({ ...s, [dim]: val }));
	}

	function submit() {
		startTransition(async () => {
			const res = await rateStage({
				applicationId,
				jobStageId,
				clarity: scores.clarity,
				respect: scores.respect,
				effort: scores.effort,
				responseTime: scores.responseTime,
				comment,
			});
			if (res.ok) setDone(true);
		});
	}

	if (done) {
		return (
			<div className="rounded-sm border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-emerald-700 text-sm dark:text-emerald-300">
				{t("ratingThanks")}
			</div>
		);
	}

	if (!open) {
		return (
			<button
				type="button"
				onClick={() => setOpen(true)}
				className="w-full rounded-sm border border-border border-dashed bg-muted/30 p-4 text-left transition-colors hover:bg-muted/60"
			>
				<p className="lv-eyebrow text-[0.55rem] text-primary">
					{t("ratingEyebrow")}
				</p>
				<p className="mt-1 text-sm">{t("ratingCta", { stage: stageName })}</p>
				<p className="mt-1 text-muted-foreground text-xs">
					{t("ratingDuration")}
				</p>
			</button>
		);
	}

	return (
		<div className="rounded-sm border border-primary/30 bg-background p-4">
			<p className="lv-eyebrow text-[0.55rem] text-primary">
				{t("ratingEyebrow")}
			</p>
			<h3 className="mt-2 font-serif-display text-base">
				{t("ratingTitle", { stage: stageName })}
			</h3>
			<p className="mt-1 text-muted-foreground text-xs leading-relaxed">
				{t("ratingHint")}
			</p>

			<dl className="mt-4 space-y-3">
				{DIMENSIONS.map((d) => (
					<div key={d} className="flex items-center justify-between gap-3">
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
				className="mt-4 w-full rounded-sm border border-border bg-background px-3 py-2 text-sm focus-visible:border-foreground focus-visible:outline-none"
			/>

			<div className="mt-3 flex gap-2">
				<Button onClick={submit} disabled={isPending} size="sm">
					{isPending ? t("sending") : t("ratingSubmit")}
				</Button>
				<Button variant="ghost" onClick={() => setOpen(false)} size="sm">
					{t("ratingSkip")}
				</Button>
			</div>
		</div>
	);
}
