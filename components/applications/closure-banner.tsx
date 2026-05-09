import Link from "next/link";
import { useTranslations } from "next-intl";
import type { Application } from "@/db/schema";

// Banner für Arbeitgeber: Bewerbungen, deren Closure-Deadline abgelaufen
// ist. Sichtbar oben auf /jobs. Wenn 5+ überfällig sind, blockiert
// Volume-Lock neue Stellen. Quelle: 75% der Bewerbungen ohne Antwort —
// das wird hier zur harten Reibung statt nur Statistik.
export function ClosureBanner({
	overdue,
	blocked,
}: {
	overdue: { application: Application; daysOverdue: number }[];
	blocked: boolean;
}) {
	const t = useTranslations("Applications");
	if (overdue.length === 0) return null;
	return (
		<div
			className={`mb-6 rounded-sm border p-4 ${
				blocked
					? "border-rose-500/40 bg-rose-500/5"
					: "border-amber-500/40 bg-amber-500/5"
			}`}
		>
			<div className="flex flex-wrap items-baseline justify-between gap-2">
				<div>
					<p
						className={`lv-eyebrow text-[0.55rem] ${blocked ? "text-rose-700 dark:text-rose-300" : "text-amber-700 dark:text-amber-300"}`}
					>
						{blocked ? t("volumeLockEyebrow") : t("closureEyebrow")}
					</p>
					<h3 className="mt-1 font-serif-display text-base sm:text-lg">
						{blocked
							? t("volumeLockTitle", { count: overdue.length })
							: t("closureTitle", { count: overdue.length })}
					</h3>
				</div>
				<span className="font-mono text-[10px] text-muted-foreground uppercase tracking-wide">
					{t("closureScale")}
				</span>
			</div>
			<p className="mt-2 text-foreground/80 text-xs leading-relaxed">
				{blocked ? t("volumeLockHint") : t("closureHint")}
			</p>
			<ul className="mt-3 space-y-1">
				{overdue.slice(0, 5).map(({ application: a, daysOverdue }) => (
					<li
						key={a.id}
						className="flex items-baseline justify-between gap-3 rounded-sm bg-background px-3 py-2 text-xs"
					>
						<Link
							href={`/jobs/${a.jobId}/applications/${a.id}`}
							className="truncate hover:underline"
						>
							{a.profileSnapshot.displayName ?? t("anonymousCandidate")}
							<span className="text-muted-foreground">
								{" "}
								— {a.jobSnapshot.title}
							</span>
						</Link>
						<span className="shrink-0 font-mono text-[10px] text-rose-700 dark:text-rose-300">
							+{daysOverdue}d
						</span>
					</li>
				))}
				{overdue.length > 5 && (
					<li className="text-muted-foreground text-xs">
						{t("closureMore", { n: overdue.length - 5 })}
					</li>
				)}
			</ul>
		</div>
	);
}
