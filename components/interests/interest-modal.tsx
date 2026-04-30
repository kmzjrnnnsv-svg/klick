"use client";

import { Send, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, useTransition } from "react";
import { showInterest } from "@/app/actions/interests";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const DEPTHS = ["light", "standard", "deep"] as const;
type Depth = (typeof DEPTHS)[number];

export function InterestModal({
	matchId,
	onClose,
	onSuccess,
}: {
	matchId: string;
	onClose: () => void;
	onSuccess: () => void;
}) {
	const t = useTranslations("Interest");
	const [depth, setDepth] = useState<Depth>("light");
	const [message, setMessage] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [isPending, startTransition] = useTransition();
	const dialogRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		function onKey(e: KeyboardEvent) {
			if (e.key === "Escape") onClose();
		}
		document.addEventListener("keydown", onKey);
		return () => document.removeEventListener("keydown", onKey);
	}, [onClose]);

	function handleSubmit() {
		setError(null);
		startTransition(async () => {
			try {
				await showInterest({
					matchId,
					verifyDepth: depth,
					message: message.trim() || undefined,
				});
				onSuccess();
			} catch (e) {
				setError(e instanceof Error ? e.message : String(e));
			}
		});
	}

	return (
		<div
			role="dialog"
			aria-modal="true"
			aria-labelledby="interest-title"
			className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4 backdrop-blur-sm"
		>
			<button
				type="button"
				className="absolute inset-0 cursor-default"
				aria-label="Close dialog"
				onClick={onClose}
			/>
			<div
				ref={dialogRef}
				className="relative w-full max-w-md rounded-lg border border-border bg-background p-5 shadow-lg sm:p-6"
			>
				<div className="mb-4 flex items-start justify-between">
					<div>
						<h2 id="interest-title" className="font-semibold text-base">
							{t("title")}
						</h2>
						<p className="mt-1 text-muted-foreground text-xs leading-relaxed">
							{t("subtitle")}
						</p>
					</div>
					<Button
						variant="ghost"
						size="icon"
						onClick={onClose}
						aria-label={t("close")}
					>
						<X className="h-4 w-4" strokeWidth={1.5} />
					</Button>
				</div>

				<div className="space-y-2">
					<span className="text-muted-foreground text-xs">
						{t("depthLabel")}
					</span>
					{DEPTHS.map((d) => (
						<label
							key={d}
							className={cn(
								"flex cursor-pointer items-start gap-3 rounded-md border border-border p-3 text-sm has-[:checked]:border-primary",
							)}
						>
							<input
								type="radio"
								name="depth"
								value={d}
								checked={depth === d}
								onChange={() => setDepth(d)}
								className="mt-0.5"
							/>
							<div>
								<div className="font-medium">{t(`depths.${d}.title`)}</div>
								<div className="text-muted-foreground text-xs">
									{t(`depths.${d}.body`)}
								</div>
							</div>
						</label>
					))}
				</div>

				<div className="mt-5">
					<label className="block space-y-1.5">
						<span className="text-muted-foreground text-xs">
							{t("messageLabel")}
						</span>
						<textarea
							value={message}
							onChange={(e) => setMessage(e.target.value)}
							rows={4}
							maxLength={2000}
							placeholder={t("messagePlaceholder")}
							className="block w-full rounded-md border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
						/>
					</label>
				</div>

				{error && (
					<p className="mt-3 rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-rose-700 text-xs dark:text-rose-300">
						{error}
					</p>
				)}

				<div className="mt-5 flex items-center justify-end gap-2">
					<Button
						variant="ghost"
						size="sm"
						onClick={onClose}
						disabled={isPending}
					>
						{t("cancel")}
					</Button>
					<Button onClick={handleSubmit} disabled={isPending}>
						<Send className="h-4 w-4" strokeWidth={1.5} />
						{isPending ? t("sending") : t("send")}
					</Button>
				</div>
			</div>
		</div>
	);
}
