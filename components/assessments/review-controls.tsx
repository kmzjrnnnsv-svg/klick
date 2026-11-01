"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import {
	applyAssessmentResults,
	cancelAssessment,
	cloneAssessment,
	reviewAnswer,
	submitAssessment,
} from "@/app/actions/assessments";
import { completeProductChecklist } from "@/app/actions/products";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { errorText } from "@/components/ui/error-text";
import { nativeSelectCompactClass } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import type { AssessmentAnswer } from "@/db/schema/enums";

const ANSWERS: AssessmentAnswer[] = ["yes", "partial", "no", "unknown", "na"];

// Bewertung einer Antwort durch ISB/Berater:in: bestätigen, abweichend
// bewerten, Klärung anfordern — sofort gespeichert.
export function ReviewCell({
	assessmentId,
	questionCode,
	verdict,
	reviewerAnswer,
}: {
	assessmentId: string;
	questionCode: string;
	verdict: "confirmed" | "adjusted" | "clarify" | null;
	reviewerAnswer: AssessmentAnswer | null;
}) {
	const t = useTranslations("Assessment");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [pending, start] = useTransition();
	const [v, setV] = useState(verdict);
	const [adj, setAdj] = useState<AssessmentAnswer | "">(reviewerAnswer ?? "");

	function send(
		next: "confirmed" | "adjusted" | "clarify",
		answer?: AssessmentAnswer,
	) {
		start(async () => {
			const res = await reviewAnswer({
				assessmentId,
				questionCode,
				verdict: next,
				reviewerAnswer: answer ?? null,
			});
			if (!res.ok) return void toast.error(errorText(tc, res));
			setV(next);
			router.refresh();
		});
	}

	return (
		<div className="flex flex-wrap items-center gap-1.5">
			<Button
				type="button"
				size="sm"
				variant={v === "confirmed" ? "default" : "outline"}
				aria-pressed={v === "confirmed"}
				disabled={pending}
				onClick={() => send("confirmed")}
			>
				{t("confirm")}
			</Button>
			<label className="flex items-center gap-1 text-footnote">
				<span className="text-muted-foreground">{t("adjust")}</span>
				<select
					className={nativeSelectCompactClass}
					value={adj}
					disabled={pending}
					onChange={(e) => {
						const a = e.target.value as AssessmentAnswer | "";
						setAdj(a);
						if (a) send("adjusted", a);
					}}
				>
					<option value="">—</option>
					{ANSWERS.map((a) => (
						<option key={a} value={a}>
							{t(`answer_${a}`)}
						</option>
					))}
				</select>
			</label>
			<Button
				type="button"
				size="sm"
				variant={v === "clarify" ? "default" : "ghost"}
				aria-pressed={v === "clarify"}
				disabled={pending}
				onClick={() => send("clarify")}
			>
				{t("clarify")}
			</Button>
		</div>
	);
}

export function SubmitButton({ assessmentId }: { assessmentId: string }) {
	const t = useTranslations("Assessment");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [pending, start] = useTransition();
	return (
		<Button
			type="button"
			variant="outline"
			disabled={pending}
			onClick={() =>
				start(async () => {
					const res = await submitAssessment({ assessmentId });
					if (!res.ok) return void toast.error(errorText(tc, res));
					toast.success(t("submitted"));
					router.push(`/gap-analyse/${assessmentId}?schritt=bewertung`);
				})
			}
		>
			{t("submit")}
		</Button>
	);
}

// Produktcheckliste abschließen: Score festhalten, kein Control-Status.
export function CompleteChecklistButton({
	assessmentId,
	productId,
}: {
	assessmentId: string;
	productId: string;
}) {
	const t = useTranslations("Assessment");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [pending, start] = useTransition();
	return (
		<Button
			disabled={pending}
			onClick={() =>
				start(async () => {
					const res = await completeProductChecklist({ assessmentId });
					if (!res.ok) return void toast.error(errorText(tc, res));
					toast.success(t("checklistDone"));
					router.push(`/produkte/${productId}?tab=checkliste`);
				})
			}
		>
			{pending ? tc("working") : t("completeChecklist")}
		</Button>
	);
}

// „Ergebnis übernehmen“ mit Diff-Vorschau der Statuswechsel.
export function ApplyDialog({
	assessmentId,
	changes,
	exclusions = [],
	naOpen = [],
}: {
	assessmentId: string;
	changes: { controlCode: string; title: string; from: string; to: string }[];
	// „Nicht relevant“: Anforderungen, die mit Begründung ausgeschlossen werden
	exclusions?: { key: string; label: string; how: string }[];
	// „Nicht relevant“ ohne Bestätigung: wirkt erst, wenn bestätigt
	naOpen?: { controlCode: string; title: string; status: string }[];
}) {
	const t = useTranslations("Assessment");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [pending, start] = useTransition();
	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button>{t("apply")}</Button>
			</DialogTrigger>
			<DialogContent className="max-h-[85vh] overflow-y-auto overscroll-contain sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>{t("applyTitle")}</DialogTitle>
					<DialogDescription>{t("applyHint")}</DialogDescription>
				</DialogHeader>
				<p className="text-subhead">
					{t("applyLead", { count: changes.length })}
				</p>
				{changes.length > 0 && (
					<ul className="flex flex-col list-inset overflow-hidden rounded-2xl bg-card text-subhead">
						{changes.map((c) => (
							<li key={c.controlCode} className="flex flex-col px-3 py-1.5">
								<span className="min-w-0 truncate">
									<span className="font-mono text-footnote" translate="no">
										{c.controlCode}
									</span>{" "}
									{c.title}
								</span>
								<span className="text-muted-foreground text-footnote">
									<del>{c.from}</del>{" "}
									<ins className="text-foreground no-underline">{c.to}</ins>
								</span>
							</li>
						))}
					</ul>
				)}
				{exclusions.length > 0 && (
					<>
						<p className="text-subhead">
							{t("applyExclusions", { count: exclusions.length })}
						</p>
						<ul className="flex flex-col list-inset overflow-hidden rounded-2xl bg-card text-subhead">
							{exclusions.map((x) => (
								<li key={x.key} className="flex flex-col px-3 py-1.5">
									<span className="min-w-0 truncate" translate="no">
										{x.label}
									</span>
									<span className="text-muted-foreground text-footnote">
										{x.how}
									</span>
								</li>
							))}
						</ul>
					</>
				)}
				{naOpen.length > 0 && (
					<>
						<p className="text-subhead">
							{t("applyNaOpen", { count: naOpen.length })}
						</p>
						<ul className="flex flex-col list-inset overflow-hidden rounded-2xl bg-card text-subhead">
							{naOpen.map((x) => (
								<li key={x.controlCode} className="flex flex-col px-3 py-1.5">
									<span className="min-w-0 truncate">
										<span className="font-mono text-footnote" translate="no">
											{x.controlCode}
										</span>{" "}
										{x.title}
									</span>
									<span className="text-muted-foreground text-footnote">
										{t(`naState_${x.status}` as "naState_pending")}
									</span>
								</li>
							))}
						</ul>
					</>
				)}
				<DialogFooter>
					<Button variant="outline" onClick={() => setOpen(false)}>
						{tc("cancel")}
					</Button>
					<Button
						disabled={pending}
						onClick={() =>
							start(async () => {
								const res = await applyAssessmentResults({ assessmentId });
								if (!res.ok) return void toast.error(errorText(tc, res));
								toast.success(t("applyDone", { count: res.data.changed }));
								setOpen(false);
								router.push(`/gap-analyse/${assessmentId}?schritt=massnahmen`);
							})
						}
					>
						{pending ? tc("working") : t("apply")}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

export function RepeatButton({ assessmentId }: { assessmentId: string }) {
	const t = useTranslations("Assessment");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [pending, start] = useTransition();
	return (
		<Button
			type="button"
			variant="outline"
			disabled={pending}
			onClick={() =>
				start(async () => {
					const res = await cloneAssessment({ assessmentId });
					if (!res.ok) return void toast.error(errorText(tc, res));
					toast.success(t("repeatDone"));
					router.push(`/gap-analyse/${res.data.id}?schritt=fragen`);
				})
			}
		>
			{t("repeat")}
		</Button>
	);
}

export function CancelButton({ assessmentId }: { assessmentId: string }) {
	const t = useTranslations("Assessment");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [pending, start] = useTransition();
	// Rückfrage als Alert (HIG): Titel als Frage, „Weiter bearbeiten“ und die
	// destruktive Handlung mit eigenem Namen — nie zweimal „Abbrechen“
	return (
		<AlertDialog>
			<AlertDialogTrigger asChild>
				<Button variant="ghost">{t("cancel")}</Button>
			</AlertDialogTrigger>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>{t("cancelTitle")}</AlertDialogTitle>
					<AlertDialogDescription>{t("cancelConfirm")}</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>{t("cancelKeep")}</AlertDialogCancel>
					<AlertDialogAction
						className={buttonVariants({ variant: "destructive" })}
						disabled={pending}
						onClick={(e) => {
							e.preventDefault();
							start(async () => {
								const res = await cancelAssessment({ assessmentId });
								if (!res.ok) return void toast.error(errorText(tc, res));
								router.push("/gap-analyse");
							});
						}}
					>
						{t("cancelAction")}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
