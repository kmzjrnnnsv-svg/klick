"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import {
	closeAccessReviewAction,
	confirmAllOpenAction,
	createAccessReviewEvidence,
	decideAccessReviewItemAction,
	startAccessReviewAction,
} from "@/app/actions/identity-review";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-alert";
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
import { FormAlert } from "@/components/ui/form-alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import {
	REVIEW_NOTE_MIN,
	REVIEW_SCOPES,
	type ReviewDecision,
	type ReviewScope,
} from "@/lib/identity/review-rules";

// Fehler der Zugriffsprüfung mit eigenem Satz
const OWN = [
	"identity_review_open",
	"identity_review_empty",
	"identity_review_too_many",
	"identity_review_closed",
	"identity_review_incomplete",
	"identity_note_required",
	"identity_not_member",
] as const;

function useFail() {
	const t = useTranslations("AccessReview");
	const tc = useTranslations("Common");
	return (res: { error?: string; ref?: string }) =>
		res.error && (OWN as readonly string[]).includes(res.error)
			? t(`err_${res.error.replace(/^identity_/, "")}` as "err_review_open")
			: errorText(tc, res);
}

// Zugriffsprüfung starten: Quelle, Umfang, Prüfer:in, Frist
export function StartReviewDialog({
	sources,
	reviewers,
	defaultReviewer,
	defaultTitle,
	disabled,
}: {
	sources: { id: string; label: string }[];
	reviewers: { userId: string; label: string }[];
	defaultReviewer: string;
	defaultTitle: string;
	disabled?: boolean;
}) {
	const t = useTranslations("AccessReview");
	const fail = useFail();
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [pending, start] = useTransition();
	const [sourceId, setSourceId] = useState(sources[0]?.id ?? "");
	const [scope, setScope] = useState<ReviewScope>("all");
	const [reviewer, setReviewer] = useState(defaultReviewer);
	const [title, setTitle] = useState(defaultTitle);
	const [dueAt, setDueAt] = useState("");
	const [error, setError] = useState<string | null>(null);
	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button disabled={disabled}>{t("start")}</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-lg">
				<form
					className="flex flex-col gap-4"
					onSubmit={(e) => {
						e.preventDefault();
						start(async () => {
							setError(null);
							const res = await startAccessReviewAction({
								sourceId,
								title,
								dueAt,
								scope,
								reviewerUserId: reviewer,
							});
							if (!res.ok) return setError(fail(res));
							toast.success(t("started", { n: res.data.items }));
							setOpen(false);
							router.push(`/team/zugriffspruefung/${res.data.id}`);
						});
					}}
				>
					<DialogHeader>
						<DialogTitle>{t("startTitle")}</DialogTitle>
						<DialogDescription>{t("startLead")}</DialogDescription>
					</DialogHeader>
					<div className="grid gap-2">
						<Label htmlFor="ar-title">{t("fieldTitle")}</Label>
						<Input
							id="ar-title"
							name="title"
							required
							minLength={3}
							maxLength={200}
							value={title}
							onChange={(e) => setTitle(e.target.value)}
							autoComplete="off"
						/>
					</div>
					{sources.length > 1 && (
						<div className="grid gap-2">
							<Label htmlFor="ar-source">{t("fieldSource")}</Label>
							<Select value={sourceId} onValueChange={setSourceId}>
								<SelectTrigger id="ar-source">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{sources.map((s) => (
										<SelectItem key={s.id} value={s.id}>
											{s.label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
					)}
					<div className="grid gap-2">
						<Label htmlFor="ar-scope">{t("fieldScope")}</Label>
						<Select
							value={scope}
							onValueChange={(v) => setScope(v as ReviewScope)}
						>
							<SelectTrigger id="ar-scope">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{REVIEW_SCOPES.map((s) => (
									<SelectItem key={s} value={s}>
										{t(`scope_${s}`)}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
					<div className="grid gap-2">
						<Label htmlFor="ar-reviewer">{t("fieldReviewer")}</Label>
						<Select value={reviewer} onValueChange={setReviewer}>
							<SelectTrigger id="ar-reviewer">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{reviewers.map((r) => (
									<SelectItem key={r.userId} value={r.userId}>
										{r.label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
					<div className="grid gap-2">
						<Label htmlFor="ar-due">{t("fieldDue")}</Label>
						<Input
							id="ar-due"
							name="dueAt"
							type="date"
							value={dueAt}
							onChange={(e) => setDueAt(e.target.value)}
							autoComplete="off"
						/>
					</div>
					<FormAlert message={error} />
					<DialogFooter>
						<Button type="submit" disabled={pending || !sourceId || !reviewer}>
							{pending ? t("starting") : t("start")}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

// Entscheidung je Konto: bestätigen sofort, anpassen und entziehen mit Notiz
export function DecisionButtons({
	itemId,
	current,
}: {
	itemId: string;
	current: ReviewDecision | null;
}) {
	const t = useTranslations("AccessReview");
	const fail = useFail();
	const router = useRouter();
	const [pending, start] = useTransition();
	const [ask, setAsk] = useState<"adjust" | "revoke" | null>(null);
	const [note, setNote] = useState("");
	const [error, setError] = useState<string | null>(null);
	const decide = (decision: ReviewDecision, text: string | null) =>
		start(async () => {
			setError(null);
			const res = await decideAccessReviewItemAction({
				itemId,
				decision,
				note: text ?? undefined,
			});
			if (!res.ok) {
				const msg = fail(res);
				if (ask) setError(msg);
				else toast.error(msg);
				return;
			}
			setAsk(null);
			setNote("");
			router.refresh();
		});
	return (
		<>
			<span className="inline-flex flex-wrap gap-1">
				<Button
					type="button"
					size="sm"
					variant={current === "confirm" ? "default" : "secondary"}
					aria-pressed={current === "confirm"}
					disabled={pending}
					onClick={() => decide("confirm", null)}
				>
					{t("confirm")}
				</Button>
				<Button
					type="button"
					size="sm"
					variant={current === "adjust" ? "default" : "secondary"}
					aria-pressed={current === "adjust"}
					disabled={pending}
					onClick={() => setAsk("adjust")}
				>
					{t("adjust")}
				</Button>
				<Button
					type="button"
					size="sm"
					variant={current === "revoke" ? "destructive" : "secondary"}
					aria-pressed={current === "revoke"}
					disabled={pending}
					onClick={() => setAsk("revoke")}
				>
					{t("revoke")}
				</Button>
			</span>
			<Dialog open={ask !== null} onOpenChange={(o) => !o && setAsk(null)}>
				<DialogContent className="sm:max-w-md">
					<form
						className="flex flex-col gap-4"
						onSubmit={(e) => {
							e.preventDefault();
							if (ask) decide(ask, note);
						}}
					>
						<DialogHeader>
							<DialogTitle>
								{ask === "revoke" ? t("revokeTitle") : t("adjustTitle")}
							</DialogTitle>
							<DialogDescription>
								{ask === "revoke" ? t("revokeLead") : t("adjustLead")}
							</DialogDescription>
						</DialogHeader>
						<div className="grid gap-2">
							<Label htmlFor={`note-${itemId}`}>{t("note")}</Label>
							<Textarea
								id={`note-${itemId}`}
								required
								minLength={REVIEW_NOTE_MIN}
								maxLength={1000}
								rows={3}
								value={note}
								onChange={(e) => setNote(e.target.value)}
								placeholder={
									ask === "revoke"
										? t("revokePlaceholder")
										: t("adjustPlaceholder")
								}
							/>
						</div>
						<FormAlert message={error} />
						<DialogFooter>
							<Button
								type="submit"
								variant={ask === "revoke" ? "destructive" : "default"}
								disabled={pending || note.trim().length < REVIEW_NOTE_MIN}
							>
								{ask === "revoke" ? t("revoke") : t("adjust")}
							</Button>
						</DialogFooter>
					</form>
				</DialogContent>
			</Dialog>
		</>
	);
}

export function ConfirmAllButton({
	reviewId,
	count,
}: {
	reviewId: string;
	count: number;
}) {
	const t = useTranslations("AccessReview");
	const fail = useFail();
	const router = useRouter();
	const [pending, start] = useTransition();
	const confirm = useConfirm({
		title: t("confirmAllTitle", { n: count }),
		description: t("confirmAllLead"),
		confirmLabel: t("confirmAll"),
	});
	return (
		<>
			<Button
				type="button"
				variant="secondary"
				disabled={pending || count === 0}
				onClick={() =>
					confirm.ask(() =>
						start(async () => {
							const res = await confirmAllOpenAction({ reviewId });
							if (!res.ok) return void toast.error(fail(res));
							toast.success(t("confirmedAll", { n: res.data.count }));
							router.refresh();
						}),
					)
				}
			>
				{t("confirmAll")}
			</Button>
			{confirm.node}
		</>
	);
}

export function CloseReviewButton({
	reviewId,
	disabled,
}: {
	reviewId: string;
	disabled: boolean;
}) {
	const t = useTranslations("AccessReview");
	const fail = useFail();
	const router = useRouter();
	const [pending, start] = useTransition();
	const confirm = useConfirm({
		title: t("closeTitle"),
		description: t("closeLead"),
		confirmLabel: t("close"),
	});
	return (
		<>
			<Button
				type="button"
				disabled={pending || disabled}
				onClick={() =>
					confirm.ask(() =>
						start(async () => {
							const res = await closeAccessReviewAction({ reviewId });
							if (!res.ok) return void toast.error(fail(res));
							toast.success(t("closed", { n: res.data.tasks }), {
								action:
									res.data.tasks > 0
										? {
												label: t("toTasks"),
												onClick: () => router.push("/heute/aufgaben"),
											}
										: undefined,
							});
							router.refresh();
						}),
					)
				}
			>
				{t("close")}
			</Button>
			{confirm.node}
		</>
	);
}

export function CreateEvidenceButton({ reviewId }: { reviewId: string }) {
	const t = useTranslations("AccessReview");
	const fail = useFail();
	const router = useRouter();
	const [pending, start] = useTransition();
	return (
		<Button
			type="button"
			disabled={pending}
			onClick={() =>
				start(async () => {
					const res = await createAccessReviewEvidence({ reviewId });
					if (!res.ok) return void toast.error(fail(res));
					router.push(`/nachweise/verfassen/${res.data.id}`);
				})
			}
		>
			{t("evidence")}
		</Button>
	);
}
