import { Briefcase, Building2, Users } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";

export function EmployerEmptyState({
	teamSize,
	hasOpenJob,
}: {
	teamSize: number;
	hasOpenJob: boolean;
}) {
	const t = useTranslations("EmployerDashboard.empty");

	const cards = [
		{
			icon: Briefcase,
			href: "/jobs/new",
			label: t("postJobLabel"),
			body: t("postJobBody"),
			done: hasOpenJob,
		},
		{
			icon: Users,
			href: "/agency/team",
			label: t("inviteTeamLabel"),
			body: t("inviteTeamBody"),
			done: teamSize > 1,
		},
		{
			icon: Building2,
			href: "/agency/profile",
			label: t("completeProfileLabel"),
			body: t("completeProfileBody"),
			done: false,
		},
	];

	return (
		<section>
			<div className="mb-4 rounded-lg border border-primary/30 bg-primary/5 p-4">
				<h2 className="font-medium text-sm">{t("heading")}</h2>
				<p className="mt-1 text-muted-foreground text-xs leading-relaxed">
					{t("blurb")}
				</p>
			</div>
			<div className="grid gap-3 sm:grid-cols-3">
				{cards.map((c) => (
					<Link
						key={c.href}
						href={c.href}
						className={`flex flex-col gap-2 rounded-lg border p-4 transition-colors ${
							c.done
								? "border-emerald-500/30 bg-emerald-500/5"
								: "border-border bg-background hover:bg-muted/30"
						}`}
					>
						<c.icon
							className={
								c.done ? "h-5 w-5 text-emerald-600" : "h-5 w-5 text-primary"
							}
							strokeWidth={1.5}
						/>
						<p className="font-medium text-sm">{c.label}</p>
						<p className="text-muted-foreground text-xs leading-relaxed">
							{c.body}
						</p>
						{c.done && (
							<span className="lv-eyebrow text-[0.5rem] text-emerald-700 dark:text-emerald-300">
								{t("done")}
							</span>
						)}
					</Link>
				))}
			</div>
		</section>
	);
}
