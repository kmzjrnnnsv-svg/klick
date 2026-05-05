import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { listCollabsForJob } from "@/app/actions/collabs";
import { getJob } from "@/app/actions/jobs";
import { auth } from "@/auth";
import { CollabInviteForm } from "@/components/agency/collab-invite-form";
import { Footer } from "@/components/footer";
import { Header } from "@/components/header";

const STATUS_TONES: Record<string, string> = {
	pending: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
	active: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
	rejected: "bg-rose-500/10 text-rose-700 dark:text-rose-300",
	ended: "bg-zinc-500/10 text-muted-foreground",
};

export default async function JobCollabsPage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const session = await auth();
	if (!session?.user) redirect("/login");

	const { id } = await params;
	const job = await getJob(id);
	if (!job) notFound();

	const t = await getTranslations("Collab");
	const fmt = await getFormatter();
	const collabs = await listCollabsForJob(id);

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
					<p className="mt-2 text-muted-foreground text-sm leading-relaxed">
						{t("subtitle")}
					</p>
				</header>

				<section className="mb-10 rounded-sm border border-border bg-background p-4 sm:p-6">
					<p className="lv-eyebrow text-[0.55rem] text-primary">
						{t("inviteEyebrow")}
					</p>
					<h2 className="mt-2 mb-3 font-serif-display text-xl">
						{t("inviteTitle")}
					</h2>
					<CollabInviteForm jobId={id} />
				</section>

				<section>
					<p className="lv-eyebrow text-[0.55rem] text-muted-foreground">
						{t("listEyebrow")}
					</p>
					<h2 className="mt-2 mb-4 font-serif-display text-xl">
						{t("listTitle")}
					</h2>
					{collabs.length === 0 ? (
						<p className="text-muted-foreground text-sm">{t("empty")}</p>
					) : (
						<ul className="space-y-3">
							{collabs.map((c) => (
								<li
									key={c.id}
									className="rounded-sm border border-border bg-background p-4"
								>
									<div className="flex items-start justify-between gap-3">
										<div>
											<p className="font-medium text-sm">{c.partnerEmail}</p>
											<p className="mt-1 font-mono text-[10px] text-muted-foreground">
												{t("split", {
													lead: c.leadCommissionPct,
													partner: c.partnerCommissionPct,
												})}
											</p>
											{c.scope && (
												<p className="mt-2 text-muted-foreground text-xs">
													{c.scope}
												</p>
											)}
											<p className="mt-2 font-mono text-[10px] text-muted-foreground">
												{t("createdAt", {
													date: fmt.dateTime(c.createdAt, {
														dateStyle: "short",
													}),
												})}
											</p>
										</div>
										<span
											className={`shrink-0 rounded-sm px-2 py-1 font-mono text-[10px] uppercase ${
												STATUS_TONES[c.status]
											}`}
										>
											{t(`status.${c.status}`)}
										</span>
									</div>
									{c.status === "active" && (
										<Link
											href={`/jobs/${id}/collabs/${c.id}`}
											className="lv-eyebrow mt-3 inline-block text-[0.55rem] text-primary hover:opacity-80"
										>
											{t("openProposals")} →
										</Link>
									)}
								</li>
							))}
						</ul>
					)}
				</section>
			</main>
			<Footer />
		</>
	);
}
