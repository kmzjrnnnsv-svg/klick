import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import {
	counterOffer,
	getOfferForCandidate,
	getOfferThread,
	markOfferSeen,
	respondToOffer,
} from "@/app/actions/offers";
import { getOutcome } from "@/app/actions/outcomes";
import { auth } from "@/auth";
import { Footer } from "@/components/footer";
import { Header } from "@/components/header";
import { OutcomePrompt } from "@/components/outcomes/outcome-prompt";
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

export default async function OfferDetailPage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const session = await auth();
	if (!session?.user) redirect("/login");

	const { id } = await params;
	const t = await getTranslations("Offers");
	const fmt = await getFormatter();
	const item = await getOfferForCandidate(id);
	if (!item) notFound();

	// Mark seen on first open (best effort, no-throw inside).
	if (item.offer.status === "pending") await markOfferSeen(id);

	const { offer, employer, job } = item;
	const thread = await getOfferThread(id);
	// Show actions only if the candidate is the next to respond.
	// (= last actor was the employer, status open)
	const isOpen =
		(offer.status === "pending" || offer.status === "seen") &&
		offer.lastActor === "employer";

	async function accept(fd: FormData) {
		"use server";
		await respondToOffer({
			offerId: id,
			decision: "accepted",
			message: fd.get("message")?.toString(),
		});
		redirect(`/offers/${id}?d=accepted`);
	}

	async function decline(fd: FormData) {
		"use server";
		await respondToOffer({
			offerId: id,
			decision: "declined",
			message: fd.get("message")?.toString(),
		});
		redirect(`/offers/${id}?d=declined`);
	}

	async function counter(fd: FormData) {
		"use server";
		const salary = Number(fd.get("salary") ?? "0");
		if (!Number.isFinite(salary) || salary <= 0) return;
		const res = await counterOffer({
			parentOfferId: id,
			salaryProposed: Math.round(salary),
			message: fd.get("message")?.toString(),
		});
		redirect(`/offers/${res.id}`);
	}

	return (
		<>
			<Header />
			<main className="mx-auto w-full max-w-2xl flex-1 px-3 pt-6 pb-20 sm:px-6 sm:pt-12">
				<Link
					href="/offers"
					className="lv-eyebrow text-[0.6rem] text-muted-foreground hover:text-foreground"
				>
					← {t("backToInbox")}
				</Link>

				<header className="mt-3 mb-8">
					<p className="lv-eyebrow text-[0.6rem] text-primary">
						{employer.isAgency
							? t("via", { name: employer.name })
							: employer.name}
					</p>
					<h1 className="mt-2 font-serif-display text-3xl sm:text-5xl">
						{offer.roleTitle}
					</h1>
					{job.title && offer.roleTitle !== job.title && (
						<p className="mt-2 text-muted-foreground text-sm">
							{t("forJob", { title: job.title })}
							{job.location && ` · ${job.location}`}
						</p>
					)}
				</header>

				<dl className="grid grid-cols-2 gap-x-6 gap-y-4 border-border border-t border-b py-6">
					<div>
						<dt className="lv-eyebrow text-[0.55rem] text-muted-foreground">
							{t("salary")}
						</dt>
						<dd className="mt-1 font-serif-display text-2xl">
							{fmt.number(offer.salaryProposed, {
								style: "currency",
								currency: "EUR",
								maximumFractionDigits: 0,
							})}
						</dd>
					</div>
					{offer.startDateProposed && (
						<div>
							<dt className="lv-eyebrow text-[0.55rem] text-muted-foreground">
								{t("start")}
							</dt>
							<dd className="mt-1 font-serif-display text-2xl">
								{fmt.dateTime(offer.startDateProposed, { dateStyle: "long" })}
							</dd>
						</div>
					)}
					<div>
						<dt className="lv-eyebrow text-[0.55rem] text-muted-foreground">
							{t("status.label")}
						</dt>
						<dd className="mt-1 text-sm">{t(`status.${offer.status}`)}</dd>
					</div>
					{offer.expiresAt && (
						<div>
							<dt className="lv-eyebrow text-[0.55rem] text-muted-foreground">
								{t("expires")}
							</dt>
							<dd className="mt-1 text-sm">
								{fmt.dateTime(offer.expiresAt, { dateStyle: "long" })}
							</dd>
						</div>
					)}
				</dl>

				{offer.message && (
					<section className="mt-8">
						<p className="lv-eyebrow text-[0.55rem] text-muted-foreground">
							{t("message")}
						</p>
						<p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">
							{offer.message}
						</p>
					</section>
				)}

				<section className="mt-8 flex flex-wrap gap-3">
					{job.id && (
						<Link
							href={`/jobs/browse/${job.id}`}
							className="lv-eyebrow rounded-sm border border-foreground/30 px-4 py-2 text-[0.6rem] text-foreground transition-colors hover:bg-foreground hover:text-background"
						>
							{t("viewJob")}
						</Link>
					)}
					{employer.id && (
						<Link
							href={`/c/${employer.id}`}
							className="lv-eyebrow rounded-sm border border-foreground/30 px-4 py-2 text-[0.6rem] text-foreground transition-colors hover:bg-foreground hover:text-background"
						>
							{t("viewCompany")}
						</Link>
					)}
				</section>

				{thread.length > 1 && (
					<section className="mt-8">
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
													? employer.name
													: t("you")}
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
												<p className="mt-2 whitespace-pre-wrap text-foreground/90 text-xs leading-relaxed">
													{step.message}
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
				)}

				{isOpen && (
					<section className="mt-10 space-y-6 border-border border-t pt-8">
						<div>
							<p className="lv-eyebrow text-[0.6rem] text-primary">
								{t("decide")}
							</p>
							<p className="mt-2 text-muted-foreground text-sm leading-relaxed">
								{t("decideHint")}
							</p>
						</div>

						<form action={accept} className="space-y-3">
							<Input
								name="message"
								placeholder={t("acceptMessage")}
								className="h-11"
							/>
							<Button type="submit" className="w-full">
								{t("accept")}
							</Button>
						</form>

						<form
							action={counter}
							className="space-y-3 rounded-sm border border-border p-4"
						>
							<p className="lv-eyebrow text-[0.55rem] text-muted-foreground">
								{t("counter")}
							</p>
							<div className="grid grid-cols-2 gap-3">
								<Input
									name="salary"
									type="number"
									min={0}
									step={1000}
									placeholder={t("counterSalary")}
									required
								/>
								<Input name="message" placeholder={t("counterMessage")} />
							</div>
							<Button type="submit" variant="outline" className="w-full">
								{t("counterSend")}
							</Button>
						</form>

						<form action={decline} className="space-y-3">
							<Input
								name="message"
								placeholder={t("declineMessage")}
								className="h-11"
							/>
							<Button type="submit" variant="ghost" className="w-full">
								{t("decline")}
							</Button>
						</form>
					</section>
				)}

				{!isOpen && offer.decidedMessage && (
					<section className="mt-8 rounded-sm border border-border bg-muted/30 p-4">
						<p className="lv-eyebrow text-[0.55rem] text-muted-foreground">
							{t("yourMessage")}
						</p>
						<p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">
							{offer.decidedMessage}
						</p>
					</section>
				)}

				{offer.status === "accepted" && (
					<section className="mt-8">
						<OutcomePrompt
							jobId={offer.jobId}
							candidateUserId={offer.candidateUserId}
							actor="candidate"
							existing={
								await getOutcome({
									jobId: offer.jobId,
									candidateUserId: offer.candidateUserId,
									role: "candidate",
								}).then((o) =>
									o
										? {
												kind: o.kind,
												finalSalary: o.finalSalary,
												notes: o.notes,
											}
										: null,
								)
							}
						/>
					</section>
				)}
			</main>
			<Footer />
		</>
	);
}
