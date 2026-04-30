import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getJob } from "@/app/actions/jobs";
import { listMatchesForJob } from "@/app/actions/matches";
import { auth } from "@/auth";
import { Footer } from "@/components/footer";
import { Header } from "@/components/header";
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

	return (
		<>
			<Header />
			<main className="mx-auto w-full max-w-3xl flex-1 px-4 pt-12 pb-24 sm:px-6 sm:pt-16">
				<header className="mb-8">
					<Link
						href={`/jobs/${id}`}
						className="text-muted-foreground text-xs hover:text-foreground"
					>
						← {job.title}
					</Link>
					<h1 className="mt-1 font-semibold text-2xl tracking-tight sm:text-3xl">
						{t("candidatesTitle")}
					</h1>
					<p className="mt-1 text-muted-foreground text-sm">
						{t("candidatesSubtitle")}
					</p>
				</header>

				{candidates.length === 0 ? (
					<div className="rounded-lg border border-border border-dashed p-10 text-center sm:p-16">
						<p className="text-muted-foreground text-sm">
							{job.status === "published"
								? t("candidatesEmpty")
								: t("draftHint")}
						</p>
					</div>
				) : (
					<ul className="space-y-3">
						{candidates.map((c) => (
							<li
								key={c.match.id}
								className="rounded-lg border border-border bg-background p-4 sm:p-5"
							>
								<div className="flex items-start justify-between gap-3">
									<div className="min-w-0 flex-1">
										<div className="font-medium text-sm">
											{c.headline ?? t("anonymousCandidate")}
										</div>
										<div className="mt-0.5 text-muted-foreground text-xs">
											{c.location && `${c.location} · `}
											{c.yearsExperience !== null
												? t("yearsAbbr", { years: c.yearsExperience })
												: ""}
										</div>
									</div>
									<span
										className={cn(
											"rounded-md px-2 py-0.5 font-mono text-[11px]",
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
									<p className="mt-3 text-foreground/90 text-sm leading-relaxed">
										{c.match.rationale}
									</p>
								)}
								{c.match.matchedSkills && c.match.matchedSkills.length > 0 && (
									<div className="mt-3 flex flex-wrap gap-1.5">
										{c.match.matchedSkills.map((s) => (
											<span
												key={s}
												className="rounded-md bg-muted px-2 py-0.5 font-mono text-[11px]"
											>
												{s}
											</span>
										))}
									</div>
								)}
								{c.summary && (
									<p className="mt-3 line-clamp-3 text-muted-foreground text-xs leading-relaxed">
										{c.summary}
									</p>
								)}
								<div className="mt-4 border-border border-t pt-3 text-muted-foreground text-xs">
									{t("anonymizedHint")}
								</div>
							</li>
						))}
					</ul>
				)}
			</main>
			<Footer />
		</>
	);
}
