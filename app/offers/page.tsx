import { eq } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { listOffersForCandidate } from "@/app/actions/offers";
import { auth } from "@/auth";
import { Footer } from "@/components/footer";
import { Header } from "@/components/header";
import { db } from "@/db";
import { users } from "@/db/schema";

const STATUS_TONES: Record<string, string> = {
	pending: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
	seen: "bg-blue-500/10 text-blue-700 dark:text-blue-300",
	accepted: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
	declined: "bg-rose-500/10 text-rose-700 dark:text-rose-300",
	countered: "bg-indigo-500/10 text-indigo-700 dark:text-indigo-300",
	withdrawn: "bg-zinc-500/10 text-muted-foreground",
	expired: "bg-zinc-500/10 text-muted-foreground",
};

export default async function OffersPage() {
	const session = await auth();
	if (!session?.user?.id) redirect("/login");

	// Only candidates have a personal "Eingang"; employers go to /jobs.
	const [u] = await db
		.select({ role: users.role })
		.from(users)
		.where(eq(users.id, session.user.id))
		.limit(1);
	if (u?.role !== "candidate") redirect("/jobs");

	const t = await getTranslations("Offers");
	const fmt = await getFormatter();
	const items = await listOffersForCandidate();

	return (
		<>
			<Header />
			<main className="mx-auto w-full max-w-3xl flex-1 px-3 pt-6 pb-20 sm:px-6 sm:pt-12">
				<header className="mb-6">
					<p className="lv-eyebrow text-[0.6rem] text-primary">
						{t("eyebrow")}
					</p>
					<h1 className="mt-2 font-serif-display text-3xl sm:text-4xl">
						{t("title")}
					</h1>
					<p className="mt-2 text-muted-foreground text-sm leading-relaxed">
						{t("subtitle")}
					</p>
				</header>
				{items.length === 0 ? (
					<div className="rounded-sm border border-border border-dashed p-10 text-center sm:p-16">
						<p className="text-muted-foreground text-sm">{t("empty")}</p>
					</div>
				) : (
					<ul className="space-y-3">
						{items.map(({ offer, employer, job }) => (
							<li
								key={offer.id}
								className="rounded-sm border border-border bg-background p-4 transition-colors hover:bg-muted/30 sm:p-5"
							>
								<Link href={`/offers/${offer.id}`} className="block">
									<div className="flex items-start justify-between gap-3">
										<div className="min-w-0">
											<p className="lv-eyebrow text-[0.55rem] text-muted-foreground">
												{employer.isAgency
													? t("via", { name: employer.name })
													: employer.name}
											</p>
											<div className="mt-1 font-serif-display text-lg sm:text-xl">
												{offer.roleTitle}
											</div>
											{job.title && offer.roleTitle !== job.title && (
												<div className="text-muted-foreground text-xs">
													{t("forJob", { title: job.title })}
												</div>
											)}
										</div>
										<span
											className={`shrink-0 rounded-sm px-2 py-1 font-mono text-[10px] uppercase tracking-wide ${
												STATUS_TONES[offer.status] ?? STATUS_TONES.pending
											}`}
										>
											{t(`status.${offer.status}`)}
										</span>
									</div>
									<div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
										<span>
											<span className="text-muted-foreground">
												{t("salary")}:{" "}
											</span>
											{fmt.number(offer.salaryProposed, {
												style: "currency",
												currency: "EUR",
												maximumFractionDigits: 0,
											})}
										</span>
										{offer.startDateProposed && (
											<span>
												<span className="text-muted-foreground">
													{t("start")}:{" "}
												</span>
												{fmt.dateTime(offer.startDateProposed, {
													dateStyle: "medium",
												})}
											</span>
										)}
										{job.location && (
											<span className="text-muted-foreground">
												{job.location}
											</span>
										)}
										<span className="ml-auto text-[10px] text-muted-foreground">
											{fmt.dateTime(offer.createdAt, { dateStyle: "short" })}
										</span>
									</div>
								</Link>
							</li>
						))}
					</ul>
				)}
			</main>
			<Footer />
		</>
	);
}
