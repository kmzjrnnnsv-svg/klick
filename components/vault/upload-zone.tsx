"use client";

import { Award, Camera, FileUp, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState, useTransition } from "react";
import { addBadgeFromUrl, uploadVaultItem } from "@/app/actions/vault";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const VALID_KINDS = ["cv", "certificate", "badge", "id_doc", "other"] as const;
type Kind = (typeof VALID_KINDS)[number];

export function UploadZone() {
	const t = useTranslations("Vault");
	const [isDragging, setDragging] = useState(false);
	const [isPending, startTransition] = useTransition();
	const [kind, setKind] = useState<Kind>("other");
	const [tags, setTags] = useState("");
	const [badgeUrl, setBadgeUrl] = useState("");
	const [error, setError] = useState<string | null>(null);
	const fileRef = useRef<HTMLInputElement>(null);
	const cameraRef = useRef<HTMLInputElement>(null);

	function handleFiles(files: FileList | null) {
		if (!files || files.length === 0) return;
		setError(null);
		startTransition(async () => {
			for (const file of Array.from(files)) {
				const fd = new FormData();
				fd.set("file", file);
				fd.set("kind", kind);
				fd.set("tags", tags);
				try {
					await uploadVaultItem(fd);
				} catch (e) {
					setError(e instanceof Error ? e.message : String(e));
					return;
				}
			}
		});
	}

	function handleBadgeSubmit() {
		if (!badgeUrl.trim()) return;
		setError(null);
		startTransition(async () => {
			const fd = new FormData();
			fd.set("url", badgeUrl.trim());
			try {
				await addBadgeFromUrl(fd);
				setBadgeUrl("");
			} catch (e) {
				setError(e instanceof Error ? e.message : String(e));
			}
		});
	}

	return (
		<div className="space-y-4">
			<div className="flex flex-col gap-3 sm:flex-row sm:items-end">
				<label className="flex-1 space-y-1.5">
					<span className="text-muted-foreground text-xs">
						{t("kindLabel")}
					</span>
					<select
						value={kind}
						onChange={(e) => setKind(e.target.value as Kind)}
						disabled={isPending}
						className="h-11 w-full rounded-md border border-border bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
					>
						{VALID_KINDS.map((k) => (
							<option key={k} value={k}>
								{t(`kinds.${k}`)}
							</option>
						))}
					</select>
				</label>
				<label className="flex-1 space-y-1.5">
					<span className="text-muted-foreground text-xs">
						{t("tagsLabel")}
					</span>
					<input
						value={tags}
						onChange={(e) => setTags(e.target.value)}
						disabled={isPending}
						placeholder={t("tagsPlaceholder")}
						className="h-11 w-full rounded-md border border-border bg-background px-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
					/>
				</label>
			</div>

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
					"flex w-full flex-col items-center justify-center gap-3 rounded-lg border-2 border-border border-dashed bg-background px-6 py-10 text-center transition-all sm:py-16",
					isDragging && "scale-[1.005] border-primary bg-muted/40",
					isPending && "opacity-60",
				)}
			>
				{isPending ? (
					<Loader2
						className="h-6 w-6 animate-spin text-muted-foreground"
						strokeWidth={1.5}
					/>
				) : (
					<FileUp className="h-7 w-7 text-muted-foreground" strokeWidth={1.5} />
				)}
				<div>
					<p className="font-medium text-sm">{t("dropTitle")}</p>
					<p className="mt-1 text-muted-foreground text-xs">{t("dropHint")}</p>
				</div>
			</button>

			<div className="sm:hidden">
				<Button
					type="button"
					variant="outline"
					className="w-full"
					onClick={() => cameraRef.current?.click()}
					disabled={isPending}
				>
					<Camera className="h-4 w-4" strokeWidth={1.5} /> {t("scanWithCamera")}
				</Button>
			</div>

			<input
				ref={fileRef}
				type="file"
				multiple
				hidden
				onChange={(e) => handleFiles(e.target.files)}
			/>
			<input
				ref={cameraRef}
				type="file"
				accept="image/*"
				capture="environment"
				hidden
				onChange={(e) => handleFiles(e.target.files)}
			/>

			<div className="rounded-lg border border-border border-dashed bg-muted/20 p-4">
				<div className="mb-2 flex items-center gap-2">
					<Award className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
					<p className="font-medium text-sm">{t("badgeUrlTitle")}</p>
				</div>
				<p className="mb-3 text-muted-foreground text-xs leading-relaxed">
					{t("badgeUrlHint")}
				</p>
				<div className="flex flex-col gap-2 sm:flex-row">
					<input
						type="url"
						value={badgeUrl}
						onChange={(e) => setBadgeUrl(e.target.value)}
						disabled={isPending}
						placeholder={t("badgeUrlPlaceholder")}
						className="h-10 flex-1 rounded-md border border-border bg-background px-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
					/>
					<Button
						type="button"
						onClick={handleBadgeSubmit}
						disabled={isPending || !badgeUrl.trim()}
						variant="outline"
						className="sm:w-auto"
					>
						{isPending ? (
							<Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.5} />
						) : (
							t("badgeUrlSubmit")
						)}
					</Button>
				</div>
			</div>

			{error && (
				<p className="rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-rose-700 text-xs dark:text-rose-300">
					{error}
				</p>
			)}
		</div>
	);
}
