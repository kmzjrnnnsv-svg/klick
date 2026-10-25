"use client";

import { Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { uploadDocumentFile } from "@/app/actions/documents";
import {
	DlpWarning,
	useUploadFeedback,
} from "@/components/entity/upload-feedback";
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

// Datei der Fassung in Arbeit hochladen (nur im Entwurf). Die Datei gehört
// zur Fassung: beim Einreichen wird sie mit dem Text festgeschrieben.
export function DocumentFileForm({
	documentId,
	hasFile,
}: {
	documentId: string;
	hasFile: boolean;
}) {
	const t = useTranslations("Documents");
	const tc = useTranslations("Common");
	const feedback = useUploadFeedback();
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [pending, start] = useTransition();
	const [file, setFile] = useState<File | null>(null);
	const [dlpReasons, setDlpReasons] = useState<string[] | null>(null);
	const [dlpAck, setDlpAck] = useState(false);
	const [error, setError] = useState<string | null>(null);

	function reset() {
		setFile(null);
		setDlpReasons(null);
		setDlpAck(false);
		setError(null);
	}

	function submit() {
		if (!file) return;
		const big = feedback.tooLarge(file);
		if (big) return void setError(big);
		start(async () => {
			const fd = new FormData();
			fd.set("documentId", documentId);
			fd.set("file", file);
			if (dlpAck) fd.set("dlpAcknowledged", "1");
			const res = await uploadDocumentFile(fd);
			if (!res.ok) {
				const warn = feedback.dlpWarning(res);
				if (warn) return void setDlpReasons(warn);
				setError(
					res.error === "document_not_draft"
						? t("fileNotDraft")
						: res.error.startsWith("upload_") || res.error === "rate_limited"
							? feedback.errorText(res)
							: errorText(tc, res),
				);
				return;
			}
			toast.success(t("fileUploaded"));
			setOpen(false);
			reset();
			router.refresh();
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
					{hasFile ? t("fileReplace") : t("fileUpload")}
				</Button>
			</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>
						{hasFile ? t("fileReplace") : t("fileUpload")}
					</DialogTitle>
					<DialogDescription>{t("fileLead")}</DialogDescription>
				</DialogHeader>
				<div className="flex flex-col gap-1.5">
					<Label htmlFor="doc-file">{t("file")}</Label>
					<Input
						id="doc-file"
						type="file"
						onChange={(e) => {
							setFile(e.target.files?.[0] ?? null);
							setDlpReasons(null);
							setDlpAck(false);
							setError(null);
						}}
					/>
				</div>
				{dlpReasons && (
					<DlpWarning
						id="doc-dlp-ack"
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
						{pending ? t("fileUploading") : t("fileUploadSubmit")}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
