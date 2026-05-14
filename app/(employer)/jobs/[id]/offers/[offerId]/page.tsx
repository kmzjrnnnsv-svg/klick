import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import {
	acceptCounter,
	employerCounter,
	getOfferForEmployer,
	withdrawOffer,
} from "@/app/actions/offers";
import { auth } from "@/auth";
import { Footer } from "@/components/footer";
import { Header } from "@/components/header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const STATUS_TONES: Record<string, string> = {
	pending: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
	seen: "bg-blue-500/10 text-blue-700 dark:text-blue-300",
	accepted: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
	declined: "bg-rose-500/10 text-rose-700 dark:text-rose-300",
	countered: "bg-indigo-500/10 text-indigo-700 dark:text-indigo-300",
	withdrawn: "bg-zinc-500/10 text-muted-foreground",
	expired: "bg-zinc-500/10 text-muted-foreground",
};

export default async function EmployerOfferDetailPage({
	params,
}: {
	params: Promise<{ id: string; offerId: string }>;
}) {
	const session = await auth();
	if (!session?.user) redirect("/login");

	const { id: jobId, offerId } = await params;
	const t = await getTranslations("EmployerOffers");
	const fmt = await getFormatter();

	const detail = await getOfferForEmployer(offerId);
	if (!detail) notFound();
	const { offer, candidate, job, thread } = detail;

	// The "active" offer in the chain is always the last one. Actions only
	// apply to it.
	const active = thread[thread.length - 1] ?? offer;
	const candidateCountered =
		active.lastActor === "candidate" &&
		(active.status === "pending" || active.status === "seen");
	const canWithdrawSelf =
		active.lastActor === "employer" &&
		(active.status === "pending" || active.status === "seen");

	async function accept() {
		"use server";
		await acceptCounter(active.id);
		redirect(`/jobs/${jobId}/offers/${offerId}`);
	}

	async function counter(formData: FormData) {
		"use server";
		const salary = Number(formData.get("salary") ?? "0");
		if (!Number.isFinite(salary) || salary <= 0) return;
		const res = await employerCounter({
			parentOfferId: active.id,
			salaryProposed: Math.round(salary),
			message: formData.get("message")?.toString(),
		});
		redirect(`/jobs/${jobId}/offers/${res.id}`);
	}

	async function withdraw() {
		"use server";
		await withdrawOffer(active.id);
		redirect(`/jobs/${jobId}/offers`);
	}

	return (
		<>
			<Header />
			<main className="mx-auto w-full max-w-2xl flex-1 px-3 pt-6 pb-20 sm:px-6 sm:pt-12">
				<Link
					href={`/jobs/${jobId}/offers`}
					className="lv-eyebrow text-[0.55rem] text-muted-foreground hover:text-foreground"
				>
					← {t("backToList")}
				</Link>

				<header className="mt-3 mb-6">
					<p className="lv-eyebrow text-[0.55rem] text-primary">
						{t("eyebrow")}
					</p>
					<h1 className="mt-2 font-serif-display text-3xl sm:text-4xl">
						{offer.roleTitle}
					</h1>
					<p className="mt-2 text-muted-foreground text-sm">
						{job.title && job.title !== offer.roleTitle
							? `${t("forJob", { title: job.title })} · `
							: ""}
						{candidate.displayName ?? t("anonymousCandidate")}
						{candidate.email && active.status === "accepted" && (
							<span className="ml-2 font-mono text-primary text-xs">
								{candidate.email}
							</span>
						)}
					</p>
				</header>

				{/* Negotiation timeline */}
				<section className="mb-8">
					<p className="lv-eyebrow text-[0.55rem] text-muted-foreground">
						{t("thread")}
					</p>
					<ol className="mt-3 space-y-3">
						{thread.map((step, idx) => (
							<li
								key={step.id}
								className="rounded-sm border border-border bg-background p-4"
							>
								<div className="flex items-start justify-between gap-3">
									<div>
										<p className="lv-eyebrow text-[0.55rem] text-muted-foreground">
											{step.lastActor === "employer"
												? t("byEmployer")
												: t("byCandidate")}
											{` · #${idx + 1}`}
										</p>
										<div className="mt-1 font-serif-display text-xl">
											{fmt.number(step.salaryProposed, {
												style: "currency",
												currency: "EUR",
												maximumFractionDigits: 0,
											})}
										</div>
										<p className="mt-1 font-mono text-[10px] text-muted-foreground">
											{fmt.dateTime(step.createdAt, { dateStyle: "short" })}
										</p>
										{step.message && (
											<div className="mt-2">
												<p className="whitespace-pre-wrap text-foreground/90 text-xs leading-relaxed">
													{step.message}
												</p>
											</div>
										)}
										{step.decidedMessage && (
											<p className="mt-2 rounded-sm border-l-2 border-primary/40 bg-muted/40 px-2 py-1 text-foreground text-xs leading-relaxed">
												{step.decidedMessage}
											</p>
										)}
									</div>
									<span
										className={`shrink-0 rounded-sm px-2 py-1 font-mono text-[10px] uppercase tracking-wide ${
											STATUS_TONES[step.status] ?? STATUS_TONES.pending
										}`}
									>
										{t(`status.${step.status}`)}
									</span>
								</div>
							</li>
						))}
					</ol>
				</section>

				{candidateCountered && (
					<section className="space-y-5 rounded-sm border border-indigo-500/30 bg-indigo-500/5 p-5">
						<div>
							<p className="lv-eyebrow text-[0.55rem] text-indigo-700 dark:text-indigo-300">
								{t("counterIncoming")}
							</p>
							<h2 className="mt-2 font-serif-display text-2xl">
								{t("respondTitle")}
							</h2>
							<p className="mt-2 text-muted-foreground text-sm leading-relaxed">
								{t("respondHint")}
							</p>
						</div>

						<form action={accept}>
							<Button type="submit" className="w-full">
								{t("acceptCounter", {
									amount: fmt.number(active.salaryProposed, {
										style: "currency",
										currency: "EUR",
										maximumFractionDigits: 0,
									}),
								})}
							</Button>
						</form>

						<form
							action={counter}
							className="space-y-3 rounded-sm border border-border bg-background p-4"
						>
							<p className="lv-eyebrow text-[0.55rem] text-muted-foreground">
								{t("counterBack")}
							</p>
							<div className="grid grid-cols-2 gap-3">
								<Input
									name="salary"
									type="number"
									min={0}
									step={1000}
									required
									placeholder={t("counterSalary")}
								/>
								<Input name="message" placeholder={t("counterMessage")} />
							</div>
							<Button type="submit" variant="outline" className="w-full">
								{t("counterSend")}
							</Button>
						</form>

						<form action={withdraw}>
							<Button type="submit" variant="ghost" className="w-full">
								{t("withdrawAll")}
							</Button>
						</form>
					</section>
				)}

				{canWithdrawSelf && (
					<section className="rounded-sm border border-border bg-muted/30 p-5">
						<p className="text-muted-foreground text-sm">
							{t("waitingForCandidate")}
						</p>
						<form action={withdraw} className="mt-3">
							<Button type="submit" variant="ghost" size="sm">
								{t("withdraw")}
							</Button>
						</form>
					</section>
				)}
			</main>
			<Footer />
		</>
	);
}
