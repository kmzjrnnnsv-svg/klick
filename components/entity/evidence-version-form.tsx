"use client";

import { Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { uploadEvidenceVersion } from "@/app/actions/evidence";
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
import { toast } from "@/components/ui/toast";
import { DlpWarning, useUploadFeedback } from "./upload-feedback";

// Neue Fassung eines hochgeladenen Nachweises: gleiche Controls, Einstufung
// und Position im Nachweisbogen; die bisherige Fassung zählt danach nicht
// mehr. Gültig bis ist Pflicht, wenn die bisherige eins hatte.
export function EvidenceVersionForm({
	evidenceId,
	title,
	validUntilRequired,
}: {
	evidenceId: string;
	title: string;
	validUntilRequired: boolean;
}) {
	const t = useTranslations("Evidence");
	const tc = useTranslations("Common");
	const td = useTranslations("Dlp");
	const feedback = useUploadFeedback();
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [pending, start] = useTransition();
	const [file, setFile] = useState<File | null>(null);
	const [name, setName] = useState(title);
	const [validUntil, setValidUntil] = useState("");
	const [dlpReasons, setDlpReasons] = useState<string[] | null>(null);
	const [dlpAck, setDlpAck] = useState(false);
	const [error, setError] = useState<string | null>(null);

	function reset() {
		setFile(null);
		setName(title);
		setValidUntil("");
		setDlpReasons(null);
		setDlpAck(false);
		setError(null);
	}

	function submit() {
		if (!file) return;
		const big = feedback.tooLarge(file);
		if (big) return void setError(big);
		if (validUntilRequired && !validUntil)
			return void setError(t("versionValidUntilRequired"));
		start(async () => {
			const fd = new FormData();
			fd.set("supersedesId", evidenceId);
			fd.set("file", file);
			fd.set("title", name.trim() || title);
			if (validUntil) fd.set("validUntil", validUntil);
			if (dlpAck) fd.set("dlpAcknowledged", "1");
			const res = await uploadEvidenceVersion(fd);
			if (!res.ok) {
				const warn = feedback.dlpWarning(res);
				if (warn) return void setDlpReasons(warn);
				setError(
					res.error === "already_superseded"
						? t("versionAlreadySuperseded")
						: res.error === "validUntil_required"
							? t("versionValidUntilRequired")
							: res.error.startsWith("upload_") || res.error === "rate_limited"
								? feedback.errorText(res)
								: errorText(tc, res),
				);
				return;
			}
			if (res.data.dlpRaised) toast.info(td("raisedPlain"));
			toast.success(t("versionUploaded"));
			setOpen(false);
			reset();
			router.push(`/nachweise/${res.data.id}`);
		});
	}

	return (
		<Dialog
			open={open}
			onOpenChange={(v) => {
				setOpen(v);
				if (!v) reset();
			}}
		>
			<DialogTrigger asChild>
				<Button size="sm" variant="outline">
					<Upload aria-hidden="true" />
					{t("newVersion")}
				</Button>
			</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{t("newVersion")}</DialogTitle>
					<DialogDescription>{t("newVersionLead")}</DialogDescription>
				</DialogHeader>
				<div className="flex flex-col gap-1.5">
					<Label htmlFor="ev-version-file">{t("file")}</Label>
					<Input
						id="ev-version-file"
						type="file"
						onChange={(e) => {
							setFile(e.target.files?.[0] ?? null);
							setDlpReasons(null);
							setDlpAck(false);
							setError(null);
						}}
					/>
				</div>
				<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="ev-version-title">{t("titleField")}</Label>
						<Input
							id="ev-version-title"
							value={name}
							maxLength={200}
							onChange={(e) => setName(e.target.value)}
						/>
					</div>
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="ev-version-valid">
							{validUntilRequired
								? t("validUntilRequiredLabel")
								: t("validUntil")}
						</Label>
						<Input
							id="ev-version-valid"
							type="date"
							required={validUntilRequired}
							value={validUntil}
							onChange={(e) => setValidUntil(e.target.value)}
						/>
					</div>
				</div>
				{dlpReasons && (
					<DlpWarning
						id="ev-version-dlp-ack"
						reasons={dlpReasons}
						acknowledged={dlpAck}
						onAcknowledge={setDlpAck}
					/>
				)}
				<FormAlert message={error} />
				<DialogFooter>
					<Button variant="ghost" onClick={() => setOpen(false)}>
						{tc("cancel")}
					</Button>
					<Button
						disabled={pending || !file || (dlpReasons !== null && !dlpAck)}
						onClick={submit}
					>
						{pending ? t("versionUploading") : t("versionSubmit")}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
