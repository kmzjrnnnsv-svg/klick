"use client";

import { CheckCircle2, Loader2, Send, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState, useTransition } from "react";
import { submitApplication } from "@/app/actions/applications";
import { Button } from "@/components/ui/button";

type Phase = "form" | "submitting" | "success";

const STEPS = [
	{ at: 0, key: "stepProfile" },
	{ at: 33, key: "stepSave" },
	{ at: 66, key: "stepMatchUpdate" },
	{ at: 95, key: "stepRedirect" },
] as const;

export function ApplyButton({ jobId }: { jobId: string }) {
	const t = useTranslations("Applications");
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [phase, setPhase] = useState<Phase>("form");
	const [coverLetter, setCoverLetter] = useState("");
	const [applicationId, setApplicationId] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [pct, setPct] = useState(0);
	const [_, startTransition] = useTransition();

	// Animated progress bar while submitting; snaps to 100% on success.
	useEffect(() => {
		if (phase !== "submitting") return;
		const start = Date.now();
		const id = setInterval(() => {
			const elapsed = (Date.now() - start) / 1000;
			const next = Math.min(85, 85 * (1 - Math.exp(-elapsed / 2)));
			setPct((p) => Math.max(p, next));
		}, 80);
		return () => clearInterval(id);
	}, [phase]);

	useEffect(() => {
		if (phase === "success" && applicationId) {
			setPct(100);
			const timeout = setTimeout(() => {
				router.push(`/applications/${applicationId}`);
			}, 1400);
			return () => clearTimeout(timeout);
		}
	}, [phase, applicationId, router]);

	function reset() {
		setPhase("form");
		setError(null);
		setPct(0);
		setApplicationId(null);
	}

	function submit() {
		setError(null);
		setPct(0);
		setPhase("submitting");
		startTransition(async () => {
			const result = await submitApplication({
				jobId,
				coverLetter: coverLetter || undefined,
			});
			if (!result.ok) {
				setError(result.error);
				setPhase("form");
				return;
			}
			setApplicationId(result.id);
			setPhase("success");
		});
	}

	const currentStep =
		[...STEPS].reverse().find((s) => s.at <= pct)?.key ?? STEPS[0].key;

	return (
		<>
			<Button
				onClick={() => {
					reset();
					setOpen(true);
				}}
				size="lg"
			>
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
						onClick={() => phase !== "submitting" && setOpen(false)}
						aria-label={t("close")}
						className="absolute inset-0 cursor-default"
						tabIndex={-1}
					/>
					<div className="relative w-full max-w-lg rounded-sm border border-border bg-background p-5 shadow-xl sm:p-6">
						{/* Header */}
						{phase === "form" && (
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
						)}

						{phase === "form" && (
							<>
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
									<Button onClick={submit} className="flex-1">
										<Send className="h-4 w-4" strokeWidth={1.5} />
										{t("submit")}
									</Button>
									<Button
										type="button"
										variant="ghost"
										onClick={() => setOpen(false)}
									>
										{t("cancel")}
									</Button>
								</div>
							</>
						)}

						{phase === "submitting" && (
							<div className="py-4">
								<div className="flex items-center gap-3">
									<Loader2
										className="h-5 w-5 animate-spin text-primary"
										strokeWidth={1.5}
									/>
									<p className="font-medium text-sm">{t(currentStep)}</p>
									<span className="ml-auto font-mono text-[11px] text-muted-foreground tabular-nums">
										{Math.round(pct)} %
									</span>
								</div>
								<div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-muted">
									<div
										className="h-full rounded-full bg-primary transition-[width] duration-200 ease-out"
										style={{ width: `${pct}%` }}
									/>
								</div>
								<ol className="mt-5 space-y-1.5 text-xs">
									{STEPS.map((s) => {
										const reached = pct >= s.at;
										return (
											<li
												key={s.key}
												className={
													reached
														? "text-foreground"
														: "text-muted-foreground opacity-50"
												}
											>
												{reached ? "●" : "○"} {t(s.key)}
											</li>
										);
									})}
								</ol>
							</div>
						)}

						{phase === "success" && (
							<div className="py-6 text-center">
								<div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
									<CheckCircle2 className="h-7 w-7" strokeWidth={1.5} />
								</div>
								<h3 className="mt-4 font-serif-display text-2xl">
									{t("successTitle")}
								</h3>
								<p className="mt-1 text-muted-foreground text-xs leading-relaxed">
									{t("successHint")}
								</p>
								<div className="mt-4 h-1 w-full overflow-hidden rounded-full bg-muted">
									<div
										className="h-full rounded-full bg-emerald-500 transition-[width] duration-1000 ease-linear"
										style={{ width: `${pct}%` }}
									/>
								</div>
								<p className="mt-3 font-mono text-[10px] text-muted-foreground">
									{t("successRedirect")}
								</p>
							</div>
						)}
					</div>
				</div>
			)}
		</>
	);
}
