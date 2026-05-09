"use client";

import { Send } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useRef, useState, useTransition } from "react";
import { askJobQuestion } from "@/app/actions/job-questions";
import { Button } from "@/components/ui/button";

type ThreadEntry = {
	id: string;
	body: string;
	answer: string | null;
	createdAt: Date;
	answeredAt: Date | null;
	pending?: boolean;
};

export function JobQuestionThread({
	jobId,
	initial,
}: {
	jobId: string;
	initial: ThreadEntry[];
}) {
	const t = useTranslations("JobDetail");
	const fmt = useFormatter();
	const [entries, setEntries] = useState<ThreadEntry[]>(initial);
	const [body, setBody] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [isPending, startTransition] = useTransition();
	const listEndRef = useRef<HTMLDivElement | null>(null);

	// biome-ignore lint/correctness/useExhaustiveDependencies: scroll only when count changes
	useEffect(() => {
		listEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
	}, [entries.length]);

	function submit() {
		setError(null);
		const text = body.trim();
		if (text.length < 5) {
			setError(t("questionTooShort"));
			return;
		}
		const tempId = `tmp-${Date.now()}`;
		setEntries((prev) => [
			...prev,
			{
				id: tempId,
				body: text,
				answer: null,
				createdAt: new Date(),
				answeredAt: null,
				pending: true,
			},
		]);
		setBody("");
		startTransition(async () => {
			try {
				const res = await askJobQuestion({ jobId, body: text });
				setEntries((prev) =>
					prev.map((e) =>
						e.id === tempId ? { ...e, id: res.id, pending: false } : e,
					),
				);
			} catch (e) {
				setEntries((prev) => prev.filter((x) => x.id !== tempId));
				setError(e instanceof Error ? e.message : String(e));
				setBody(text);
			}
		});
	}

	return (
		<div className="space-y-4">
			{entries.length > 0 && (
				<div className="max-h-[28rem] space-y-3 overflow-y-auto rounded-sm border border-border bg-background p-3 sm:p-4">
					{entries.map((q) => (
						<div key={q.id} className="space-y-2">
							{/* Candidate bubble (right-aligned) */}
							<div className="flex justify-end">
								<div className="max-w-[80%] rounded-sm rounded-br-none border border-primary/30 bg-primary/10 px-3 py-2">
									<p className="whitespace-pre-wrap text-foreground/90 text-sm leading-relaxed">
										{q.body}
									</p>
									<p className="mt-1 text-right font-mono text-[9px] text-muted-foreground">
										{q.pending
											? t("sending")
											: fmt.dateTime(q.createdAt, {
													dateStyle: "short",
													timeStyle: "short",
												})}
									</p>
								</div>
							</div>
							{/* Employer answer (left-aligned) or "waiting" stub */}
							{q.answer ? (
								<div className="flex justify-start">
									<div className="max-w-[80%] rounded-sm rounded-bl-none border border-border bg-muted px-3 py-2">
										<p className="lv-eyebrow text-[0.5rem] text-primary">
											{t("employerAnswered")}
										</p>
										<p className="mt-1 whitespace-pre-wrap text-foreground/90 text-sm leading-relaxed">
											{q.answer}
										</p>
										{q.answeredAt && (
											<p className="mt-1 font-mono text-[9px] text-muted-foreground">
												{fmt.dateTime(q.answeredAt, {
													dateStyle: "short",
													timeStyle: "short",
												})}
											</p>
										)}
									</div>
								</div>
							) : (
								!q.pending && (
									<div className="flex justify-start">
										<div className="rounded-sm border border-border border-dashed bg-background px-3 py-2 text-muted-foreground text-xs italic">
											{t("waitingForAnswer")}
										</div>
									</div>
								)
							)}
						</div>
					))}
					<div ref={listEndRef} />
				</div>
			)}

			<form
				action={submit}
				className="space-y-2 rounded-sm border border-border bg-background p-3"
			>
				<textarea
					value={body}
					onChange={(e) => setBody(e.target.value)}
					rows={3}
					maxLength={600}
					placeholder={t("questionPlaceholder")}
					className="w-full resize-none rounded-sm border border-transparent bg-transparent px-2 py-1 text-sm placeholder:text-muted-foreground/60 focus-visible:border-foreground focus-visible:outline-none"
				/>
				{error && (
					<p className="text-rose-700 text-xs dark:text-rose-300">{error}</p>
				)}
				<div className="flex items-center justify-between gap-3">
					<p className="text-muted-foreground text-[11px]">
						{t("questionAnonymousHint")}
					</p>
					<Button
						type="button"
						onClick={submit}
						disabled={isPending || body.trim().length < 5}
						size="sm"
					>
						<Send className="h-3.5 w-3.5" strokeWidth={1.5} />
						{isPending ? t("sending") : t("askQuestion")}
					</Button>
				</div>
			</form>
		</div>
	);
}
