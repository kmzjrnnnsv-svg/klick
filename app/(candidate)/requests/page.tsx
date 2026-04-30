import Link from "next/link";
import { redirect } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { listIncomingInterests } from "@/app/actions/interests";
import { auth } from "@/auth";
import { Footer } from "@/components/footer";
import { Header } from "@/components/header";
import { cn } from "@/lib/utils";

const STATUS_COLORS: Record<string, string> = {
	pending: "border-amber-500/40 text-amber-700 dark:text-amber-300",
	approved: "border-emerald-500/40 text-emerald-700 dark:text-emerald-300",
	rejected: "border-rose-500/40 text-rose-700 dark:text-rose-300",
	expired: "border-zinc-500/40 text-muted-foreground",
};

export default async function RequestsPage() {
	const session = await auth();
	if (!session?.user) redirect("/login");

	const t = await getTranslations("Requests");
	const fmt = await getFormatter();
	const items = await listIncomingInterests();

	return (
		<>
			<Header />
			<main className="mx-auto w-full max-w-3xl flex-1 px-3 pt-6 pb-20 sm:px-6 sm:pt-12">
				<header className="mb-5 sm:mb-7">
					<h1 className="font-semibold text-xl tracking-tight sm:text-3xl">
						{t("title")}
					</h1>
					<p className="mt-2 text-muted-foreground text-sm leading-relaxed">
						{t("subtitle")}
					</p>
				</header>

				{items.length === 0 ? (
					<div className="rounded-lg border border-border border-dashed p-10 text-center sm:p-16">
						<p className="text-muted-foreground text-sm">{t("empty")}</p>
					</div>
				) : (
					<ul className="space-y-3">
						{items.map(({ interest, job, companyName }) => (
							<li key={interest.id}>
								<Link
									href={`/requests/${interest.id}`}
									className="block rounded-lg border border-border bg-background p-4 hover:bg-muted/30 sm:p-5"
								>
									<div className="flex items-start justify-between gap-3">
										<div className="min-w-0 flex-1">
											<div className="font-medium text-sm">{job.title}</div>
											<div className="mt-0.5 text-muted-foreground text-xs">
												{companyName}
												{job.location && ` · ${job.location}`}
											</div>
										</div>
										<div className="flex flex-col items-end gap-1">
											<span
												className={cn(
													"rounded-md border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider",
													STATUS_COLORS[interest.status],
												)}
											>
												{t(`status.${interest.status}`)}
											</span>
											<span className="font-mono text-[10px] text-muted-foreground">
												{t(`depths.${interest.verifyDepth}`)}
											</span>
										</div>
									</div>
									<div className="mt-2 text-muted-foreground text-xs">
										{t("receivedAt", {
											time: fmt.dateTime(interest.createdAt, {
												dateStyle: "medium",
												timeStyle: "short",
											}),
										})}
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
