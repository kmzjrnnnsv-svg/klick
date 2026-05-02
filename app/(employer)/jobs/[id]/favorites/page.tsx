import { Star } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { listFavoritesForJob } from "@/app/actions/favorites";
import { getJob } from "@/app/actions/jobs";
import { listOffersForEmployer } from "@/app/actions/offers";
import { auth } from "@/auth";
import { Footer } from "@/components/footer";
import { Header } from "@/components/header";

export default async function JobFavoritesPage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const session = await auth();
	if (!session?.user?.id) redirect("/login");

	const { id } = await params;
	const job = await getJob(id);
	if (!job) notFound();

	const t = await getTranslations("Favorites");
	const fmt = await getFormatter();
	const favorites = await listFavoritesForJob(id);
	const offers = await listOffersForEmployer(id);
	const offerByCandidate = new Map(
		offers.map((o) => [o.candidateUserId, o] as const),
	);

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
						{t("subtitle", { count: favorites.length })}
					</p>
				</header>

				{favorites.length === 0 ? (
					<div className="rounded-sm border border-border border-dashed p-10 text-center sm:p-14">
						<Star
							className="mx-auto mb-3 h-5 w-5 text-muted-foreground"
							strokeWidth={1.5}
						/>
						<p className="text-muted-foreground text-sm">{t("empty")}</p>
						<Link
							href={`/jobs/${id}/candidates`}
							className="mt-4 inline-block text-primary text-sm hover:underline"
						>
							{t("emptyCta")} →
						</Link>
					</div>
				) : (
					<ul className="divide-y divide-border border-border border-t border-b">
						{favorites.map(({ favorite, candidate }) => {
							const offer = offerByCandidate.get(favorite.candidateUserId);
							return (
								<li key={favorite.id} className="grid gap-3 py-4 sm:py-5">
									<div className="flex items-start justify-between gap-3">
										<div className="min-w-0">
											<div className="font-serif-display text-lg">
												{candidate.displayName ?? t("anonymous")}
											</div>
											{favorite.notes && (
												<p className="mt-1 text-muted-foreground text-xs italic">
													„{favorite.notes}"
												</p>
											)}
											<p className="mt-1 font-mono text-[10px] text-muted-foreground">
												{t("addedAt", {
													date: fmt.dateTime(favorite.createdAt, {
														dateStyle: "medium",
													}),
												})}
											</p>
										</div>
										{offer && (
											<span className="lv-eyebrow rounded-sm bg-muted px-2 py-1 text-[0.5rem] text-foreground">
												{t(`offerStatus.${offer.status}`)}
											</span>
										)}
									</div>
									<div className="flex flex-wrap gap-2 text-xs">
										<Link
											href={`/jobs/${id}/candidates#${favorite.candidateUserId}`}
											className="lv-eyebrow rounded-sm border border-foreground/30 px-3 py-1.5 text-[0.55rem] text-foreground transition-colors hover:bg-foreground hover:text-background"
										>
											{t("viewMatch")}
										</Link>
									</div>
								</li>
							);
						})}
					</ul>
				)}
			</main>
			<Footer />
		</>
	);
}
