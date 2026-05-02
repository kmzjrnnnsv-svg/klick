"use client";

import { Star, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toggleFavorite } from "@/app/actions/favorites";
import { makeOffer } from "@/app/actions/offers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export function CandidateActions({
	jobId,
	jobTitle,
	candidateUserId,
	initialFavorited,
	hasOffer,
	defaultSalary,
}: {
	jobId: string;
	jobTitle: string;
	candidateUserId: string;
	initialFavorited: boolean;
	hasOffer: boolean;
	defaultSalary: number | null;
}) {
	const t = useTranslations("EmployerActions");
	const [isFav, setIsFav] = useState(initialFavorited);
	const [showOffer, setShowOffer] = useState(false);
	const [offerSent, setOfferSent] = useState(hasOffer);
	const [error, setError] = useState<string | null>(null);
	const [isPending, startTransition] = useTransition();

	function flipFavorite() {
		startTransition(async () => {
			try {
				const res = await toggleFavorite({ jobId, candidateUserId });
				setIsFav(res.favorited);
			} catch (e) {
				setError(e instanceof Error ? e.message : String(e));
			}
		});
	}

	function submitOffer(formData: FormData) {
		setError(null);
		const salaryRaw = formData.get("salary")?.toString() ?? "";
		const salary = Number(salaryRaw);
		if (!Number.isFinite(salary) || salary <= 0) {
			setError(t("salaryRequired"));
			return;
		}
		startTransition(async () => {
			try {
				await makeOffer({
					jobId,
					candidateUserId,
					roleTitle: formData.get("roleTitle")?.toString().trim() || jobTitle,
					salaryProposed: Math.round(salary),
					startDateProposed: formData.get("startDate")?.toString() || undefined,
					message: formData.get("message")?.toString() || undefined,
				});
				setOfferSent(true);
				setShowOffer(false);
			} catch (e) {
				const msg = e instanceof Error ? e.message : String(e);
				setError(
					msg.includes("not accepting")
						? t("blockedNoOffers")
						: msg.includes("direct employers")
							? t("blockedAgency")
							: msg,
				);
			}
		});
	}

	return (
		<div className="flex items-center gap-2">
			<button
				type="button"
				onClick={flipFavorite}
				disabled={isPending}
				aria-label={isFav ? t("unfavorite") : t("favorite")}
				className={cn(
					"inline-flex h-9 w-9 items-center justify-center rounded-sm border transition-colors",
					isFav
						? "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300"
						: "border-border text-muted-foreground hover:bg-muted hover:text-foreground",
				)}
			>
				<Star
					className="h-4 w-4"
					strokeWidth={1.5}
					fill={isFav ? "currentColor" : "none"}
				/>
			</button>

			{offerSent ? (
				<span className="lv-eyebrow rounded-sm border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-[0.55rem] text-emerald-700 dark:text-emerald-300">
					{t("offerSent")}
				</span>
			) : (
				<button
					type="button"
					onClick={() => setShowOffer(true)}
					className="lv-eyebrow rounded-sm border border-foreground/40 px-3 py-2 text-[0.6rem] text-foreground transition-colors hover:bg-foreground hover:text-background"
				>
					{t("makeOffer")}
				</button>
			)}

			{showOffer && (
				<div
					role="dialog"
					aria-modal="true"
					className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/40 p-3 backdrop-blur-sm sm:items-center"
				>
					<button
						type="button"
						aria-label={t("close")}
						onClick={() => setShowOffer(false)}
						className="absolute inset-0 cursor-default"
						tabIndex={-1}
					/>
					<div className="relative w-full max-w-md rounded-sm border border-border bg-background p-5 shadow-lg sm:p-6">
						<div className="mb-5 flex items-start justify-between gap-3">
							<div>
								<p className="lv-eyebrow text-[0.55rem] text-primary">
									{t("modalEyebrow")}
								</p>
								<h3 className="mt-1 font-serif-display text-2xl">
									{t("modalTitle")}
								</h3>
							</div>
							<button
								type="button"
								onClick={() => setShowOffer(false)}
								className="text-muted-foreground hover:text-foreground"
								aria-label={t("close")}
							>
								<X className="h-4 w-4" strokeWidth={1.5} />
							</button>
						</div>
						<p className="mb-5 text-muted-foreground text-xs leading-relaxed">
							{t("modalHint")}
						</p>
						<form action={submitOffer} className="space-y-4">
							<label className="block space-y-1.5">
								<span className="lv-eyebrow text-[0.55rem] text-muted-foreground">
									{t("roleTitle")}
								</span>
								<Input
									name="roleTitle"
									defaultValue={jobTitle}
									placeholder={jobTitle}
								/>
							</label>
							<label className="block space-y-1.5">
								<span className="lv-eyebrow text-[0.55rem] text-muted-foreground">
									{t("salary")}
								</span>
								<Input
									name="salary"
									type="number"
									min={0}
									step={1000}
									required
									defaultValue={defaultSalary?.toString() ?? ""}
									placeholder="80000"
								/>
							</label>
							<label className="block space-y-1.5">
								<span className="lv-eyebrow text-[0.55rem] text-muted-foreground">
									{t("startDate")}
								</span>
								<Input name="startDate" type="date" />
							</label>
							<label className="block space-y-1.5">
								<span className="lv-eyebrow text-[0.55rem] text-muted-foreground">
									{t("message")}
								</span>
								<textarea
									name="message"
									rows={3}
									placeholder={t("messagePlaceholder")}
									className="w-full rounded-sm border-0 border-b border-border/80 bg-transparent px-1 py-2 text-sm placeholder:text-muted-foreground/70 focus-visible:border-foreground focus-visible:outline-none"
								/>
							</label>
							{error && (
								<p className="rounded-sm border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-rose-700 text-xs dark:text-rose-300">
									{error}
								</p>
							)}
							<div className="flex gap-2 pt-2">
								<Button type="submit" disabled={isPending} className="flex-1">
									{isPending ? t("sending") : t("send")}
								</Button>
								<Button
									type="button"
									variant="ghost"
									onClick={() => setShowOffer(false)}
								>
									{t("cancel")}
								</Button>
							</div>
						</form>
					</div>
				</div>
			)}
		</div>
	);
}
