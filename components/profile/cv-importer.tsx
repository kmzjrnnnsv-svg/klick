"use client";

import { Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { parseCvFromVault } from "@/app/actions/profile";
import { Button } from "@/components/ui/button";
import type { ExtractedProfile } from "@/lib/ai";
import { cn } from "@/lib/utils";

type CvItem = { id: string; filename: string; mime: string; createdAt: Date };

export function CvImporter({
	cvs,
	onExtracted,
}: {
	cvs: CvItem[];
	onExtracted: (data: ExtractedProfile) => void;
}) {
	const t = useTranslations("Profile");
	const [pendingId, setPendingId] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [, startTransition] = useTransition();

	if (cvs.length === 0) {
		return <p className="text-muted-foreground text-sm">{t("noCvHint")}</p>;
	}

	function handleParse(id: string) {
		setError(null);
		setPendingId(id);
		startTransition(async () => {
			try {
				const data = await parseCvFromVault(id);
				onExtracted(data);
			} catch (e) {
				setError(e instanceof Error ? e.message : String(e));
			} finally {
				setPendingId(null);
			}
		});
	}

	return (
		<div className="space-y-3">
			<p className="text-muted-foreground text-xs">{t("importHint")}</p>
			<ul className="space-y-2">
				{cvs.map((cv) => (
					<li
						key={cv.id}
						className={cn(
							"flex items-center gap-3 rounded-md border border-border bg-background p-3 text-sm",
							pendingId === cv.id && "opacity-60",
						)}
					>
						<span className="flex-1 truncate font-medium">{cv.filename}</span>
						<Button
							type="button"
							variant="outline"
							size="sm"
							disabled={pendingId !== null}
							onClick={() => handleParse(cv.id)}
						>
							<Sparkles className="h-3.5 w-3.5" strokeWidth={1.5} />
							{pendingId === cv.id ? t("extracting") : t("extract")}
						</Button>
					</li>
				))}
			</ul>
			{error && (
				<p className="rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-rose-700 text-xs dark:text-rose-300">
					{error}
				</p>
			)}
		</div>
	);
}
