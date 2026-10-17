"use client";

import { FileUp, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { formatBytes, UPLOAD_ACCEPT } from "@/lib/uploads/types";
import { cn } from "@/lib/utils";

// Ablagefläche für Dateien: Ziehen & Ablegen oder Klicken (echtes
// <input type="file"> darunter — Tastatur und Screenreader funktionieren).
export function FileDrop({
	files,
	onFiles,
	multiple = false,
	accept = UPLOAD_ACCEPT,
	disabled = false,
	id,
}: {
	files: File[];
	onFiles: (files: File[]) => void;
	multiple?: boolean;
	accept?: string;
	disabled?: boolean;
	id?: string;
}) {
	const t = useTranslations("Upload");
	const fallbackId = useId();
	const inputId = id ?? fallbackId;
	const inputRef = useRef<HTMLInputElement>(null);
	const [over, setOver] = useState(false);

	function take(list: FileList | null) {
		if (!list || list.length === 0) return;
		const arr = Array.from(list);
		onFiles(multiple ? arr : arr.slice(0, 1));
	}

	function clear() {
		onFiles([]);
		if (inputRef.current) inputRef.current.value = "";
	}

	return (
		<div className="flex flex-col gap-2">
			<label
				htmlFor={inputId}
				onDragOver={(e) => {
					if (disabled) return;
					e.preventDefault();
					setOver(true);
				}}
				onDragLeave={() => setOver(false)}
				onDrop={(e) => {
					e.preventDefault();
					setOver(false);
					if (!disabled) take(e.dataTransfer.files);
				}}
				className={cn(
					"flex cursor-pointer flex-col items-center justify-center gap-2 rounded-md border border-dashed px-4 py-6 text-center text-sm transition-colors",
					over
						? "border-primary bg-primary/5 text-foreground"
						: "border-border text-muted-foreground hover:border-primary/60 hover:text-foreground",
					disabled && "pointer-events-none opacity-60",
				)}
			>
				<FileUp className="size-5" aria-hidden />
				<span>
					{over
						? t("dropActive")
						: multiple
							? t("dropHintMany")
							: t("dropHint")}
				</span>
				<input
					ref={inputRef}
					id={inputId}
					type="file"
					className="sr-only"
					accept={accept}
					multiple={multiple}
					disabled={disabled}
					onChange={(e) => take(e.target.files)}
				/>
			</label>
			{files.length > 0 && (
				<div className="flex items-center justify-between gap-2 rounded-md bg-muted/50 px-3 py-2 text-sm">
					<span className="min-w-0 truncate">
						{files.length === 1 && files[0]
							? t("selected", {
									name: files[0].name,
									size: formatBytes(files[0].size),
								})
							: t("selectedMany", { count: files.length })}
					</span>
					<Button
						type="button"
						size="sm"
						variant="ghost"
						onClick={clear}
						disabled={disabled}
						aria-label={t("remove")}
					>
						<X />
					</Button>
				</div>
			)}
		</div>
	);
}
