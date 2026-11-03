"use client";

import { ChevronLeft, Send, Upload } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
	type ReactNode,
	useCallback,
	useEffect,
	useRef,
	useState,
	useTransition,
} from "react";
import {
	answerQuestion,
	delegateQuestion,
	uploadAnswerEvidence,
} from "@/app/actions/assessments";
import {
	DlpWarning,
	useUploadFeedback,
} from "@/components/entity/upload-feedback";
import { Button } from "@/components/ui/button";
import { errorText } from "@/components/ui/error-text";
import { nativeSelectCompactClass } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import type { AssessmentAnswer } from "@/db/schema/enums";
import { cn } from "@/lib/utils";

// Gap-Analyse, eine Frage auf einmal (Wunsch 03.11.): die Frage groß in
// Alltagssprache, vier Knöpfe (Tasten 1–4), danach nur, was zur Antwort
// passt — bei „Ja“ ein Nachweis, bei „Teilweise“/„Nein“ was fehlt, bei
// „Weiß ich nicht“ an wen die Frage geht. Alles Weitere (Prüffragen,
// Zusammenhänge, vorhandene Nachweise, „Nicht relevant“) unter „Mehr“.

const CHOICES = ["yes", "partial", "no", "unknown"] as const;
type Choice = (typeof CHOICES)[number];

const TONE: Record<Choice, string> = {
	yes: "aria-pressed:bg-success/15 aria-pressed:ring-success",
	partial: "aria-pressed:bg-warning/15 aria-pressed:ring-warning",
	no: "aria-pressed:bg-destructive/10 aria-pressed:ring-destructive",
	unknown: "aria-pressed:bg-muted aria-pressed:ring-foreground/40",
};

const isTyping = (el: EventTarget | null) =>
	el instanceof HTMLElement &&
	(el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));

export function FocusQuestion({
	assessmentId,
	questionCode,
	statement,
	technical,
	why,
	position,
	initial,
	nextHref,
	prevHref,
	members,
	canAnswer,
	canDelegate,
	children,
}: {
	assessmentId: string;
	questionCode: string;
	// groß: die Frage in Alltagssprache (sonst der Text der Frage)
	statement: string;
	// klein darunter: Code und Fachtitel des Controls
	technical: string | null;
	// Warum das wichtig ist, ein Satz
	why: string | null;
	position: { index: number; total: number; chapter: string };
	initial: {
		answer: AssessmentAnswer | null;
		comment: string | null;
		documents: number;
	};
	nextHref: string;
	prevHref: string | null;
	members: { userId: string; name: string }[];
	canAnswer: boolean;
	canDelegate: boolean;
	// „Mehr zu dieser Frage“: die vollständige Fragekarte
	children?: ReactNode;
}) {
	const t = useTranslations("Assessment");
	const tc = useTranslations("Common");
	const td = useTranslations("Dlp");
	const router = useRouter();
	const feedback = useUploadFeedback();
	const [answer, setAnswer] = useState<AssessmentAnswer | null>(initial.answer);
	const [comment, setComment] = useState(initial.comment ?? "");
	const [savedComment, setSavedComment] = useState(initial.comment ?? "");
	const [docs, setDocs] = useState(initial.documents);
	const [delegateTo, setDelegateTo] = useState("");
	const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");
	const [dlp, setDlp] = useState<{ file: File; reasons: string[] } | null>(
		null,
	);
	const [dlpAck, setDlpAck] = useState(false);
	const [pending, start] = useTransition();
	const fileInput = useRef<HTMLInputElement>(null);
	const id = `fq-${questionCode}`;

	const persist = useCallback(
		async (a: AssessmentAnswer | null, note: string) => {
			setStatus("saving");
			const res = await answerQuestion({
				assessmentId,
				questionCode,
				answer: a,
				comment: note || undefined,
			});
			if (!res.ok) {
				setStatus("idle");
				toast.error(errorText(tc, res));
				return false;
			}
			setSavedComment(note);
			setStatus("saved");
			return true;
		},
		[assessmentId, questionCode, tc],
	);

	const choose = useCallback(
		(c: Choice) => {
			if (!canAnswer) return;
			setAnswer(c);
			start(async () => {
				const ok = await persist(c, comment);
				// „Ja“ mit Nachweis braucht nichts mehr: gleich weiter
				if (ok && c === "yes" && docs > 0) router.push(nextHref);
			});
		},
		[canAnswer, persist, comment, docs, router, nextHref],
	);

	const next = useCallback(() => {
		start(async () => {
			if (answer && comment !== savedComment) {
				const ok = await persist(answer, comment);
				if (!ok) return;
			}
			router.push(nextHref);
		});
	}, [answer, comment, savedComment, persist, router, nextHref]);

	// Tasten 1–4 wählen, Enter geht weiter (nicht beim Schreiben)
	useEffect(() => {
		function onKey(e: KeyboardEvent) {
			if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return;
			const i = ["1", "2", "3", "4"].indexOf(e.key);
			const c = CHOICES[i];
			if (c) {
				e.preventDefault();
				choose(c);
			} else if (e.key === "Enter" && answer) {
				e.preventDefault();
				next();
			}
		}
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [choose, next, answer]);

	function upload(files: readonly File[], acknowledged = false) {
		start(async () => {
			for (const file of files) {
				const big = feedback.tooLarge(file);
				if (big) {
					toast.error(big);
					continue;
				}
				const fd = new FormData();
				fd.set("assessmentId", assessmentId);
				fd.set("questionCode", questionCode);
				fd.set("file", file);
				if (acknowledged) fd.set("dlpAcknowledged", "1");
				const res = await uploadAnswerEvidence(fd);
				if (!res.ok) {
					const warn = feedback.dlpWarning(res);
					if (warn) {
						setDlp({ file, reasons: warn });
						setDlpAck(false);
						return;
					}
					toast.error(`${file.name}: ${feedback.errorText(res)}`);
					continue;
				}
				setDocs((n) => n + 1);
				toast.success(t("uploaded", { name: file.name }));
			}
			setDlp(null);
		});
	}

	return (
		<article
			aria-labelledby={`${id}-title`}
			className="flex flex-col gap-6 rounded-2xl bg-card p-5 sm:p-8"
		>
			<header className="flex flex-col gap-2">
				<p className="text-footnote text-muted-foreground">
					{t("focusPosition", {
						index: position.index,
						total: position.total,
						chapter: position.chapter,
					})}
				</p>
				<h2
					id={`${id}-title`}
					className="text-balance font-semibold text-title-2 leading-snug"
				>
					{statement}
				</h2>
				{why && <p className="text-callout text-muted-foreground">{why}</p>}
				{technical && (
					<p className="text-footnote text-muted-foreground" translate="no">
						{technical}
					</p>
				)}
			</header>

			<fieldset disabled={!canAnswer} className="flex flex-col gap-3">
				<legend className="mb-2 font-medium text-headline">
					{t("focusAsk")}
				</legend>
				<div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
					{CHOICES.map((c, i) => (
						<button
							key={c}
							type="button"
							aria-pressed={answer === c}
							onClick={() => choose(c)}
							className={cn(
								"flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-xl bg-muted px-3 py-2 font-medium text-callout ring-2 ring-transparent transition-colors hover:bg-foreground/12 focus-visible:outline-none focus-visible:ring-ring disabled:opacity-50",
								TONE[c],
							)}
						>
							<span>{t(`focus_${c}`)}</span>
							<span
								aria-hidden="true"
								className="text-caption-2 text-muted-foreground max-sm:hidden"
							>
								{t("focusKey", { key: i + 1 })}
							</span>
						</button>
					))}
				</div>
			</fieldset>

			{answer === "yes" && (
				<section className="flex flex-col gap-2 rounded-xl bg-background p-4">
					{docs > 0 ? (
						<p className="text-subhead">{t("focusHasEvidence", { n: docs })}</p>
					) : (
						<>
							<p className="text-subhead">{t("focusEvidenceAsk")}</p>
							<div className="flex flex-wrap items-center gap-2">
								<Button
									type="button"
									size="sm"
									disabled={pending || !canAnswer}
									onClick={() => fileInput.current?.click()}
								>
									<Upload aria-hidden="true" />
									{t("focusUpload")}
								</Button>
								<span className="text-footnote text-muted-foreground">
									{t("focusEvidenceLater")}
								</span>
							</div>
						</>
					)}
					<input
						ref={fileInput}
						type="file"
						multiple
						className="sr-only"
						aria-label={t("upload")}
						accept=".pdf,.docx,.xlsx,.pptx,.png,.jpg,.jpeg,.txt,.md,.csv,.json"
						onChange={(e) => {
							const files = [...(e.target.files ?? [])];
							e.target.value = "";
							if (files.length > 0) upload(files);
						}}
					/>
					{dlp && (
						<div className="flex flex-col gap-2">
							<DlpWarning
								id={`${id}-dlp`}
								reasons={dlp.reasons}
								acknowledged={dlpAck}
								onAcknowledge={setDlpAck}
							/>
							<div className="flex gap-2">
								<Button
									type="button"
									size="sm"
									disabled={!dlpAck || pending}
									onClick={() => upload([dlp.file], true)}
								>
									{td("uploadAnyway")}
								</Button>
								<Button
									type="button"
									size="sm"
									variant="ghost"
									onClick={() => setDlp(null)}
								>
									{tc("cancel")}
								</Button>
							</div>
						</div>
					)}
				</section>
			)}

			{(answer === "partial" || answer === "no") && (
				<section className="flex flex-col gap-2 rounded-xl bg-background p-4">
					<Label htmlFor={`${id}-missing`}>{t("focusMissing")}</Label>
					<Textarea
						id={`${id}-missing`}
						value={comment}
						maxLength={4000}
						rows={3}
						placeholder={t("focusMissingPlaceholder")}
						disabled={!canAnswer}
						onChange={(e) => setComment(e.target.value)}
						onBlur={() => {
							if (answer && comment !== savedComment)
								start(async () => {
									await persist(answer, comment);
								});
						}}
					/>
					<p className="text-footnote text-muted-foreground">
						{t("focusMissingHint")}
					</p>
				</section>
			)}

			{answer === "unknown" && (
				<section className="flex flex-col gap-2 rounded-xl bg-background p-4">
					<p className="text-subhead">{t("focusUnknown")}</p>
					{canDelegate && members.length > 0 && (
						<div className="flex flex-wrap items-center gap-2">
							<label className="flex items-center gap-2 text-subhead">
								<span className="text-muted-foreground">{t("delegateTo")}</span>
								<select
									className={nativeSelectCompactClass}
									value={delegateTo}
									onChange={(e) => setDelegateTo(e.target.value)}
								>
									<option value="">–</option>
									{members.map((m) => (
										<option key={m.userId} value={m.userId}>
											{m.name}
										</option>
									))}
								</select>
							</label>
							<Button
								type="button"
								size="sm"
								variant="outline"
								disabled={!delegateTo || pending}
								onClick={() =>
									start(async () => {
										const res = await delegateQuestion({
											assessmentId,
											questionCode,
											assigneeUserId: delegateTo,
										});
										if (!res.ok) return void toast.error(errorText(tc, res));
										setDelegateTo("");
										toast.success(t("delegated"));
									})
								}
							>
								<Send aria-hidden="true" />
								{t("delegate")}
							</Button>
						</div>
					)}
				</section>
			)}

			<div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
				{prevHref ? (
					<Link
						href={prevHref}
						className="hit-area inline-flex items-center gap-1 text-primary text-subhead underline-offset-4 hover:underline"
					>
						<ChevronLeft className="size-4" aria-hidden="true" />
						{t("focusPrev")}
					</Link>
				) : (
					<span />
				)}
				<div className="flex items-center gap-3">
					<span
						aria-live="polite"
						className="text-footnote text-muted-foreground"
					>
						{status === "saving"
							? t("saving")
							: status === "saved"
								? t("saved")
								: ""}
					</span>
					<Button type="button" onClick={next}>
						{answer ? t("focusNext") : t("focusSkip")}
					</Button>
				</div>
			</div>

			{children && (
				<details className="group rounded-xl bg-background">
					<summary className="hit-area cursor-pointer list-none px-4 py-3 font-medium text-subhead marker:hidden">
						{t("focusMore")}
						<span className="ml-2 font-normal text-footnote text-muted-foreground">
							{t("focusMoreHint")}
						</span>
					</summary>
					<div className="px-2 pb-2">{children}</div>
				</details>
			)}
		</article>
	);
}
