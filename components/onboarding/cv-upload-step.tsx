"use client";

import { CheckCircle2, FileUp, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useRef, useState, useTransition } from "react";
import { uploadVaultItem } from "@/app/actions/vault";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function CvUploadStep() {
	const t = useTranslations("Onboarding.upload");
	const router = useRouter();
	const fileRef = useRef<HTMLInputElement>(null);
	const [isPending, startTransition] = useTransition();
	const [filename, setFilename] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [isDragging, setDragging] = useState(false);

	function handleFiles(files: FileList | null) {
		if (!files || files.length === 0) return;
		setError(null);
		const file = files[0];
		startTransition(async () => {
			const fd = new FormData();
			fd.set("file", file);
			fd.set("kind", "cv");
			fd.set("tags", "");
			try {
				await uploadVaultItem(fd);
				setFilename(file.name);
			} catch (e) {
				setError(e instanceof Error ? e.message : String(e));
			}
		});
	}

	return (
		<div className="space-y-6">
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
				disabled={isPending}
				className={cn(
					"flex w-full flex-col items-center justify-center gap-3 rounded-lg border-2 border-border border-dashed bg-background px-6 py-14 text-center transition-all sm:py-20",
					isDragging && "scale-[1.005] border-primary bg-muted/40",
					filename && "border-emerald-500/50 bg-emerald-500/5",
					isPending && "opacity-60",
				)}
			>
				{isPending ? (
					<Loader2
						className="h-7 w-7 animate-spin text-muted-foreground"
						strokeWidth={1.5}
					/>
				) : filename ? (
					<CheckCircle2
						className="h-8 w-8 text-emerald-600 dark:text-emerald-400"
						strokeWidth={1.5}
					/>
				) : (
					<FileUp className="h-8 w-8 text-muted-foreground" strokeWidth={1.5} />
				)}
				<div>
					<p className="font-medium text-sm">{filename ?? t("dropTitle")}</p>
					<p className="mt-1 text-muted-foreground text-xs">
						{filename ? t("uploadedHint") : t("dropHint")}
					</p>
				</div>
			</button>

			<input
				ref={fileRef}
				type="file"
				hidden
				accept="application/pdf,image/*"
				onChange={(e) => handleFiles(e.target.files)}
			/>

			{error && (
				<p className="rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-rose-700 text-xs dark:text-rose-300">
					{error}
				</p>
			)}

			<div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
				<Button
					type="button"
					variant="ghost"
					onClick={() => router.push("/onboarding/skills")}
					disabled={isPending}
				>
					{t("skip")}
				</Button>
				<Button
					type="button"
					size="lg"
					onClick={() => router.push("/onboarding/skills")}
					disabled={isPending || !filename}
				>
					{t("next")}
				</Button>
			</div>
		</div>
	);
}
