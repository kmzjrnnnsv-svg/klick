import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { listApplicationsForJob } from "@/app/actions/applications";
import { getJob } from "@/app/actions/jobs";
import { auth } from "@/auth";
import { Footer } from "@/components/footer";
import { Header } from "@/components/header";

const STATUS_TONES: Record<string, string> = {
	submitted: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
	seen: "bg-blue-500/10 text-blue-700 dark:text-blue-300",
	in_review: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
	shortlisted: "bg-indigo-500/10 text-indigo-700 dark:text-indigo-300",
	interview: "bg-purple-500/10 text-purple-700 dark:text-purple-300",
	offer: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
	declined: "bg-rose-500/10 text-rose-700 dark:text-rose-300",
	withdrawn: "bg-zinc-500/10 text-muted-foreground",
	archived: "bg-zinc-500/10 text-muted-foreground",
};

export default async function JobApplicationsPage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const session = await auth();
	if (!session?.user) redirect("/login");

	const { id } = await params;
	const job = await getJob(id);
	if (!job) notFound();

	const t = await getTranslations("Applications");
	const fmt = await getFormatter();
	const items = await listApplicationsForJob(id);

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
						{t("employerListEyebrow")}
					</p>
					<div className="mt-2 flex flex-wrap items-baseline justify-between gap-3">
						<h1 className="font-serif-display text-3xl sm:text-4xl">
							{t("employerListTitle")}
						</h1>
						<Link
							href={`/jobs/${id}/applications/board`}
							className="inline-flex h-9 items-center gap-2 rounded-sm border border-primary/40 bg-primary/5 px-3 text-primary text-xs hover:bg-primary hover:text-primary-foreground"
						>
							{t("openBoard")} →
						</Link>
					</div>
					<p className="mt-2 text-muted-foreground text-sm">
						{t("employerListSubtitle", { count: items.length })}
					</p>
				</header>

				{items.length === 0 ? (
					<div className="rounded-sm border border-border border-dashed p-10 text-center sm:p-14">
						<p className="text-muted-foreground text-sm">
							{t("employerEmpty")}
						</p>
					</div>
				) : (
					<ul className="space-y-3">
						{items.map((a) => (
							<li
								key={a.id}
								className="rounded-sm border border-border bg-background transition-colors hover:bg-muted/30"
							>
								<Link
									href={`/jobs/${id}/applications/${a.id}`}
									className="block p-4 sm:p-5"
								>
									<div className="flex items-start justify-between gap-3">
										<div className="min-w-0">
											<p className="font-medium text-sm">
												{a.profileSnapshot.displayName ??
													a.profileSnapshot.headline ??
													t("anonymousCandidate")}
											</p>
											<p className="mt-0.5 text-muted-foreground text-xs">
												{a.profileSnapshot.headline ?? ""}
												{a.profileSnapshot.location
													? ` · ${a.profileSnapshot.location}`
													: ""}
											</p>
											{a.matchSnapshot && (
												<p className="mt-1 font-mono text-[10px] text-muted-foreground">
													{t("scoreAtTime")}: {a.matchSnapshot.softScore}/100
												</p>
											)}
										</div>
										<span
											className={`shrink-0 rounded-sm px-2 py-1 font-mono text-[10px] uppercase tracking-wide ${
												STATUS_TONES[a.status] ?? STATUS_TONES.submitted
											}`}
										>
											{t(`status.${a.status}`)}
										</span>
									</div>
									<p className="mt-3 font-mono text-[10px] text-muted-foreground">
										{t("submittedAt", {
											date: fmt.dateTime(a.createdAt, {
												dateStyle: "short",
											}),
										})}
									</p>
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
