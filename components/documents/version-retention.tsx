"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import {
	extendVersionRetention,
	requestVersionDestruction,
} from "@/app/actions/document-retention";
import { withStepUp } from "@/components/auth/step-up-dialog";
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
import { errorText } from "@/components/ui/error-text";
import { FormAlert } from "@/components/ui/form-alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import type { RetentionState } from "@/lib/documents/retention";

// Aufbewahrung je Fassung (AP9.3): Stand, „Vernichten …“ nach Ablauf (mit
// Begründung und Freigabe), „Verlängern …“ bis zur Vernichtung.

const DESTROY_ERRORS = [
	"not_due",
	"in_force",
	"already_destroyed",
	"approval_pending",
] as const;
export function VersionRetention({
	versionId,
	version,
	state,
	retainUntil,
	destroyedAt,
	destroyedBy,
	note,
	pendingDestruction,
	canEdit,
}: {
	versionId: string;
	version: string;
	state: RetentionState;
	retainUntil: string | null;
	destroyedAt: string | null;
	destroyedBy: string | null;
	note: string | null;
	pendingDestruction: boolean;
	canEdit: boolean;
}) {
	const t = useTranslations("DocumentRetention");
	if (state === "in_force" || state === "none") return null;
	if (state === "destroyed")
		return (
			<p className="text-footnote text-muted-foreground">
				{destroyedBy
					? t("destroyedBy", { date: destroyedAt ?? "", name: destroyedBy })
					: t("destroyedOn", { date: destroyedAt ?? "" })}
				{note ? ` · ${note}` : ""}
			</p>
		);
	return (
		<div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-footnote">
			<span
				className={
					state === "due"
						? "font-medium text-foreground"
						: "text-muted-foreground"
				}
			>
				{state === "due"
					? t("due", { date: retainUntil ?? "" })
					: t("retainUntil", { date: retainUntil ?? "" })}
			</span>
			{pendingDestruction && (
				<span className="text-muted-foreground">{t("pending")}</span>
			)}
			{canEdit && !pendingDestruction && (
				<>
					{state === "due" && (
						<DestroyDialog versionId={versionId} version={version} />
					)}
					<ExtendDialog versionId={versionId} version={version} />
				</>
			)}
		</div>
	);
}

function DestroyDialog({
	versionId,
	version,
}: {
	versionId: string;
	version: string;
}) {
	const t = useTranslations("DocumentRetention");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [note, setNote] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [pending, start] = useTransition();
	const submit = () =>
		start(async () => {
			setError(null);
			const res = await withStepUp(() =>
				requestVersionDestruction({ versionId, note }),
			);
			if (!res.ok) {
				const code = res.error as (typeof DESTROY_ERRORS)[number];
				return setError(
					DESTROY_ERRORS.includes(code)
						? t(`error_${code}`)
						: errorText(tc, res),
				);
			}
			setOpen(false);
			toast.success(
				res.data?.status === "pending"
					? t("requested")
					: res.data?.fileKept
						? t("destroyedFileKept")
						: t("destroyed"),
			);
			router.refresh();
		});
	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button
					size="sm"
					variant="ghost"
					className="h-(--control-h-sm) px-2 text-destructive"
				>
					{t("destroy")}
				</Button>
			</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{t("destroyTitle", { version })}</DialogTitle>
					<DialogDescription>{t("destroyLead")}</DialogDescription>
				</DialogHeader>
				<form
					className="flex flex-col gap-3"
					onSubmit={(e) => {
						e.preventDefault();
						submit();
					}}
				>
					<div className="flex flex-col gap-1.5">
						<Label htmlFor={`destroy-${versionId}`}>{t("note")}</Label>
						<Textarea
							id={`destroy-${versionId}`}
							name="note"
							rows={3}
							required
							minLength={10}
							placeholder={t("notePlaceholder")}
							value={note}
							onChange={(e) => setNote(e.target.value)}
						/>
					</div>
					<FormAlert message={error} />
					<DialogFooter>
						<Button
							type="button"
							variant="ghost"
							onClick={() => setOpen(false)}
						>
							{tc("cancel")}
						</Button>
						<Button
							type="submit"
							variant="destructive"
							disabled={pending || note.trim().length < 10}
							aria-busy={pending}
						>
							{pending ? t("destroying") : t("destroyConfirm")}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

function ExtendDialog({
	versionId,
	version,
}: {
	versionId: string;
	version: string;
}) {
	const t = useTranslations("DocumentRetention");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [until, setUntil] = useState("");
	const [reason, setReason] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [pending, start] = useTransition();
	const submit = () =>
		start(async () => {
			setError(null);
			const res = await withStepUp(() =>
				extendVersionRetention({ versionId, until, reason }),
			);
			if (!res.ok)
				return setError(
					res.error === "not_later" ? t("notLater") : errorText(tc, res),
				);
			setOpen(false);
			toast.success(t("extended"));
			router.refresh();
		});
	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button size="sm" variant="ghost" className="h-(--control-h-sm) px-2">
					{t("extend")}
				</Button>
			</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{t("extendTitle", { version })}</DialogTitle>
					<DialogDescription>{t("extendLead")}</DialogDescription>
				</DialogHeader>
				<form
					className="flex flex-col gap-3"
					onSubmit={(e) => {
						e.preventDefault();
						submit();
					}}
				>
					<div className="flex flex-col gap-1.5">
						<Label htmlFor={`extend-until-${versionId}`}>{t("until")}</Label>
						<Input
							id={`extend-until-${versionId}`}
							name="until"
							type="date"
							required
							value={until}
							onChange={(e) => setUntil(e.target.value)}
						/>
					</div>
					<div className="flex flex-col gap-1.5">
						<Label htmlFor={`extend-reason-${versionId}`}>{t("reason")}</Label>
						<Input
							id={`extend-reason-${versionId}`}
							name="reason"
							autoComplete="off"
							required
							minLength={5}
							placeholder={t("reasonPlaceholder")}
							value={reason}
							onChange={(e) => setReason(e.target.value)}
						/>
					</div>
					<FormAlert message={error} />
					<DialogFooter>
						<Button
							type="button"
							variant="ghost"
							onClick={() => setOpen(false)}
						>
							{tc("cancel")}
						</Button>
						<Button
							type="submit"
							disabled={pending || !until || reason.trim().length < 5}
							aria-busy={pending}
						>
							{pending ? t("saving") : t("extendConfirm")}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
