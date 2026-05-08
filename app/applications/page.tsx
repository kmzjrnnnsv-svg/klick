import Link from "next/link";
import { redirect } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { listMyApplications } from "@/app/actions/applications";
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

export default async function ApplicationsPage() {
	const session = await auth();
	if (!session?.user) redirect("/login");

	const t = await getTranslations("Applications");
	const fmt = await getFormatter();
	const items = await listMyApplications();

	return (
		<>
			<Header />
			<main className="mx-auto w-full max-w-3xl flex-1 px-3 pt-6 pb-20 sm:px-6 sm:pt-12">
				<header className="mb-6">
					<p className="lv-eyebrow text-[0.6rem] text-primary">
						{t("listEyebrow")}
					</p>
					<h1 className="mt-2 font-serif-display text-3xl sm:text-4xl">
						{t("listTitle")}
					</h1>
					<p className="mt-2 text-muted-foreground text-sm leading-relaxed">
						{t("listSubtitle")}
					</p>
				</header>

				{items.length === 0 ? (
					<div className="rounded-sm border border-border border-dashed p-10 text-center sm:p-14">
						<p className="text-muted-foreground text-sm">{t("listEmpty")}</p>
						<Link
							href="/jobs/browse"
							className="mt-4 inline-block text-primary text-sm hover:underline"
						>
							{t("listEmptyCta")} →
						</Link>
					</div>
				) : (
					<ul className="space-y-3">
						{items.map(({ application: a }) => (
							<li
								key={a.id}
								className="rounded-sm border border-border bg-background transition-colors hover:bg-muted/30"
							>
								<Link
									href={`/applications/${a.id}`}
									className="block p-4 sm:p-5"
								>
									<div className="flex items-start justify-between gap-3">
										<div className="min-w-0">
											<p className="lv-eyebrow text-[0.55rem] text-muted-foreground">
												{a.jobSnapshot.location ?? "—"}
											</p>
											<div className="mt-1 font-serif-display text-lg sm:text-xl">
												{a.jobSnapshot.title}
											</div>
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
												dateStyle: "medium",
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
