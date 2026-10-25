"use client";

import { FileText, LogOut, Upload, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, useTransition } from "react";
import {
	answerAsSupplier,
	detachSupplierFile,
	submitAsSupplier,
	uploadAsSupplier,
} from "@/app/actions/supplier-portal";
import {
	DlpWarning,
	useUploadFeedback,
} from "@/components/entity/upload-feedback";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import type { AssessmentAnswer, AssessmentQuestion } from "@/db/schema/enums";
import { cn } from "@/lib/utils";

const TOKEN_RE = /^klk_portal_[A-Za-z0-9_-]{20,}$/;

// Tauscht den Token aus dem URL-Fragment gegen das Portal-Cookie und
// entfernt ihn sofort aus Adresse und Verlauf. Ohne Fragment: Hinweis, dass
// der Link fehlt oder abgelaufen ist.
export function PortalSession({
	state,
}: {
	state: "session" | "none" | "expired";
}) {
	const t = useTranslations("Portal");
	const router = useRouter();
	const [phase, setPhase] = useState<"idle" | "opening" | "failed">("idle");
	const [error, setError] = useState<string | null>(null);
	useEffect(() => {
		const raw = window.location.hash.slice(1);
		if (!TOKEN_RE.test(raw)) return;
		window.history.replaceState(null, "", "/lieferant");
		setPhase("opening");
		fetch("/api/lieferant/sitzung", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ token: raw }),
			credentials: "same-origin",
		})
			.then(async (res) => {
				if (res.status === 204) {
					router.refresh();
					setPhase("idle");
					return;
				}
				const body = (await res.json().catch(() => null)) as {
					error?: string;
				} | null;
				setError(body?.error ?? "invalid");
				setPhase("failed");
			})
			.catch(() => {
				setError("network");
				setPhase("failed");
			});
	}, [router]);

	if (state === "session" && phase !== "failed") return null;
	if (phase === "opening")
		return (
			<p aria-live="polite" className="text-muted-foreground text-subhead">
				{t("opening")}
			</p>
		);
	const reason =
		phase === "failed"
			? error === "expired"
				? "expired"
				: error === "revoked"
					? "revoked"
					: error === "rate_limited"
						? "rate_limited"
						: "invalid"
			: state === "expired"
				? "expired"
				: "missing";
	return (
		<div role="alert" className="flex flex-col gap-2 rounded-2xl bg-card p-4">
			<h2 className="font-medium">{t(`noAccess_${reason}`)}</h2>
			<p className="text-muted-foreground text-subhead">{t("noAccessLead")}</p>
		</div>
	);
}

export function PortalLogout() {
	const t = useTranslations("Portal");
	const router = useRouter();
	const [pending, start] = useTransition();
	return (
		<Button
			size="sm"
			variant="ghost"
			disabled={pending}
			onClick={() =>
				start(async () => {
					await fetch("/api/lieferant/sitzung", {
						method: "DELETE",
						credentials: "same-origin",
					}).catch(() => null);
					router.refresh();
				})
			}
		>
			<LogOut aria-hidden="true" />
			{t("logout")}
		</Button>
	);
}

const ANSWERS: AssessmentAnswer[] = ["yes", "partial", "no", "na"];
const ANSWER_TONE: Record<AssessmentAnswer, string> = {
	yes: "border-success/60 bg-success/10",
	partial: "border-warning/60 bg-warning/15",
	no: "border-destructive/50 bg-destructive/10",
	unknown: "border-border bg-muted",
	na: "border-border bg-muted",
};

type PortalFile = { id: string; name: string };

// Eine Frage im Portal: Antwort mit Autosave, Erläuterung, Dateien.
// Bewusst schlanker als intern: keine Verknüpfung mit vorhandenen
// Nachweisen, kein Download, keine Bewertungsnotizen.
export function PortalQuestion({
	question,
	initial,
	readOnly,
}: {
	question: AssessmentQuestion;
	initial: {
		answer: AssessmentAnswer | null;
		comment: string | null;
		naReason: string | null;
		files: PortalFile[];
		clarify: boolean;
	};
	readOnly: boolean;
}) {
	const t = useTranslations("Portal");
	const ta = useTranslations("Assessment");
	const td = useTranslations("Dlp");
	const tc = useTranslations("Common");
	const feedback = useUploadFeedback();
	const [answer, setAnswer] = useState(initial.answer);
	const [comment, setComment] = useState(initial.comment ?? "");
	const [naReason, setNaReason] = useState(initial.naReason ?? "");
	const [files, setFiles] = useState<PortalFile[]>(initial.files);
	const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");
	const [dlp, setDlp] = useState<{ file: File; reasons: string[] } | null>(
		null,
	);
	const [dlpAck, setDlpAck] = useState(false);
	const [pending, start] = useTransition();
	const fileInput = useRef<HTMLInputElement>(null);
	const reasonRef = useRef<HTMLTextAreaElement>(null);
	const id = `q-${question.code}`;

	function failText(error: string): string {
		if (error === "locked") return t("locked");
		if (error === "unauthenticated" || error === "access_expired")
			return t("sessionExpired");
		return tc("error");
	}

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
			const res = await answerAsSupplier({
				questionCode: question.code,
				answer: a,
				comment: (next.comment ?? comment) || undefined,
				naReason: a === "na" ? reason : undefined,
			});
			if (!res.ok) {
				setStatus("idle");
				toast.error(failText(res.error));
				return;
			}
			setStatus("saved");
		});
	}

	function upload(list: readonly File[], acknowledged = false) {
		start(async () => {
			for (const file of list) {
				const big = feedback.tooLarge(file);
				if (big) {
					toast.error(big);
					continue;
				}
				const fd = new FormData();
				fd.set("questionCode", question.code);
				fd.set("file", file);
				if (acknowledged) fd.set("dlpAcknowledged", "1");
				const res = await uploadAsSupplier(fd);
				if (!res.ok) {
					const warn = feedback.dlpWarning(res);
					if (warn) {
						setDlp({ file, reasons: warn });
						setDlpAck(false);
						return;
					}
					const text =
						res.error === "locked" ||
						res.error === "unauthenticated" ||
						res.error === "access_expired"
							? failText(res.error)
							: feedback.errorText(res);
					toast.error(`${file.name}: ${text}`);
					continue;
				}
				setFiles((f) => [...f, { id: res.data.id, name: res.data.name }]);
				toast.success(ta("uploaded", { name: file.name }));
			}
			setDlp(null);
		});
	}

	return (
		<article
			id={id}
			aria-labelledby={`${id}-title`}
			className={cn(
				"scroll-mt-24 rounded-2xl bg-card p-4",
				initial.clarify && "border-warning/60",
			)}
		>
			<header className="flex flex-col gap-1">
				<div className="flex flex-wrap items-center gap-2 text-footnote">
					<span className="font-mono text-muted-foreground" translate="no">
						{question.code}
					</span>
					{question.critical && (
						<Badge variant="outline">{t("critical")}</Badge>
					)}
					{initial.clarify && <Badge variant="warning">{t("clarify")}</Badge>}
				</div>
				<h3 id={`${id}-title`} className="text-pretty font-medium">
					{question.text}
				</h3>
			</header>
			{question.help && (
				<p className="mt-2 text-muted-foreground text-subhead">
					{question.help}
				</p>
			)}
			{question.evidenceHints && question.evidenceHints.length > 0 && (
				<p className="mt-2 text-muted-foreground text-footnote">
					{t("evidenceHints", { list: question.evidenceHints.join(", ") })}
				</p>
			)}

			<fieldset className="mt-4" disabled={readOnly}>
				<legend className="sr-only">{question.text}</legend>
				<div className="flex flex-wrap gap-2">
					{ANSWERS.map((a) => (
						<label
							key={a}
							className={cn(
								"cursor-pointer rounded-xl bg-card px-3 py-1.5 text-subhead transition-colors hover:bg-muted has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring/50",
								answer === a && ANSWER_TONE[a],
								answer === a && "font-medium",
								readOnly && "cursor-default",
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

			<section className="mt-4 flex flex-col gap-2" aria-label={t("files")}>
				{files.length > 0 && (
					<ul className="flex flex-col gap-1 text-subhead">
						{files.map((f) => (
							<li key={f.id} className="flex items-center gap-2">
								<FileText
									className="size-4 shrink-0 text-muted-foreground"
									aria-hidden="true"
								/>
								<span className="min-w-0 truncate">{f.name}</span>
								{!readOnly && (
									<Button
										type="button"
										size="icon-sm"
										variant="ghost"
										aria-label={t("detach", { name: f.name })}
										disabled={pending}
										onClick={() =>
											start(async () => {
												const res = await detachSupplierFile({
													questionCode: question.code,
													evidenceId: f.id,
												});
												if (!res.ok)
													return void toast.error(failText(res.error));
												setFiles((x) => x.filter((y) => y.id !== f.id));
											})
										}
									>
										<X aria-hidden="true" />
									</Button>
								)}
							</li>
						))}
					</ul>
				)}
				{!readOnly && (
					<div className="flex flex-col items-start gap-2">
						<Button
							type="button"
							size="sm"
							variant="outline"
							disabled={pending}
							onClick={() => fileInput.current?.click()}
						>
							<Upload aria-hidden="true" />
							{pending ? ta("uploading") : t("upload")}
						</Button>
						<input
							ref={fileInput}
							type="file"
							multiple
							className="sr-only"
							aria-label={t("upload")}
							accept=".pdf,.docx,.xlsx,.pptx,.png,.jpg,.jpeg,.txt,.md,.csv,.json"
							onChange={(e) => {
								const list = [...(e.target.files ?? [])];
								e.target.value = "";
								if (list.length > 0) upload(list);
							}}
						/>
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
					</div>
				)}
			</section>
			<p
				aria-live="polite"
				className="mt-2 h-4 text-muted-foreground text-footnote"
			>
				{status === "saving"
					? ta("saving")
					: status === "saved"
						? ta("saved")
						: ""}
			</p>
		</article>
	);
}

export function PortalSubmit({
	unanswered,
	organization,
}: {
	unanswered: number;
	organization: string;
}) {
	const t = useTranslations("Portal");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [pending, start] = useTransition();
	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button>{t("submit")}</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>{t("submitTitle")}</DialogTitle>
					<DialogDescription>
						{t("submitLead", { organization })}
					</DialogDescription>
				</DialogHeader>
				{unanswered > 0 && (
					<p role="alert" className="text-subhead">
						{t("submitOpen", { n: unanswered })}
					</p>
				)}
				<DialogFooter>
					<Button variant="outline" onClick={() => setOpen(false)}>
						{tc("cancel")}
					</Button>
					<Button
						disabled={pending}
						onClick={() =>
							start(async () => {
								const res = await submitAsSupplier();
								if (!res.ok)
									return void toast.error(
										res.error === "locked" ? t("locked") : t("sessionExpired"),
									);
								toast.success(t("submitted"));
								setOpen(false);
								router.refresh();
							})
						}
					>
						{pending ? tc("working") : t("submit")}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
