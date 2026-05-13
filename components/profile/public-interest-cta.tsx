"use client";

import { Loader2, Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { expressDirectInterest } from "@/app/actions/interests";
import { Button } from "@/components/ui/button";

type JobOption = { id: string; title: string };

// CTA für eingeloggten Employer auf der Public-Share-Seite eines
// Kandidaten. Wahl zwischen "Interesse für konkrete Stelle" und
// "nur kennenlernen". Optional Nachricht + Verifikations-Tiefe.
export function PublicInterestCta({
	publicShareToken,
	jobs,
}: {
	publicShareToken: string;
	jobs: JobOption[];
}) {
	const t = useTranslations("PublicProfile");
	const router = useRouter();
	const [selectedJob, setSelectedJob] = useState<string>(""); // "" = kennenlernen
	const [message, setMessage] = useState("");
	const [verifyDepth, setVerifyDepth] = useState<"light" | "standard" | "deep">(
		"light",
	);
	const [submitted, setSubmitted] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [isPending, startTransition] = useTransition();

	function submit() {
		setError(null);
		startTransition(async () => {
			const res = await expressDirectInterest({
				publicShareToken,
				jobId: selectedJob || null,
				verifyDepth,
				message: message.trim() || undefined,
			});
			if (!res.ok) {
				setError(res.error);
				return;
			}
			setSubmitted(true);
			router.refresh();
		});
	}

	if (submitted) {
		return (
			<section className="mb-5 rounded-lg border border-emerald-500/40 bg-emerald-500/5 p-4 text-sm">
				<p className="font-medium text-emerald-700 dark:text-emerald-300">
					{t("ctaSubmittedTitle")}
				</p>
				<p className="mt-1 text-emerald-700/80 text-xs leading-relaxed dark:text-emerald-300/80">
					{t("ctaSubmittedBody")}
				</p>
			</section>
		);
	}

	return (
		<section className="mb-5 rounded-lg border border-primary/30 bg-primary/5 p-4 sm:p-5">
			<h2 className="font-medium text-sm">{t("ctaTitle")}</h2>
			<p className="mt-1 text-muted-foreground text-xs leading-relaxed">
				{t("ctaSubtitle")}
			</p>

			<div className="mt-4 space-y-3">
				<div>
					<label
						htmlFor="ctaJob"
						className="mb-1 block font-mono text-[10px] text-muted-foreground uppercase tracking-wider"
					>
						{t("ctaJobLabel")}
					</label>
					<select
						id="ctaJob"
						value={selectedJob}
						onChange={(e) => setSelectedJob(e.target.value)}
						className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus-visible:border-foreground focus-visible:outline-none"
					>
						<option value="">{t("ctaJobNone")}</option>
						{jobs.map((j) => (
							<option key={j.id} value={j.id}>
								{j.title}
							</option>
						))}
					</select>
				</div>

				<div>
					<label
						htmlFor="ctaMessage"
						className="mb-1 block font-mono text-[10px] text-muted-foreground uppercase tracking-wider"
					>
						{t("ctaMessageLabel")}
					</label>
					<textarea
						id="ctaMessage"
						value={message}
						onChange={(e) => setMessage(e.target.value)}
						rows={3}
						maxLength={2000}
						placeholder={t("ctaMessagePlaceholder")}
						className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus-visible:border-foreground focus-visible:outline-none"
					/>
				</div>

				<div>
					<p className="mb-1 font-mono text-[10px] text-muted-foreground uppercase tracking-wider">
						{t("ctaVerifyLabel")}
					</p>
					<div className="grid gap-2 sm:grid-cols-3">
						{(["light", "standard", "deep"] as const).map((d) => (
							<label
								key={d}
								className="flex cursor-pointer items-start gap-2 rounded-md border border-border bg-background p-2 text-xs has-[:checked]:border-primary has-[:checked]:bg-primary/5"
							>
								<input
									type="radio"
									name="verifyDepth"
									value={d}
									checked={verifyDepth === d}
									onChange={() => setVerifyDepth(d)}
									className="mt-0.5"
								/>
								<div>
									<div className="font-medium">{t(`ctaVerify.${d}.title`)}</div>
									<div className="text-[10px] text-muted-foreground">
										{t(`ctaVerify.${d}.desc`)}
									</div>
								</div>
							</label>
						))}
					</div>
				</div>

				{error && (
					<p className="rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-rose-700 text-xs dark:text-rose-300">
						{error}
					</p>
				)}

				<Button onClick={submit} disabled={isPending} className="w-full">
					{isPending ? (
						<Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.5} />
					) : (
						<Send className="h-4 w-4" strokeWidth={1.5} />
					)}
					{isPending ? t("ctaSending") : t("ctaSubmit")}
				</Button>
			</div>
		</section>
	);
}
