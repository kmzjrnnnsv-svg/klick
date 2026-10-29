"use client";

import { Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import {
	aiCheckEvidence,
	aiCompareDocument,
	aiCompareEvidence,
} from "@/app/actions/ai";
import { addComment } from "@/app/actions/comments";
import { updateDocument } from "@/app/actions/documents";
import { withStepUp } from "@/components/auth/step-up-dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import type { AiAnswer } from "@/lib/ai/service";
import { AiAnswerCard, useAiError } from "./ai-answer";

// Knöpfe der KI-Funktionen (ADR-032). Erscheinen nur, wenn die Seite die
// Funktion für verfügbar hält (aiAvailability); vertrauliche Inhalte
// verlangen vorher die Bestätigung im Dialog (withStepUp).

type CompareTarget =
	| { kind: "document"; docNumber: string; from: string; to: string }
	| { kind: "evidence"; evidenceId: string };

function useAiRun() {
	const [answer, setAnswer] = useState<AiAnswer | null>(null);
	const [pending, start] = useTransition();
	const fail = useAiError();
	const run = (
		call: () => Promise<
			{ ok: true; data: AiAnswer } | { ok: false; error: string; ref?: string }
		>,
	) =>
		start(async () => {
			const res = await withStepUp(call);
			if (!res.ok) {
				toast.error(fail(res));
				return;
			}
			setAnswer(res.data);
		});
	return { answer, setAnswer, pending, run };
}

function AiButton({
	label,
	pending,
	onClick,
}: {
	label: string;
	pending: boolean;
	onClick: () => void;
}) {
	const t = useTranslations("Ai");
	return (
		<Button
			type="button"
			size="sm"
			variant="secondary"
			disabled={pending}
			aria-busy={pending}
			onClick={onClick}
		>
			<Sparkles aria-hidden="true" className="text-primary" />
			{pending ? t("working") : label}
		</Button>
	);
}

// Fassungsvergleich: „Mit KI zusammenfassen“; an der Arbeitskopie eines
// Entwurfs zusätzlich „Als Änderungsnotiz übernehmen“
export function AiCompare({
	target,
	noteFor,
}: {
	target: CompareTarget;
	noteFor?: { documentId: string };
}) {
	const t = useTranslations("Ai");
	const router = useRouter();
	const fail = useAiError();
	const { answer, setAnswer, pending, run } = useAiRun();
	const [note, setNote] = useState<string | null>(null);
	const [saving, startSave] = useTransition();
	return (
		<div className="flex flex-col gap-3">
			<div>
				<AiButton
					label={t("compareButton")}
					pending={pending}
					onClick={() =>
						run(() =>
							target.kind === "document"
								? aiCompareDocument({
										docNumber: target.docNumber,
										from: target.from,
										to: target.to,
									})
								: aiCompareEvidence({ evidenceId: target.evidenceId }),
						)
					}
				/>
			</div>
			{answer && (
				<AiAnswerCard
					answer={answer}
					onClose={() => {
						setAnswer(null);
						setNote(null);
					}}
				>
					{noteFor && note === null && (
						<Button
							type="button"
							size="sm"
							onClick={() => setNote(answer.text.slice(0, 2000))}
						>
							{t("useAsNote")}
						</Button>
					)}
				</AiAnswerCard>
			)}
			{answer && noteFor && note !== null && (
				<form
					className="flex flex-col gap-2"
					onSubmit={(e) => {
						e.preventDefault();
						startSave(async () => {
							const res = await updateDocument({
								documentId: noteFor.documentId,
								changeSummary: note,
							});
							if (!res.ok) {
								toast.error(fail(res));
								return;
							}
							toast.success(t("noteSaved"));
							setNote(null);
							setAnswer(null);
							router.refresh();
						});
					}}
				>
					<Label htmlFor="ai-note">{t("noteLabel")}</Label>
					<p className="text-footnote text-muted-foreground">{t("noteLead")}</p>
					<Textarea
						id="ai-note"
						value={note}
						maxLength={2000}
						rows={6}
						onChange={(e) => setNote(e.target.value)}
					/>
					<div className="flex gap-2">
						<Button
							type="submit"
							size="sm"
							disabled={saving || note.trim().length < 3}
							aria-busy={saving}
						>
							{saving ? t("saving") : t("noteSave")}
						</Button>
						<Button
							type="button"
							size="sm"
							variant="ghost"
							onClick={() => setNote(null)}
						>
							{t("cancel")}
						</Button>
					</div>
				</form>
			)}
		</div>
	);
}

// Nachweis gegen die Anforderungen der verknüpften Controls prüfen;
// Ergebnis optional als Kommentar mit Kennzeichen „KI-Hinweis“
export function AiEvidenceCheck({
	evidenceId,
	canComment,
}: {
	evidenceId: string;
	canComment: boolean;
}) {
	const t = useTranslations("Ai");
	const ts = useTranslations("AiSettings");
	const router = useRouter();
	const fail = useAiError();
	const { answer, setAnswer, pending, run } = useAiRun();
	const [saving, startSave] = useTransition();
	return (
		<div className="flex flex-col gap-3">
			<div>
				<AiButton
					label={t("checkButton")}
					pending={pending}
					onClick={() => run(() => aiCheckEvidence({ evidenceId }))}
				/>
			</div>
			{answer && (
				<AiAnswerCard answer={answer} onClose={() => setAnswer(null)}>
					{canComment && (
						<Button
							type="button"
							size="sm"
							disabled={saving}
							aria-busy={saving}
							onClick={() =>
								startSave(async () => {
									const key =
										`provider_${answer.provider}` as "provider_anthropic";
									const head = t("commentPrefix", {
										provider: ts.has(key) ? ts(key) : answer.provider,
										model: answer.model,
									});
									// kein „@“ aus der Antwort (es soll niemand erwähnt werden); einfache
									// Zeilenumbrüche bleiben als Umbruch erhalten
									const body = `**${head}**\n\n${answer.text.replace(/@/g, "＠").replace(/\n(?!\n)/g, "  \n")}`;
									const res = await addComment(
										{
											entityType: "evidence",
											entityId: evidenceId,
											bodyMarkdown: body.slice(0, 10_000),
										},
										`/nachweise/${evidenceId}`,
									);
									if (!res.ok) {
										toast.error(fail(res));
										return;
									}
									toast.success(t("commentSaved"));
									setAnswer(null);
									router.refresh();
								})
							}
						>
							{saving ? t("saving") : t("saveComment")}
						</Button>
					)}
				</AiAnswerCard>
			)}
		</div>
	);
}
