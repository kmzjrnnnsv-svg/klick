import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import type { Job } from "@/db/schema";
import { cn } from "@/lib/utils";

const STATUS_COLORS: Record<Job["status"], string> = {
	draft: "border-amber-500/40 text-amber-700 dark:text-amber-300",
	published: "border-emerald-500/40 text-emerald-700 dark:text-emerald-300",
	archived: "border-zinc-500/40 text-muted-foreground",
};

export async function JobsList({ jobs }: { jobs: Job[] }) {
	const t = await getTranslations("Jobs");
	const fmt = await getFormatter();
	if (jobs.length === 0) {
		return (
			<div className="rounded-lg border border-border border-dashed p-10 text-center sm:p-16">
				<p className="text-muted-foreground text-sm">{t("listEmpty")}</p>
			</div>
		);
	}
	return (
		<ul className="divide-y divide-border rounded-lg border border-border bg-background">
			{jobs.map((j) => (
				<li key={j.id}>
					<Link
						href={`/jobs/${j.id}`}
						className="flex items-start gap-3 px-3 py-3 hover:bg-muted/50 sm:px-4 sm:py-4"
					>
						<div className="min-w-0 flex-1">
							<div className="flex items-center gap-2">
								<span className="truncate font-medium text-sm">{j.title}</span>
								<span
									className={cn(
										"shrink-0 rounded-md border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider",
										STATUS_COLORS[j.status],
									)}
								>
									{t(`statusOptions.${j.status}.title`)}
								</span>
							</div>
							<div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-muted-foreground text-xs">
								{j.location && <span>{j.location}</span>}
								{j.location && <span>·</span>}
								<span>{t(`remoteOptions.${j.remotePolicy}`)}</span>
								<span>·</span>
								<span>
									{fmt.dateTime(j.updatedAt, { dateStyle: "medium" })}
								</span>
							</div>
						</div>
					</Link>
				</li>
			))}
		</ul>
	);
}
