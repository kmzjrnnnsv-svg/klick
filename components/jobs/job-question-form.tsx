"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { askJobQuestion } from "@/app/actions/job-questions";
import { Button } from "@/components/ui/button";

export function JobQuestionForm({ jobId }: { jobId: string }) {
	const t = useTranslations("JobDetail");
	const [body, setBody] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [sent, setSent] = useState(false);
	const [isPending, startTransition] = useTransition();

	function submit(formData: FormData) {
		setError(null);
		const text = formData.get("body")?.toString().trim() ?? "";
		if (text.length < 5) {
			setError(t("questionTooShort"));
			return;
		}
		startTransition(async () => {
			try {
				await askJobQuestion({ jobId, body: text });
				setSent(true);
				setBody("");
			} catch (e) {
				setError(e instanceof Error ? e.message : String(e));
			}
		});
	}

	if (sent) {
		return (
			<p className="rounded-sm border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-emerald-700 text-sm dark:text-emerald-300">
				{t("questionSent")}
			</p>
		);
	}

	return (
		<form action={submit} className="space-y-3">
			<textarea
				name="body"
				value={body}
				onChange={(e) => setBody(e.target.value)}
				rows={3}
				maxLength={600}
				placeholder={t("questionPlaceholder")}
				className="w-full rounded-sm border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground/60 focus-visible:border-foreground focus-visible:outline-none"
			/>
			{error && (
				<p className="text-rose-700 text-xs dark:text-rose-300">{error}</p>
			)}
			<div className="flex items-center justify-between">
				<p className="text-muted-foreground text-xs">
					{t("questionAnonymousHint")}
				</p>
				<Button type="submit" disabled={isPending} size="sm">
					{isPending ? t("sending") : t("askQuestion")}
				</Button>
			</div>
		</form>
	);
}
