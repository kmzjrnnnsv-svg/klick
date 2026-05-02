import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { getJob } from "@/app/actions/jobs";
import { listOffersForEmployer, withdrawOffer } from "@/app/actions/offers";
import { auth } from "@/auth";
import { Footer } from "@/components/footer";
import { Header } from "@/components/header";
import { Button } from "@/components/ui/button";

const STATUS_TONES: Record<string, string> = {
	pending: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
	seen: "bg-blue-500/10 text-blue-700 dark:text-blue-300",
	accepted: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
	declined: "bg-rose-500/10 text-rose-700 dark:text-rose-300",
	countered: "bg-indigo-500/10 text-indigo-700 dark:text-indigo-300",
	withdrawn: "bg-zinc-500/10 text-muted-foreground",
	expired: "bg-zinc-500/10 text-muted-foreground",
};

export default async function JobOffersPage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const session = await auth();
	if (!session?.user?.id) redirect("/login");

	const { id } = await params;
	const job = await getJob(id);
	if (!job) notFound();

	const t = await getTranslations("EmployerOffers");
	const fmt = await getFormatter();
	const items = await listOffersForEmployer(id);

	async function withdraw(formData: FormData) {
		"use server";
		const offerId = formData.get("offerId")?.toString();
		if (!offerId) return;
		await withdrawOffer(offerId);
	}

	return (
		<>
			<Header />
			<main className="mx-auto w-full max-w-3xl flex-1 px-3 pt-6 pb-20 sm:px-6 sm:pt-12">
				<header className="mb-6">
					<Link
						href={`/jobs/${id}`}
						className="lv-eyebrow text-[0.55rem] text-muted-foreground hover:text-foreground"
					>
						← {job.title}
					</Link>
					<p className="mt-3 lv-eyebrow text-[0.6rem] text-primary">
						{t("eyebrow")}
					</p>
					<h1 className="mt-2 font-serif-display text-3xl sm:text-4xl">
						{t("title")}
					</h1>
					<p className="mt-2 text-muted-foreground text-sm">
						{t("subtitle", { count: items.length })}
					</p>
				</header>

				{items.length === 0 ? (
					<div className="rounded-sm border border-border border-dashed p-10 text-center sm:p-14">
						<p className="text-muted-foreground text-sm">{t("empty")}</p>
					</div>
				) : (
					<ul className="space-y-3">
						{items.map((o) => (
							<li
								key={o.id}
								className="rounded-sm border border-border bg-background p-4 transition-colors hover:bg-muted/30 sm:p-5"
							>
								<Link href={`/jobs/${id}/offers/${o.id}`} className="block">
									<div className="flex items-start justify-between gap-3">
										<div className="min-w-0">
											<div className="font-serif-display text-lg">
												{o.roleTitle}
											</div>
											<div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
												<span>
													<span className="text-muted-foreground">
														{t("salary")}:{" "}
													</span>
													{fmt.number(o.salaryProposed, {
														style: "currency",
														currency: "EUR",
														maximumFractionDigits: 0,
													})}
												</span>
												{o.startDateProposed && (
													<span>
														<span className="text-muted-foreground">
															{t("start")}:{" "}
														</span>
														{fmt.dateTime(o.startDateProposed, {
															dateStyle: "medium",
														})}
													</span>
												)}
												{o.lastActor === "candidate" && (
													<span className="text-indigo-700 dark:text-indigo-300">
														{t("counterIncoming")}
													</span>
												)}
											</div>
											<p className="mt-2 font-mono text-[10px] text-muted-foreground">
												{t("sentAt", {
													date: fmt.dateTime(o.createdAt, {
														dateStyle: "short",
													}),
												})}
												{o.expiresAt &&
													` · ${t("validUntil", {
														date: fmt.dateTime(o.expiresAt, {
															dateStyle: "short",
														}),
													})}`}
											</p>
											{o.message && (
												<p className="mt-2 line-clamp-3 text-muted-foreground text-xs leading-relaxed">
													{o.message}
												</p>
											)}
											{o.decidedMessage && (
												<p className="mt-2 rounded-sm border-l-2 border-primary/40 bg-muted/40 px-2 py-1 text-foreground text-xs leading-relaxed">
													{o.decidedMessage}
												</p>
											)}
										</div>
										<span
											className={`shrink-0 rounded-sm px-2 py-1 font-mono text-[10px] uppercase tracking-wide ${
												STATUS_TONES[o.status] ?? STATUS_TONES.pending
											}`}
										>
											{t(`status.${o.status}`)}
										</span>
									</div>
								</Link>
								{(o.status === "pending" || o.status === "seen") && (
									<form
										action={withdraw}
										className="mt-3 flex justify-end border-border border-t pt-3"
									>
										<input type="hidden" name="offerId" value={o.id} />
										<Button type="submit" variant="ghost" size="sm">
											{t("withdraw")}
										</Button>
									</form>
								)}
							</li>
						))}
					</ul>
				)}
			</main>
			<Footer />
		</>
	);
}
