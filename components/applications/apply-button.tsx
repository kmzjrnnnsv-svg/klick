"use client";

import { Send, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { submitApplication } from "@/app/actions/applications";
import { Button } from "@/components/ui/button";

export function ApplyButton({ jobId }: { jobId: string }) {
	const t = useTranslations("Applications");
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [coverLetter, setCoverLetter] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [isPending, startTransition] = useTransition();

	function submit() {
		setError(null);
		startTransition(async () => {
			const result = await submitApplication({
				jobId,
				coverLetter: coverLetter || undefined,
			});
			if (!result.ok) {
				setError(result.error);
				return;
			}
			setOpen(false);
			router.push(`/applications/${result.id}`);
		});
	}

	return (
		<>
			<Button onClick={() => setOpen(true)} size="lg">
				<Send className="h-4 w-4" strokeWidth={1.5} />
				{t("applyCta")}
			</Button>
			{open && (
				<div
					role="dialog"
					aria-modal="true"
					className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/40 p-3 backdrop-blur-sm sm:items-center"
				>
					<button
						type="button"
						onClick={() => setOpen(false)}
						aria-label={t("close")}
						className="absolute inset-0 cursor-default"
						tabIndex={-1}
					/>
					<div className="relative w-full max-w-lg rounded-sm border border-border bg-background p-5 shadow-lg sm:p-6">
						<div className="mb-4 flex items-start justify-between gap-3">
							<div>
								<p className="lv-eyebrow text-[0.55rem] text-primary">
									{t("applyEyebrow")}
								</p>
								<h3 className="mt-1 font-serif-display text-2xl">
									{t("applyTitle")}
								</h3>
							</div>
							<button
								type="button"
								onClick={() => setOpen(false)}
								className="text-muted-foreground hover:text-foreground"
								aria-label={t("close")}
							>
								<X className="h-4 w-4" strokeWidth={1.5} />
							</button>
						</div>
						<p className="mb-4 text-muted-foreground text-xs leading-relaxed">
							{t("applyHint")}
						</p>
						<label className="block space-y-1.5">
							<span className="lv-eyebrow text-[0.55rem] text-muted-foreground">
								{t("coverLetterLabel")}
							</span>
							<textarea
								value={coverLetter}
								onChange={(e) => setCoverLetter(e.target.value)}
								rows={8}
								maxLength={3000}
								placeholder={t("coverLetterPlaceholder")}
								className="w-full rounded-sm border border-border bg-background px-3 py-2 text-sm focus-visible:border-foreground focus-visible:outline-none"
							/>
						</label>
						{error && (
							<p className="mt-3 rounded-sm border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-rose-700 text-xs dark:text-rose-300">
								{error}
							</p>
						)}
						<div className="mt-5 flex gap-2">
							<Button onClick={submit} disabled={isPending} className="flex-1">
								<Send className="h-4 w-4" strokeWidth={1.5} />
								{isPending ? t("submitting") : t("submit")}
							</Button>
							<Button
								type="button"
								variant="ghost"
								onClick={() => setOpen(false)}
							>
								{t("cancel")}
							</Button>
						</div>
					</div>
				</div>
			)}
		</>
	);
}
