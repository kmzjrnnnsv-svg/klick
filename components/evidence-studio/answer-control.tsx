"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { saveSheetAnswer } from "@/app/actions/evidence-studio";
import { Button } from "@/components/ui/button";
import { errorText } from "@/components/ui/error-text";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

const ANSWERS = ["yes", "partial", "no", "na"] as const;
type Answer = (typeof ANSWERS)[number];

// Antwort auf eine Prüffrage des Nachweisbogens — gilt für jedes Rahmenwerk
export function AnswerControl({
	controlCode,
	questionId,
	initial,
	disabled,
}: {
	controlCode: string;
	questionId: string;
	initial: { answer: Answer; note?: string } | null;
	disabled?: boolean;
}) {
	const t = useTranslations("EvidenceStudio");
	const tc = useTranslations("Common");
	const [answer, setAnswer] = useState<Answer | null>(initial?.answer ?? null);
	const [note, setNote] = useState(initial?.note ?? "");
	const [pending, start] = useTransition();
	const dirty =
		answer !== (initial?.answer ?? null) || note !== (initial?.note ?? "");

	const save = () =>
		start(async () => {
			const res = await saveSheetAnswer({
				controlCode,
				questionId,
				answer,
				note: note.trim() || undefined,
			});
			if (res.ok) toast.success(t("saved"));
			else toast.error(errorText(tc, res));
		});

	return (
		<div className="flex flex-col gap-2">
			<fieldset className="flex flex-wrap gap-1.5">
				<legend className="sr-only">{t("answerLegend")}</legend>
				{ANSWERS.map((a) => (
					<button
						key={a}
						type="button"
						aria-pressed={answer === a}
						disabled={disabled || pending}
						onClick={() => setAnswer(answer === a ? null : a)}
						className={cn(
							"rounded-full bg-muted px-3 py-1 font-medium text-footnote transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50",
							answer === a
								? a === "yes"
									? "border-success bg-success/10 text-foreground"
									: a === "no"
										? "border-destructive bg-destructive/10 text-foreground"
										: "border-primary bg-primary/10 text-foreground"
								: "text-muted-foreground hover:text-foreground",
						)}
					>
						{t(`answer_${a}`)}
					</button>
				))}
			</fieldset>
			{answer && answer !== "na" && (
				<Textarea
					value={note}
					onChange={(e) => setNote(e.target.value)}
					placeholder={t("notePlaceholder")}
					aria-label={t("notePlaceholder")}
					rows={2}
					maxLength={4000}
					disabled={disabled || pending}
					className="min-h-0 text-subhead"
				/>
			)}
			{dirty && !disabled && (
				<div>
					<Button size="sm" onClick={save} disabled={pending}>
						{pending ? tc("saving") : t("save")}
					</Button>
				</div>
			)}
		</div>
	);
}
