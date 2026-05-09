"use client";

import { Send } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useRef, useState, useTransition } from "react";
import { sendApplicationMessage } from "@/app/actions/applications";
import { Button } from "@/components/ui/button";

type ThreadMsg = {
	id: string;
	body: string;
	byRole: "candidate" | "employer";
	createdAt: Date;
	pending?: boolean;
};

export function ApplicationMessageThread({
	applicationId,
	viewerRole,
	initial,
	closed,
}: {
	applicationId: string;
	viewerRole: "candidate" | "employer";
	initial: ThreadMsg[];
	closed: boolean;
}) {
	const t = useTranslations("Applications");
	const fmt = useFormatter();
	const [messages, setMessages] = useState<ThreadMsg[]>(initial);
	const [body, setBody] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [isPending, startTransition] = useTransition();
	const endRef = useRef<HTMLDivElement | null>(null);

	// biome-ignore lint/correctness/useExhaustiveDependencies: count is the trigger
	useEffect(() => {
		endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
	}, [messages.length]);

	function submit() {
		setError(null);
		const text = body.trim();
		if (text.length < 1) return;
		const tempId = `tmp-${Date.now()}`;
		setMessages((prev) => [
			...prev,
			{
				id: tempId,
				body: text,
				byRole: viewerRole,
				createdAt: new Date(),
				pending: true,
			},
		]);
		setBody("");
		startTransition(async () => {
			const res = await sendApplicationMessage({ applicationId, body: text });
			if (!res.ok) {
				setMessages((prev) => prev.filter((m) => m.id !== tempId));
				setError(res.error ?? "fehlgeschlagen");
				setBody(text);
				return;
			}
			setMessages((prev) =>
				prev.map((m) =>
					m.id === tempId ? { ...m, id: res.id ?? tempId, pending: false } : m,
				),
			);
		});
	}

	return (
		<section>
			<p className="lv-eyebrow text-[0.55rem] text-primary">
				{t("messageThreadEyebrow")}
			</p>
			<h2 className="mt-2 mb-3 font-serif-display text-xl">
				{t("messageThreadTitle")}
			</h2>
			{messages.length > 0 && (
				<div className="max-h-[24rem] space-y-2 overflow-y-auto rounded-sm border border-border bg-background p-3 sm:p-4">
					{messages.map((m) => {
						const mine = m.byRole === viewerRole;
						return (
							<div
								key={m.id}
								className={`flex ${mine ? "justify-end" : "justify-start"}`}
							>
								<div
									className={`max-w-[80%] rounded-sm border px-3 py-2 ${
										mine
											? "rounded-br-none border-primary/30 bg-primary/10"
											: "rounded-bl-none border-border bg-muted"
									}`}
								>
									<p className="whitespace-pre-wrap text-foreground/90 text-sm leading-relaxed">
										{m.body}
									</p>
									<p
										className={`mt-1 font-mono text-[9px] text-muted-foreground ${mine ? "text-right" : ""}`}
									>
										{m.pending
											? t("sending")
											: fmt.dateTime(m.createdAt, {
													dateStyle: "short",
													timeStyle: "short",
												})}
									</p>
								</div>
							</div>
						);
					})}
					<div ref={endRef} />
				</div>
			)}
			{!closed ? (
				<div className="mt-3 space-y-2 rounded-sm border border-border bg-background p-3">
					<textarea
						value={body}
						onChange={(e) => setBody(e.target.value)}
						rows={2}
						maxLength={2000}
						placeholder={t("messagePlaceholder")}
						className="w-full resize-none rounded-sm border border-transparent bg-transparent px-2 py-1 text-sm placeholder:text-muted-foreground/60 focus-visible:border-foreground focus-visible:outline-none"
					/>
					{error && (
						<p className="text-rose-700 text-xs dark:text-rose-300">{error}</p>
					)}
					<div className="flex items-center justify-between gap-3">
						<p className="text-muted-foreground text-[11px]">
							{t("messageHint")}
						</p>
						<Button
							type="button"
							onClick={submit}
							disabled={isPending || body.trim().length < 1}
							size="sm"
						>
							<Send className="h-3.5 w-3.5" strokeWidth={1.5} />
							{isPending ? t("sending") : t("messageSend")}
						</Button>
					</div>
				</div>
			) : (
				<p className="mt-3 rounded-sm border border-border border-dashed bg-muted/30 p-3 text-muted-foreground text-xs">
					{t("messageThreadClosed")}
				</p>
			)}
		</section>
	);
}
