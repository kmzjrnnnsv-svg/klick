"use client";

import { ChevronDown, FileText, Send, Upload } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import {
	answerQuestion,
	delegateQuestion,
	linkAnswerEvidence,
	uploadAnswerEvidence,
} from "@/app/actions/assessments";
import { importDocumentsFromEvidence } from "@/app/actions/documents";
import {
	DlpWarning,
	useUploadFeedback,
} from "@/components/entity/upload-feedback";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { AssessmentAnswer, AssessmentQuestion } from "@/db/schema/enums";
import { cn } from "@/lib/utils";

const ANSWERS: AssessmentAnswer[] = ["yes", "partial", "no", "unknown", "na"];
const ANSWER_TONE: Record<AssessmentAnswer, string> = {
	yes: "border-success/60 bg-success/10",
	partial: "border-warning/60 bg-warning/15",
	no: "border-destructive/50 bg-destructive/10",
	unknown: "border-border bg-muted",
	na: "border-border bg-muted",
};

type Doc = { id: string; title: string; fromControl?: boolean };

// Eine Frage der Gap-Analyse: Antwort (Autosave), Notiz, Begründung bei
// „nicht relevant“, Dokumente hochladen (DLP, verschlüsselt) oder
// vorhandene verknüpfen, Frage weitergeben. Status für Screenreader über
// aria-live.
export function QuestionCard({
	assessmentId,
	question,
	initial,
	statusLabel,
	frameworkNames,
	members,
	existingEvidence,
	canAnswer,
	canDelegate,
	canImportDocument,
	storageAvailable,
}: {
	assessmentId: string;
	question: AssessmentQuestion;
	initial: {
		answer: AssessmentAnswer | null;
		comment: string | null;
		naReason: string | null;
		documents: Doc[];
	};
	statusLabel: string | null;
	frameworkNames: Record<string, string>;
	members: { userId: string; name: string }[];
	existingEvidence: { id: string; title: string }[];
	canAnswer: boolean;
	canDelegate: boolean;
	canImportDocument: boolean;
	storageAvailable: boolean;
}) {
	const t = useTranslations("Assessment");
	const td = useTranslations("Dlp");
	const te = useTranslations("Evidence");
	const tc = useTranslations("Common");
	const feedback = useUploadFeedback();
	const [answer, setAnswer] = useState(initial.answer);
	const [comment, setComment] = useState(initial.comment ?? "");
	const [naReason, setNaReason] = useState(initial.naReason ?? "");
	const [docs, setDocs] = useState<Doc[]>(initial.documents);
	const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");
	const [dlp, setDlp] = useState<{ file: File; reasons: string[] } | null>(
		null,
	);
	const [dlpAck, setDlpAck] = useState(false);
	const [showMore, setShowMore] = useState(false);
	const [delegateTo, setDelegateTo] = useState("");
	const [dragOver, setDragOver] = useState(false);
	const [pending, start] = useTransition();
	const fileInput = useRef<HTMLInputElement>(null);
	const reasonRef = useRef<HTMLTextAreaElement>(null);
	const id = `q-${question.code}`;

	function save(next: {
		answer?: AssessmentAnswer | null;
		comment?: string;
		naReason?: string;
	}) {
		const a = next.answer !== undefined ? next.answer : answer;
		const reason = next.naReason ?? naReason;
		if (a === "na" && reason.trim().length < 3) {
			reasonRef.current?.focus();
			return;
		}
		setStatus("saving");
		start(async () => {
			const res = await answerQuestion({
				assessmentId,
				questionCode: question.code,
				answer: a,
				comment: (next.comment ?? comment) || undefined,
				naReason: a === "na" ? reason : undefined,
			});
			if (!res.ok) {
				setStatus("idle");
				toast.error(tc("error"));
				return;
			}
			setStatus("saved");
		});
	}

	function upload(files: readonly File[], acknowledged = false) {
		start(async () => {
			for (const file of files) {
				const fd = new FormData();
				fd.set("assessmentId", assessmentId);
				fd.set("questionCode", question.code);
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
				setDocs((d) => [...d, { id: res.data.id, title: file.name }]);
				toast.success(t("uploaded", { name: file.name }));
				if (res.data.dlpRaised)
					toast.info(
						td("raised", {
							level: te(`class_${res.data.classification}` as "class_secret"),
						}),
					);
			}
			setDlp(null);
		});
	}

	const readOnly = !canAnswer;
	const coversFrameworks = (question.frameworks ?? [])
		.map((f) => frameworkNames[f] ?? f)
		.join(", ");

	return (
		<article
			id={id}
			aria-labelledby={`${id}-title`}
			className="scroll-mt-24 rounded-md border p-4"
		>
			<header className="flex flex-col gap-1">
				<div className="flex flex-wrap items-center gap-2 text-xs">
					<span className="font-mono text-muted-foreground" translate="no">
						{question.code}
					</span>
					{statusLabel && (
						<Badge variant="muted">
							{t("currentStatus", { status: statusLabel })}
						</Badge>
					)}
				</div>
				<h3 id={`${id}-title`} className="text-pretty font-medium">
					{question.text}
				</h3>
				{question.requirements && question.requirements.length > 0 && (
					<p className="text-muted-foreground text-xs">
						{t("covers", {
							count: question.requirements.length,
							frameworks: coversFrameworks,
						})}
					</p>
				)}
			</header>

			{question.help && (
				<p className="mt-2 text-muted-foreground text-sm">{question.help}</p>
			)}

			{((question.probes?.length ?? 0) > 0 ||
				(question.evidenceHints?.length ?? 0) > 0) && (
				<div className="mt-2">
					<button
						type="button"
						className="flex items-center gap-1 text-primary text-xs hover:underline"
						aria-expanded={showMore}
						aria-controls={`${id}-more`}
						onClick={() => setShowMore((v) => !v)}
					>
						<ChevronDown
							className={cn(
								"size-3.5 transition-transform",
								showMore && "rotate-180",
							)}
							aria-hidden="true"
						/>
						{t("probes")} · {t("evidenceHints")}
					</button>
					{showMore && (
						<div
							id={`${id}-more`}
							className="mt-2 grid gap-3 text-sm sm:grid-cols-2"
						>
							{question.probes && question.probes.length > 0 && (
								<div>
									<p className="font-medium text-xs">{t("probes")}</p>
									<ul className="mt-1 list-disc pl-5 text-muted-foreground">
										{question.probes.map((p) => (
											<li key={p}>{p}</li>
										))}
									</ul>
								</div>
							)}
							{question.evidenceHints && question.evidenceHints.length > 0 && (
								<div>
									<p className="font-medium text-xs">{t("evidenceHints")}</p>
									<ul className="mt-1 list-disc pl-5 text-muted-foreground">
										{question.evidenceHints.map((h) => (
											<li key={h}>{h}</li>
										))}
									</ul>
								</div>
							)}
						</div>
					)}
				</div>
			)}

			<fieldset className="mt-4" disabled={readOnly}>
				<legend className="mb-2 font-medium text-sm">{t("question")}</legend>
				<div className="flex flex-wrap gap-2">
					{ANSWERS.map((a) => (
						<label
							key={a}
							className={cn(
								"cursor-pointer rounded-md border px-3 py-1.5 text-sm transition-colors hover:bg-muted has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring/50",
								answer === a && ANSWER_TONE[a],
								answer === a && "font-medium",
							)}
						>
							<input
								type="radio"
								className="sr-only"
								name={`answer-${question.code}`}
								value={a}
								checked={answer === a}
								onChange={() => {
									setAnswer(a);
									save({ answer: a });
								}}
							/>
							{t(`answer_${a}`)}
						</label>
					))}
				</div>
				{answer === "na" && (
					<div className="mt-3 flex flex-col gap-1.5">
						<Label htmlFor={`${id}-na`}>{t("naReason")}</Label>
						<Textarea
							id={`${id}-na`}
							ref={reasonRef}
							name="naReason"
							rows={2}
							value={naReason}
							placeholder={t("naReasonPlaceholder")}
							onChange={(e) => setNaReason(e.target.value)}
							onBlur={() => {
								if (naReason.trim() !== (initial.naReason ?? ""))
									save({ naReason });
							}}
						/>
					</div>
				)}
				<div className="mt-3 flex flex-col gap-1.5">
					<Label htmlFor={`${id}-comment`}>{t("comment")}</Label>
					<Textarea
						id={`${id}-comment`}
						name="comment"
						rows={2}
						className="min-h-16"
						value={comment}
						placeholder={t("commentPlaceholder")}
						onChange={(e) => setComment(e.target.value)}
						onBlur={() => {
							if (comment !== (initial.comment ?? "")) save({ comment });
						}}
					/>
				</div>
			</fieldset>

			<section className="mt-4 flex flex-col gap-2" aria-label={t("documents")}>
				<p className="font-medium text-sm">{t("documents")}</p>
				{docs.length > 0 && (
					<ul className="flex flex-col gap-1 text-sm">
						{docs.map((d) => (
							<li key={d.id} className="flex flex-wrap items-center gap-2">
								<FileText
									className="size-4 text-muted-foreground"
									aria-hidden="true"
								/>
								<a
									href={`/api/nachweise/${d.id}`}
									className="min-w-0 truncate hover:underline"
								>
									{d.title}
								</a>
								{d.fromControl && (
									<Badge variant="muted">{t("fromControl")}</Badge>
								)}
								{canImportDocument && !d.fromControl && (
									<Button
										type="button"
										size="sm"
										variant="ghost"
										disabled={pending}
										onClick={() =>
											start(async () => {
												const res = await importDocumentsFromEvidence([
													{ evidenceId: d.id },
												]);
												if (!res.ok) toast.error(tc("error"));
												else toast.success(t("asDocumentDone"));
											})
										}
									>
										{t("asDocument")}
									</Button>
								)}
							</li>
						))}
					</ul>
				)}
				{!readOnly && storageAvailable && (
					<section
						aria-label={t("dropHere")}
						className={cn(
							"flex flex-col items-start gap-2 rounded-md border border-dashed p-3 text-sm",
							dragOver && "border-primary bg-primary/5",
						)}
						onDragOver={(e) => {
							e.preventDefault();
							setDragOver(true);
						}}
						onDragLeave={() => setDragOver(false)}
						onDrop={(e) => {
							e.preventDefault();
							setDragOver(false);
							const files = [...e.dataTransfer.files];
							if (files.length > 0) upload(files);
						}}
					>
						<div className="flex flex-wrap items-center gap-2">
							<Button
								type="button"
								size="sm"
								variant="outline"
								disabled={pending}
								onClick={() => fileInput.current?.click()}
							>
								<Upload aria-hidden="true" />
								{pending ? t("uploading") : t("upload")}
							</Button>
							<span className="text-muted-foreground text-xs">
								{t("dropHere")}
							</span>
						</div>
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
						<p className="text-muted-foreground text-xs">{t("uploadHint")}</p>
						{dlp && (
							<div className="flex w-full flex-col gap-2">
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
				{!readOnly && existingEvidence.length > 0 && (
					<label className="flex flex-col gap-1 text-xs sm:flex-row sm:items-center sm:gap-2">
						<span className="text-muted-foreground">{t("linkExisting")}</span>
						<select
							className="rounded-md border bg-background px-2 py-1 text-foreground text-sm"
							value=""
							disabled={pending}
							onChange={(e) => {
								const evidenceId = e.target.value;
								if (!evidenceId) return;
								const title =
									existingEvidence.find((x) => x.id === evidenceId)?.title ??
									"";
								start(async () => {
									const res = await linkAnswerEvidence({
										assessmentId,
										questionCode: question.code,
										evidenceId,
									});
									if (!res.ok) return void toast.error(tc("error"));
									setDocs((d) => [...d, { id: evidenceId, title }]);
									toast.success(t("linked"));
								});
							}}
						>
							<option value="">{t("linkExistingPick")}</option>
							{existingEvidence.map((e) => (
								<option key={e.id} value={e.id}>
									{e.title}
								</option>
							))}
						</select>
					</label>
				)}
				{question.templates &&
					question.templates.length > 0 &&
					docs.length === 0 && (
						<p className="text-muted-foreground text-xs">
							{t("noTemplate")}{" "}
							<a href="/dokumente" className="text-primary hover:underline">
								{t("useTemplate")}
							</a>{" "}
							<span translate="no">({question.templates.join(", ")})</span>
						</p>
					)}
			</section>

			{canDelegate && members.length > 0 && (
				<div className="mt-4 flex flex-wrap items-center gap-2 border-t pt-3 text-xs">
					<label className="flex items-center gap-2">
						<span className="text-muted-foreground">{t("delegateTo")}</span>
						<select
							className="rounded-md border bg-background px-2 py-1 text-foreground text-sm"
							value={delegateTo}
							onChange={(e) => setDelegateTo(e.target.value)}
						>
							<option value="">—</option>
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
						variant="ghost"
						disabled={!delegateTo || pending}
						onClick={() =>
							start(async () => {
								const res = await delegateQuestion({
									assessmentId,
									questionCode: question.code,
									assigneeUserId: delegateTo,
								});
								if (!res.ok) return void toast.error(tc("error"));
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
			<p aria-live="polite" className="mt-2 h-4 text-muted-foreground text-xs">
				{status === "saving"
					? t("saving")
					: status === "saved"
						? t("saved")
						: ""}
			</p>
		</article>
	);
}
