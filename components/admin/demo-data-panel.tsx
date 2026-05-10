"use client";

import { Loader2, Sparkles, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { generateDemoData, purgeDemoData } from "@/app/actions/admin";

export function DemoDataPanel() {
	const t = useTranslations("AdminDemo");
	const [candidates, setCandidates] = useState(8);
	const [jobsCount, setJobsCount] = useState(4);
	const [isPending, startTransition] = useTransition();
	const [feedback, setFeedback] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);

	function handleGenerate() {
		setError(null);
		setFeedback(null);
		startTransition(async () => {
			const r = await generateDemoData({ candidates, jobs: jobsCount });
			if (!r.ok) {
				setError(r.error);
				return;
			}
			setFeedback(
				t("generated", {
					candidates: r.candidatesCreated,
					jobs: r.jobsCreated,
					applications: r.applicationsCreated,
				}),
			);
		});
	}

	function handlePurge() {
		if (!window.confirm(t("purgeConfirm"))) return;
		setError(null);
		setFeedback(null);
		startTransition(async () => {
			const r = await purgeDemoData();
			setFeedback(
				t("purged", {
					users: r.deletedUsers,
					employers: r.deletedEmployers,
					jobs: r.deletedJobs,
				}),
			);
		});
	}

	return (
		<section className="mb-6 rounded-sm border border-primary/30 bg-primary/5 p-4">
			<div className="flex items-center gap-2">
				<Sparkles className="h-4 w-4 text-primary" strokeWidth={1.5} />
				<h2 className="font-medium text-sm">{t("title")}</h2>
			</div>
			<p className="mt-1 text-muted-foreground text-xs leading-relaxed">
				{t("subtitle")}
			</p>
			<div className="mt-3 flex flex-wrap items-end gap-3">
				<label className="space-y-1">
					<span className="text-muted-foreground text-xs">
						{t("candidates")}
					</span>
					<input
						type="number"
						min={1}
						max={50}
						value={candidates}
						onChange={(e) =>
							setCandidates(
								Math.min(50, Math.max(1, Number(e.target.value) || 1)),
							)
						}
						className="block h-9 w-24 rounded-sm border border-border bg-background px-2 text-sm"
					/>
				</label>
				<label className="space-y-1">
					<span className="text-muted-foreground text-xs">{t("jobs")}</span>
					<input
						type="number"
						min={0}
						max={20}
						value={jobsCount}
						onChange={(e) =>
							setJobsCount(
								Math.min(20, Math.max(0, Number(e.target.value) || 0)),
							)
						}
						className="block h-9 w-24 rounded-sm border border-border bg-background px-2 text-sm"
					/>
				</label>
				<button
					type="button"
					onClick={handleGenerate}
					disabled={isPending}
					className="inline-flex h-9 items-center gap-2 rounded-sm bg-primary px-3 text-primary-foreground text-xs hover:bg-primary/90 disabled:opacity-60"
				>
					{isPending ? (
						<Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={1.5} />
					) : (
						<Sparkles className="h-3.5 w-3.5" strokeWidth={1.5} />
					)}
					{t("generate")}
				</button>
				<button
					type="button"
					onClick={handlePurge}
					disabled={isPending}
					className="inline-flex h-9 items-center gap-2 rounded-sm border border-rose-500/30 bg-rose-500/5 px-3 text-rose-700 text-xs hover:bg-rose-500/10 disabled:opacity-60 dark:text-rose-300"
				>
					<Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} />
					{t("purge")}
				</button>
			</div>
			{feedback && (
				<p className="mt-3 rounded-sm border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-emerald-800 text-xs leading-relaxed dark:text-emerald-200">
					{feedback}
				</p>
			)}
			{error && (
				<p className="mt-3 rounded-sm border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-rose-700 text-xs dark:text-rose-300">
					{error}
				</p>
			)}
		</section>
	);
}
