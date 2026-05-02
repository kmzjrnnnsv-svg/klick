import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { listFavoritesForJob } from "@/app/actions/favorites";
import {
	listDisclosedItemsForInterest,
	listInterestsForJob,
} from "@/app/actions/interests";
import { getJob } from "@/app/actions/jobs";
import { listMatchesForJob } from "@/app/actions/matches";
import { listOffersForEmployer } from "@/app/actions/offers";
import { listGrantedReferencesForInterest } from "@/app/actions/references";
import { auth } from "@/auth";
import { CandidateActions } from "@/components/employer/candidate-actions";
import { Footer } from "@/components/footer";
import { Header } from "@/components/header";
import { CandidateInsightsView } from "@/components/insights/candidate-insights";
import { ShowInterestButton } from "@/components/interests/show-interest-button";
import { cn } from "@/lib/utils";

export default async function JobCandidatesPage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const session = await auth();
	if (!session?.user?.id) redirect("/login");

	const { id } = await params;
	const job = await getJob(id);
	if (!job) notFound();

	const t = await getTranslations("Matches");
	const candidates = await listMatchesForJob(id);
	const interestsForJob = await listInterestsForJob(id);
	const favoriteRows = await listFavoritesForJob(id);
	const favoritedSet = new Set(
		favoriteRows.map((r) => r.favorite.candidateUserId),
	);
	const offersForJob = await listOffersForEmployer(id);
	const offerCandidateSet = new Set(
		offersForJob
			.filter(
				(o) =>
					o.status === "pending" ||
					o.status === "seen" ||
					o.status === "countered" ||
					o.status === "accepted",
			)
			.map((o) => o.candidateUserId),
	);

	// Map matchId → latest interest status (for the button) and revealed email
	// when status === "approved".
	const interestByMatch = new Map<
		string,
		{
			id: string;
			status: "pending" | "approved" | "rejected" | "expired";
			email: string | null;
			displayName: string | null;
			disclosedItems?: Awaited<
				ReturnType<typeof listDisclosedItemsForInterest>
			>;
			disclosedReferences?: Awaited<
				ReturnType<typeof listGrantedReferencesForInterest>
			>;
		}
	>();
	for (const i of interestsForJob) {
		const isApproved = i.interest.status === "approved";
		const disclosed = isApproved
			? await listDisclosedItemsForInterest(i.interest.id)
			: undefined;
		const refs = isApproved
			? await listGrantedReferencesForInterest(i.interest.id)
			: undefined;
		interestByMatch.set(i.interest.matchId, {
			id: i.interest.id,
			status: i.interest.status,
			email: i.candidate.email,
			displayName: i.candidate.displayName,
			disclosedItems: disclosed,
			disclosedReferences: refs,
		});
	}

	return (
		<>
			<Header />
			<main className="mx-auto w-full max-w-3xl flex-1 px-3 pt-6 pb-20 sm:px-6 sm:pt-12">
				<header className="mb-5 sm:mb-7">
					<Link
						href={`/jobs/${id}`}
						className="text-muted-foreground text-xs hover:text-foreground"
					>
						← {job.title}
					</Link>
					<h1 className="mt-0.5 font-semibold text-xl tracking-tight sm:text-3xl">
						{t("candidatesTitle")}
					</h1>
					<p className="mt-1 text-muted-foreground text-sm leading-snug">
						{t("candidatesSubtitle")}
					</p>
				</header>

				{candidates.length === 0 ? (
					<div className="rounded-lg border border-border border-dashed p-8 text-center sm:p-14">
						<p className="text-muted-foreground text-sm">
							{job.status === "published"
								? t("candidatesEmpty")
								: t("draftHint")}
						</p>
					</div>
				) : (
					<ul className="space-y-2.5">
						{candidates.map((c) => {
							const interest = interestByMatch.get(c.match.id) ?? null;
							const revealedName =
								interest?.status === "approved"
									? (interest.displayName ?? interest.email)
									: null;
							return (
								<li
									key={c.match.id}
									className="rounded-lg border border-border bg-background p-3 sm:p-4"
								>
									<div className="flex items-start justify-between gap-3">
										<div className="min-w-0 flex-1">
											<div className="font-medium text-sm">
												{revealedName ?? c.headline ?? t("anonymousCandidate")}
											</div>
											<div className="mt-0.5 text-muted-foreground text-xs">
												{c.location && `${c.location} · `}
												{c.yearsExperience !== null
													? t("yearsAbbr", { years: c.yearsExperience })
													: ""}
											</div>
											{interest?.status === "approved" && interest.email && (
												<div className="mt-1 font-mono text-primary text-xs">
													{interest.email}
												</div>
											)}
											{interest?.disclosedItems &&
												interest.disclosedItems.length > 0 && (
													<div className="mt-2">
														<p className="text-[10px] uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
															Freigegebene Dateien
														</p>
														<ul className="mt-1 space-y-0.5">
															{interest.disclosedItems.map((d) => (
																<li key={d.id} className="text-xs">
																	<a
																		href={`/api/vault/${d.id}/file`}
																		target="_blank"
																		rel="noreferrer"
																		className="text-primary hover:underline"
																	>
																		{d.filename}
																	</a>
																</li>
															))}
														</ul>
													</div>
												)}
											{interest?.disclosedReferences &&
												interest.disclosedReferences.length > 0 && (
													<div className="mt-2">
														<p className="text-[10px] uppercase tracking-wide text-indigo-700 dark:text-indigo-300">
															Freigegebene Referenzen
														</p>
														<ul className="mt-1 space-y-1.5">
															{interest.disclosedReferences.map((ref) => (
																<li
																	key={ref.referee + (ref.relation ?? "")}
																	className="rounded-sm border border-indigo-500/20 bg-indigo-500/5 p-2"
																>
																	<p className="font-medium text-xs">
																		{ref.referee}
																		{ref.relation ? ` · ${ref.relation}` : ""}
																	</p>
																	<dl className="mt-1.5 space-y-1 text-[11px]">
																		{ref.answers.map((a) => (
																			<div key={a.question.slice(0, 32)}>
																				<dt className="font-medium">
																					{a.question}
																				</dt>
																				<dd className="text-muted-foreground">
																					{a.answer}
																				</dd>
																			</div>
																		))}
																	</dl>
																</li>
															))}
														</ul>
													</div>
												)}
										</div>
										<span
											className={cn(
												"shrink-0 rounded-md px-2 py-0.5 font-mono text-[11px]",
												c.match.softScore >= 70
													? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
													: c.match.softScore >= 40
														? "bg-amber-500/10 text-amber-700 dark:text-amber-300"
														: "bg-zinc-500/10 text-muted-foreground",
											)}
										>
											{c.match.softScore}/100
										</span>
									</div>
									{c.match.rationale && (
										<p className="mt-2 text-foreground/90 text-sm leading-snug">
											{c.match.rationale}
										</p>
									)}
									{c.match.matchedSkills &&
										c.match.matchedSkills.length > 0 && (
											<div className="mt-2 flex flex-wrap gap-1">
												{c.match.matchedSkills.map((s) => (
													<span
														key={s}
														className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[11px]"
													>
														{s}
													</span>
												))}
												{c.match.adjacentSkills?.map((s) => (
													<span
														key={`adj-${s}`}
														className="rounded-md border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 font-mono text-[11px] text-amber-700 dark:text-amber-300"
													>
														{s} ⤴
													</span>
												))}
											</div>
										)}
									{c.match.commute && (
										<div className="mt-2 text-muted-foreground text-xs">
											{c.match.commute.km} km · ~{c.match.commute.minutes} min{" "}
											{c.match.commute.mode === "car"
												? "Auto"
												: c.match.commute.mode === "transit"
													? "ÖPNV"
													: c.match.commute.mode === "bike"
														? "Rad"
														: "zu Fuß"}
											{c.match.commute.exceedsLimit && " · über Wunsch-Limit"}
										</div>
									)}
									{((c.match.pros?.length ?? 0) > 0 ||
										(c.match.cons?.length ?? 0) > 0) && (
										<div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
											{c.match.pros && c.match.pros.length > 0 && (
												<div>
													<p className="mb-1 font-medium text-emerald-700 text-xs dark:text-emerald-300">
														+ Pro
													</p>
													<ul className="space-y-0.5 text-xs">
														{c.match.pros.map((p) => (
															<li key={p}>{p}</li>
														))}
													</ul>
												</div>
											)}
											{c.match.cons && c.match.cons.length > 0 && (
												<div>
													<p className="mb-1 font-medium text-amber-700 text-xs dark:text-amber-300">
														– Bedenken
													</p>
													<ul className="space-y-0.5 text-xs">
														{c.match.cons.map((p) => (
															<li key={p}>{p}</li>
														))}
													</ul>
												</div>
											)}
										</div>
									)}
									{c.match.experienceVerdict && (
										<p className="mt-2 font-mono text-[11px] text-muted-foreground">
											{c.match.experienceVerdict}
										</p>
									)}
									{c.summary && (
										<p className="mt-2 line-clamp-2 text-muted-foreground text-xs leading-snug">
											{c.summary}
										</p>
									)}
									{c.insights && (
										<details className="mt-3 rounded-md border border-border bg-muted/20 px-2.5 py-1.5 text-sm">
											<summary className="cursor-pointer font-medium text-xs text-muted-foreground">
												{t("insightsToggle")}
											</summary>
											<div className="mt-2.5">
												<CandidateInsightsView
													insights={c.insights}
													profileExtras={{
														industries: c.industries,
														awards: c.awards,
														certificationsMentioned: c.certificationsMentioned,
														mobility: c.mobility,
														preferredRoleLevel: c.preferredRoleLevel,
													}}
												/>
											</div>
										</details>
									)}
									<div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-border border-t pt-2.5 text-muted-foreground text-xs">
										<span>
											{interest?.status === "approved"
												? t("revealedHint")
												: t("anonymizedHint")}
										</span>
										<div className="flex flex-wrap items-center gap-2">
											<CandidateActions
												jobId={id}
												jobTitle={job.title}
												candidateUserId={c.match.candidateUserId}
												initialFavorited={favoritedSet.has(
													c.match.candidateUserId,
												)}
												hasOffer={offerCandidateSet.has(
													c.match.candidateUserId,
												)}
												defaultSalary={job.salaryMax ?? job.salaryMin ?? null}
											/>
											<ShowInterestButton
												matchId={c.match.id}
												currentStatus={interest?.status ?? null}
											/>
										</div>
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
