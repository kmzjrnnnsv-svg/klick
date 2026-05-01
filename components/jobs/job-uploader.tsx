"use client";

import { FileUp, Loader2, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState, useTransition } from "react";
import { parseJobPostingFromUpload } from "@/app/actions/jobs";
import { Button } from "@/components/ui/button";
import type { ExtractedJobPosting } from "@/lib/ai/types";
import { cn } from "@/lib/utils";

export function JobUploader({
	onExtracted,
	disabled,
}: {
	onExtracted: (data: ExtractedJobPosting) => void;
	disabled?: boolean;
}) {
	const t = useTranslations("Jobs.uploader");
	const fileRef = useRef<HTMLInputElement>(null);
	const [isPending, startTransition] = useTransition();
	const [filename, setFilename] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [isDragging, setDragging] = useState(false);

	function handleFiles(files: FileList | null) {
		if (!files || files.length === 0) return;
		const file = files[0];
		setError(null);
		setFilename(file.name);
		startTransition(async () => {
			const fd = new FormData();
			fd.set("file", file);
			try {
				const data = await parseJobPostingFromUpload(fd);
				onExtracted(data);
			} catch (e) {
				setError(e instanceof Error ? e.message : String(e));
				setFilename(null);
			}
		});
	}

	return (
		<div className="rounded-lg border border-primary/30 bg-primary/5 p-3 sm:p-4">
			<div className="mb-2 flex items-center gap-2">
				<Sparkles className="h-3.5 w-3.5 text-primary" strokeWidth={1.5} />
				<p className="font-medium text-primary text-xs uppercase tracking-wide">
					{t("title")}
				</p>
			</div>
			<p className="mb-3 text-muted-foreground text-xs leading-snug">
				{t("hint")}
			</p>
			<button
				type="button"
				onClick={() => fileRef.current?.click()}
				onDragOver={(e) => {
					e.preventDefault();
					setDragging(true);
				}}
				onDragLeave={() => setDragging(false)}
				onDrop={(e) => {
					e.preventDefault();
					setDragging(false);
					handleFiles(e.dataTransfer.files);
				}}
				disabled={isPending || disabled}
				className={cn(
					"flex w-full flex-col items-center justify-center gap-2 rounded-md border-2 border-border border-dashed bg-background px-4 py-6 text-center transition-all",
					isDragging && "border-primary bg-muted/40",
					(isPending || disabled) && "opacity-60",
				)}
			>
				{isPending ? (
					<Loader2
						className="h-6 w-6 animate-spin text-muted-foreground"
						strokeWidth={1.5}
					/>
				) : (
					<FileUp className="h-6 w-6 text-muted-foreground" strokeWidth={1.5} />
				)}
				<div>
					<p className="font-medium text-sm">{filename ?? t("dropTitle")}</p>
					<p className="mt-0.5 text-muted-foreground text-xs">
						{isPending ? t("processing") : t("dropHint")}
					</p>
				</div>
			</button>
			<input
				ref={fileRef}
				type="file"
				accept="application/pdf,image/*"
				hidden
				onChange={(e) => handleFiles(e.target.files)}
			/>
			{filename && !isPending && !error && (
				<div className="mt-2 flex items-center justify-between gap-2">
					<p className="text-emerald-700 text-xs dark:text-emerald-300">
						{t("done")}
					</p>
					<Button
						type="button"
						variant="ghost"
						size="sm"
						onClick={() => {
							setFilename(null);
							if (fileRef.current) fileRef.current.value = "";
						}}
					>
						{t("reset")}
					</Button>
				</div>
			)}
			{error && (
				<p className="mt-2 rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-rose-700 text-xs dark:text-rose-300">
					{error}
				</p>
			)}
		</div>
	);
}
