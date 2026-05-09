"use client";

import { ArrowRight, Pause, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { decideStageOutcome } from "@/app/actions/applications";
import { Button } from "@/components/ui/button";
import { REJECT_REASONS, type RejectReason } from "@/db/schema";

type Outcome = "advance" | "reject" | "on_hold";

export function StageOutcomeForm({
	applicationId,
	currentStageName,
	nextStageName,
	isFinalStage,
}: {
	applicationId: string;
	currentStageName: string | null;
	nextStageName: string | null;
	isFinalStage: boolean;
}) {
	const t = useTranslations("Applications");
	const [outcome, setOutcome] = useState<Outcome | null>(null);
	const [reason, setReason] = useState<RejectReason | "">("");
	const [freeText, setFreeText] = useState("");
	const [note, setNote] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [isPending, startTransition] = useTransition();

	function submit() {
		setError(null);
		if (!outcome) {
			setError(t("outcomePickRequired"));
			return;
		}
		if (outcome === "reject" && !reason) {
			setError(t("rejectReasonRequired"));
			return;
		}
		startTransition(async () => {
			const res = await decideStageOutcome({
				applicationId,
				outcome,
				rejectReason:
					outcome === "reject" ? (reason as RejectReason) : undefined,
				rejectFreeText: outcome === "reject" ? freeText : undefined,
				note: outcome !== "reject" ? note : undefined,
			});
			if (!res.ok) setError(res.error ?? "fehlgeschlagen");
			else {
				setOutcome(null);
				setReason("");
				setFreeText("");
				setNote("");
			}
		});
	}

	const advanceLabel = isFinalStage
		? t("outcomeAdvanceFinal")
		: nextStageName
			? t("outcomeAdvanceTo", { stage: nextStageName })
			: t("outcomeAdvance");

	return (
		<section className="rounded-sm border border-primary/30 bg-primary/5 p-5">
			<p className="lv-eyebrow text-[0.55rem] text-primary">
				{t("nextStepEyebrow")}
			</p>
			<h2 className="mt-2 font-serif-display text-xl">
				{currentStageName
					? t("nextStepInStage", { stage: currentStageName })
					: t("nextStepTitle")}
			</h2>
			<p className="mt-2 text-muted-foreground text-xs leading-relaxed">
				{t("nextStepHint")}
			</p>

			<div className="mt-4 grid gap-2 sm:grid-cols-3">
				<button
					type="button"
					onClick={() => setOutcome("advance")}
					className={`flex flex-col items-start gap-1 rounded-sm border p-3 text-left text-xs transition-colors ${
						outcome === "advance"
							? "border-primary bg-primary text-primary-foreground"
							: "border-border bg-background hover:border-primary/40"
					}`}
				>
					<ArrowRight className="h-4 w-4" strokeWidth={1.5} />
					<span className="font-medium">{advanceLabel}</span>
					<span
						className={`text-[10px] ${outcome === "advance" ? "text-primary-foreground/80" : "text-muted-foreground"}`}
					>
						{t("outcomeAdvanceHint")}
					</span>
				</button>
				<button
					type="button"
					onClick={() => setOutcome("on_hold")}
					className={`flex flex-col items-start gap-1 rounded-sm border p-3 text-left text-xs transition-colors ${
						outcome === "on_hold"
							? "border-amber-500 bg-amber-500/10 text-amber-900 dark:text-amber-100"
							: "border-border bg-background hover:border-amber-500/40"
					}`}
				>
					<Pause className="h-4 w-4" strokeWidth={1.5} />
					<span className="font-medium">{t("outcomeOnHold")}</span>
					<span className="text-[10px] text-muted-foreground">
						{t("outcomeOnHoldHint")}
					</span>
				</button>
				<button
					type="button"
					onClick={() => setOutcome("reject")}
					className={`flex flex-col items-start gap-1 rounded-sm border p-3 text-left text-xs transition-colors ${
						outcome === "reject"
							? "border-rose-500 bg-rose-500/10 text-rose-900 dark:text-rose-100"
							: "border-border bg-background hover:border-rose-500/40"
					}`}
				>
					<X className="h-4 w-4" strokeWidth={1.5} />
					<span className="font-medium">{t("outcomeReject")}</span>
					<span className="text-[10px] text-muted-foreground">
						{t("outcomeRejectHint")}
					</span>
				</button>
			</div>

			{outcome === "reject" && (
				<div className="mt-4 space-y-3 rounded-sm border border-rose-500/30 bg-background p-3">
					<p className="lv-eyebrow text-[0.55rem] text-rose-700 dark:text-rose-300">
						{t("rejectReasonEyebrow")}
					</p>
					<div className="grid gap-1.5 sm:grid-cols-2">
						{REJECT_REASONS.map((r) => (
							<label
								key={r}
								className="flex cursor-pointer items-center gap-2 rounded-sm border border-border bg-background px-3 py-2 text-xs has-[:checked]:border-rose-500 has-[:checked]:bg-rose-500/10"
							>
								<input
									type="radio"
									name="rejectReason"
									value={r}
									checked={reason === r}
									onChange={() => setReason(r)}
									className="sr-only"
								/>
								<span>{t(`rejectReason.${r}`)}</span>
							</label>
						))}
					</div>
					<textarea
						value={freeText}
						onChange={(e) => setFreeText(e.target.value)}
						rows={3}
						maxLength={1000}
						placeholder={t("rejectFreeTextPlaceholder")}
						className="w-full rounded-sm border border-border bg-background px-3 py-2 text-sm focus-visible:border-foreground focus-visible:outline-none"
					/>
					<p className="text-muted-foreground text-[11px] leading-relaxed">
						{t("rejectFreeTextHint")}
					</p>
				</div>
			)}

			{outcome && outcome !== "reject" && (
				<div className="mt-4">
					<input
						type="text"
						value={note}
						onChange={(e) => setNote(e.target.value)}
						maxLength={300}
						placeholder={t("nextStepNotePlaceholder")}
						className="w-full rounded-sm border border-border bg-background px-3 py-2 text-sm focus-visible:border-foreground focus-visible:outline-none"
					/>
				</div>
			)}

			{error && (
				<p className="mt-3 rounded-sm border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-rose-700 text-xs dark:text-rose-300">
					{error}
				</p>
			)}

			<div className="mt-4 flex gap-2">
				<Button onClick={submit} disabled={isPending || !outcome}>
					{isPending ? t("sending") : t("nextStepSubmit")}
				</Button>
				{outcome && (
					<Button variant="ghost" onClick={() => setOutcome(null)}>
						{t("cancel")}
					</Button>
				)}
			</div>
		</section>
	);
}
