"use client";

import { Gavel } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
	createDecisionRequest,
	uploadDecisionAttachment,
} from "@/app/actions/decisions";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { EntityKind } from "@/db/schema/enums";

// „Entscheidung anfragen“ (E2): Frage an die Geschäftsleitung mit
// Ausgangslage, Empfehlung, Optionen und Frist. Bezug zur Entität und zu
// Rahmenwerk-Anforderungen ist vorbelegt; die Entscheidung wird ein
// Beschluss.
export function DecisionRequestButton({
	linkedEntityType,
	linkedEntityId,
	defaultQuestion,
	refs,
	soloHint,
	approverHint,
	canAttach = false,
	variant = "outline",
}: {
	linkedEntityType?: EntityKind;
	linkedEntityId?: string;
	defaultQuestion?: string;
	// vorbelegte Anforderungen (Anzeige; der Server leitet sie erneut ab)
	refs?: { frameworks: string[]; requirementKeys: string[] };
	soloHint?: boolean;
	// niemand (außer dir) in der Geschäftsleitung → Hinweis vor dem Absenden
	approverHint?: "none" | "only_you" | null;
	// Unterlagen anhängen (nur mit Objektspeicher)
	canAttach?: boolean;
	variant?: "outline" | "brown";
}) {
	const t = useTranslations("Decisions");
	const tc = useTranslations("Common");
	const tr = useTranslations("Resolutions");
	const ts = useTranslations("Status");
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [pending, start] = useTransition();
	const [question, setQuestion] = useState(defaultQuestion ?? "");
	const [context, setContext] = useState("");
	const [recommendation, setRecommendation] = useState("");
	const [options, setOptions] = useState("");
	const [dueAt, setDueAt] = useState("");
	const [solo, setSolo] = useState("");
	const [files, setFiles] = useState<File[]>([]);
	// angelegt, Unterlagen stehen noch aus (z. B. nach DLP-Warnung)
	const [createdId, setCreatedId] = useState<string | null>(null);
	const [dlpReasons, setDlpReasons] = useState<string[] | null>(null);
	const [dlpAck, setDlpAck] = useState(false);
	const up = useUploadFeedback();

	function reset() {
		setOpen(false);
		setQuestion(defaultQuestion ?? "");
		setContext("");
		setRecommendation("");
		setOptions("");
		setDueAt("");
		setFiles([]);
		setCreatedId(null);
		setDlpReasons(null);
		setDlpAck(false);
		router.refresh();
	}

	// Unterlagen nacheinander über die Pipeline; DLP-Warnung → Rückfrage
	async function uploadAll(id: string): Promise<boolean> {
		const remaining: File[] = [];
		const reasons: string[] = [];
		let done = 0;
		for (const f of files) {
			const fd = new FormData();
			fd.set("decisionRequestId", id);
			fd.set("file", f);
			if (dlpAck) fd.set("dlpAcknowledged", "1");
			const res = await uploadDecisionAttachment(fd);
			if (res.ok) {
				done += 1;
				continue;
			}
			const warn = up.dlpWarning(res);
			if (warn) {
				remaining.push(f);
				reasons.push(...warn);
			} else
				toast.error(
					`${t("attachmentFailed", { name: f.name })} ${up.errorText(res)}`,
				);
		}
		if (done > 0) toast.success(t("attachmentsUploaded", { n: done }));
		if (remaining.length > 0) {
			setFiles(remaining);
			setDlpReasons(reasons);
			setDlpAck(false);
			return false;
		}
		return true;
	}

	function submit(e: React.FormEvent) {
		e.preventDefault();
		start(async () => {
			if (createdId) {
				if (await uploadAll(createdId)) reset();
				return;
			}
			const res = await createDecisionRequest({
				question,
				context: context || undefined,
				recommendation: recommendation || undefined,
				options: options
					.split("\n")
					.map((o) => o.trim())
					.filter(Boolean),
				dueAt: dueAt || undefined,
				linkedEntityType,
				linkedEntityId,
				requirementKeys: refs?.requirementKeys ?? [],
				selfApprovalReason: solo || undefined,
			});
			if (!res.ok) {
				toast.error(
					res.error === "no_approver" ||
						res.error === "solo_reason_required" ||
						res.error === "solo_not_allowed"
						? ts(`approvalError_${res.error}`)
						: tc("error"),
				);
				return;
			}
			toast.success(
				res.data.status === "approved"
					? t("createdSolo", { code: res.data.code })
					: t("created", { code: res.data.code }),
			);
			if (files.length > 0) {
				setCreatedId(res.data.id);
				if (!(await uploadAll(res.data.id))) return;
			}
			reset();
		});
	}

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button variant={variant} size="sm">
					<Gavel className="size-3.5" aria-hidden />
					{t("ask")}
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-xl">
				<form onSubmit={submit} className="flex flex-col gap-4">
					<DialogHeader>
						<DialogTitle>{t("title")}</DialogTitle>
						<DialogDescription>{t("lead")}</DialogDescription>
					</DialogHeader>
					{approverHint && (
						<p
							role="note"
							className="rounded-md border border-warning/40 bg-warning/10 p-3 text-sm"
						>
							{t(approverHint === "none" ? "hintNone" : "hintOnlyYou")}{" "}
							<Link
								href="/organisation?tab=rollen"
								className="text-primary underline-offset-4 hover:underline"
							>
								{t("hintLink")}
							</Link>
						</p>
					)}
					<div className="grid gap-2">
						<Label htmlFor="dr-q">{t("question")}</Label>
						<Input
							id="dr-q"
							required
							minLength={5}
							maxLength={300}
							value={question}
							onChange={(e) => setQuestion(e.target.value)}
						/>
					</div>
					<div className="grid gap-2">
						<Label htmlFor="dr-ctx">{t("context")}</Label>
						<Textarea
							id="dr-ctx"
							rows={3}
							value={context}
							onChange={(e) => setContext(e.target.value)}
						/>
					</div>
					<div className="grid gap-2">
						<Label htmlFor="dr-rec">{t("recommendation")}</Label>
						<Textarea
							id="dr-rec"
							rows={2}
							value={recommendation}
							onChange={(e) => setRecommendation(e.target.value)}
						/>
					</div>
					<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
						<div className="grid gap-2">
							<Label htmlFor="dr-opt">{t("options")}</Label>
							<Textarea
								id="dr-opt"
								rows={3}
								placeholder={t("optionsHint")}
								value={options}
								onChange={(e) => setOptions(e.target.value)}
							/>
						</div>
						<div className="grid content-start gap-2">
							<Label htmlFor="dr-due">{t("dueAt")}</Label>
							<Input
								id="dr-due"
								type="date"
								value={dueAt}
								onChange={(e) => setDueAt(e.target.value)}
							/>
						</div>
					</div>
					{refs && refs.requirementKeys.length > 0 && (
						<div className="flex flex-col gap-1">
							<p className="text-muted-foreground text-xs">{t("refs")}</p>
							<div className="flex flex-wrap gap-1">
								{refs.requirementKeys.map((k) => (
									<Badge key={k} variant="muted" className="font-mono">
										{k.replace(":", " ")}
									</Badge>
								))}
							</div>
						</div>
					)}
					{canAttach && (
						<div className="grid gap-2">
							<Label htmlFor="dr-files">{t("attachments")}</Label>
							<Input
								id="dr-files"
								type="file"
								multiple
								disabled={Boolean(createdId)}
								accept=".pdf,.docx,.xlsx,.pptx,.png,.jpg,.jpeg,.txt,.csv"
								onChange={(e) => {
									const picked = [...(e.target.files ?? [])];
									const big = picked.filter((f) => up.tooLarge(f));
									for (const f of big)
										toast.error(
											`${t("attachmentFailed", { name: f.name })} ${up.tooLarge(f)}`,
										);
									setFiles(picked.filter((f) => !up.tooLarge(f)).slice(0, 10));
								}}
							/>
							<p className="text-muted-foreground text-xs">
								{t("attachmentsHint")}
							</p>
							{files.length > 0 && (
								<ul className="flex flex-col gap-0.5 text-xs">
									{files.map((f) => (
										<li key={`${f.name}-${f.size}`} className="truncate">
											{f.name}
										</li>
									))}
								</ul>
							)}
							{dlpReasons && (
								<DlpWarning
									id="dr-dlp"
									reasons={dlpReasons}
									acknowledged={dlpAck}
									onAcknowledge={setDlpAck}
								/>
							)}
						</div>
					)}
					{soloHint && (
						<div className="grid gap-2">
							<Label htmlFor="dr-solo">{tr("soloReason")}</Label>
							<Textarea
								id="dr-solo"
								rows={2}
								value={solo}
								onChange={(e) => setSolo(e.target.value)}
							/>
						</div>
					)}
					<DialogFooter>
						<Button
							type="button"
							variant="ghost"
							onClick={() => (createdId ? reset() : setOpen(false))}
						>
							{tc("cancel")}
						</Button>
						<Button
							type="submit"
							disabled={
								pending ||
								question.trim().length < 5 ||
								(Boolean(dlpReasons) && !dlpAck)
							}
						>
							{createdId ? t("uploadRest") : t("submit")}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
