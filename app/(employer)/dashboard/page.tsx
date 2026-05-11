import { eq } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { getEmployerAnalytics } from "@/app/actions/employer-analytics";
import { auth } from "@/auth";
import {
	FunnelChart,
	HBarChart,
	StackedBar,
	VBarHistogram,
} from "@/components/admin/charts";
import { EmployerEmptyState } from "@/components/employer/empty-state";
import { Footer } from "@/components/footer";
import { Header } from "@/components/header";
import { db } from "@/db";
import { users } from "@/db/schema";

function StatTile({
	label,
	value,
	hint,
	tone,
}: {
	label: string;
	value: string | number;
	hint?: string;
	tone?: "primary" | "emerald" | "amber" | "rose";
}) {
	const ring: Record<string, string> = {
		primary: "border-primary/30 bg-primary/5",
		emerald: "border-emerald-500/30 bg-emerald-500/5",
		amber: "border-amber-500/30 bg-amber-500/5",
		rose: "border-rose-500/30 bg-rose-500/5",
	};
	const cls = tone ? ring[tone] : "border-border bg-background";
	return (
		<div className={`rounded-lg border p-3 ${cls}`}>
			<p className="lv-eyebrow text-[0.5rem] text-muted-foreground">{label}</p>
			<p className="mt-1 font-serif-display text-2xl tabular-nums">{value}</p>
			{hint && (
				<p className="mt-0.5 font-mono text-[10px] text-muted-foreground">
					{hint}
				</p>
			)}
		</div>
	);
}

function Card({
	title,
	hint,
	children,
}: {
	title: string;
	hint?: string;
	children: React.ReactNode;
}) {
	return (
		<section className="rounded-lg border border-border bg-background p-4">
			<h2 className="font-medium text-sm">{title}</h2>
			{hint && (
				<p className="mt-0.5 mb-3 text-muted-foreground text-xs">{hint}</p>
			)}
			{!hint && <div className="mt-3" />}
			{children}
		</section>
	);
}

const STATUS_LABEL_DE: Record<string, string> = {
	submitted: "eingereicht",
	seen: "gesehen",
	in_review: "in Prüfung",
	shortlisted: "Shortlist",
	interview: "Interview",
	offer: "Angebot",
	declined: "abgesagt",
	withdrawn: "zurückgezogen",
	archived: "archiviert",
};

export default async function EmployerDashboardPage() {
	const session = await auth();
	if (!session?.user?.id) redirect("/login");
	const [me] = await db
		.select({ role: users.role })
		.from(users)
		.where(eq(users.id, session.user.id))
		.limit(1);
	if (me?.role !== "employer") redirect("/post-login");

	const t = await getTranslations("EmployerDashboard");
	const fmt = await getFormatter();
	const a = await getEmployerAnalytics();
	if (!a) {
		return (
			<>
				<Header />
				<main className="mx-auto w-full max-w-3xl flex-1 px-3 pt-6 pb-20 sm:px-6 sm:pt-12">
					<h1 className="mb-4 font-semibold text-xl tracking-tight sm:text-3xl">
						{t("title")}
					</h1>
					<p className="rounded-sm border border-border border-dashed p-6 text-center text-muted-foreground text-sm">
						{t("noEmployer")}
					</p>
				</main>
				<Footer />
			</>
		);
	}

	const isEmpty = a.kpis.openJobs === 0 && a.kpis.applications30d === 0;

	return (
		<>
			<Header />
			<main className="mx-auto w-full max-w-5xl flex-1 px-3 pt-6 pb-20 sm:px-6 sm:pt-12">
				<header className="mb-6 flex flex-wrap items-baseline justify-between gap-3 sm:mb-8">
					<div>
						<p className="lv-eyebrow text-[0.55rem] text-primary">
							{a.companyName}
						</p>
						<h1 className="mt-1 font-semibold text-xl tracking-tight sm:text-3xl">
							{t("title")}
						</h1>
						<p className="mt-1 text-muted-foreground text-sm leading-snug">
							{t("subtitle")}
						</p>
					</div>
					<Link
						href="/jobs/new"
						className="inline-flex h-9 items-center gap-2 rounded-sm bg-primary px-3 text-primary-foreground text-xs hover:bg-primary/90"
					>
						{t("postJobCta")}
					</Link>
				</header>

				{isEmpty ? (
					<EmployerEmptyState
						teamSize={a.teamSize}
						hasOpenJob={a.kpis.openJobs > 0}
					/>
				) : (
					<>
						<section className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
							<StatTile
								label={t("openJobs")}
								value={a.kpis.openJobs}
								tone="primary"
							/>
							<StatTile
								label={t("apps30d")}
								value={a.kpis.applications30d}
								tone="primary"
							/>
							<StatTile
								label={t("offerAcceptRate")}
								value={`${a.kpis.offerAcceptRate} %`}
								tone="emerald"
							/>
							<StatTile
								label={t("medianResponse")}
								value={a.kpis.medianResponseHours ?? "—"}
								hint={t("hoursHint")}
							/>
						</section>

						<section className="mb-8">
							<Card title={t("funnel")} hint={t("funnelHint")}>
								<FunnelChart
									steps={[
										{ label: t("appsLabel"), n: a.funnel.applications },
										{
											label: t("seen"),
											n: a.funnel.seen,
											pct:
												a.funnel.applications > 0
													? Math.round(
															(a.funnel.seen / a.funnel.applications) * 100,
														)
													: 0,
										},
										{
											label: t("inReview"),
											n: a.funnel.inReview,
											pct:
												a.funnel.seen > 0
													? Math.round(
															(a.funnel.inReview / a.funnel.seen) * 100,
														)
													: 0,
										},
										{
											label: t("shortlist"),
											n: a.funnel.shortlisted,
											pct:
												a.funnel.inReview > 0
													? Math.round(
															(a.funnel.shortlisted / a.funnel.inReview) * 100,
														)
													: 0,
										},
										{
											label: t("interview"),
											n: a.funnel.interview,
											pct:
												a.funnel.shortlisted > 0
													? Math.round(
															(a.funnel.interview / a.funnel.shortlisted) * 100,
														)
													: 0,
										},
										{
											label: t("offer"),
											n: a.funnel.offer,
											pct:
												a.funnel.interview > 0
													? Math.round(
															(a.funnel.offer / a.funnel.interview) * 100,
														)
													: 0,
										},
										{
											label: t("accepted"),
											n: a.funnel.accepted,
											pct:
												a.funnel.offer > 0
													? Math.round(
															(a.funnel.accepted / a.funnel.offer) * 100,
														)
													: 0,
										},
									]}
								/>
							</Card>
						</section>

						<section className="mb-8 grid gap-3 sm:grid-cols-2">
							<Card title={t("statusMix")}>
								<StackedBar
									items={a.applicationStatusMix.map((s) => ({
										label: STATUS_LABEL_DE[s.status] ?? s.status,
										n: s.n,
									}))}
								/>
							</Card>
							<Card title={t("volume30d")} hint={t("volume30dHint")}>
								<VBarHistogram
									items={a.volume30d.map((b) => ({
										label: b.bucket,
										n: b.n,
									}))}
								/>
							</Card>
						</section>

						<section className="mb-8 grid gap-3 sm:grid-cols-2">
							<Card title={t("topJobs")}>
								<HBarChart
									items={a.topJobs.map((j) => ({ label: j.title, n: j.n }))}
								/>
							</Card>
							<Card title={t("timeToFill")} hint={t("timeToFillHint")}>
								<dl className="grid grid-cols-4 gap-3 text-sm">
									<div>
										<dt className="text-muted-foreground text-xs">
											{t("ttfCount")}
										</dt>
										<dd className="mt-0.5 font-serif-display text-xl tabular-nums">
											{a.timeToFill.count}
										</dd>
									</div>
									<div>
										<dt className="text-muted-foreground text-xs">P25</dt>
										<dd className="mt-0.5 font-serif-display text-xl tabular-nums">
											{a.timeToFill.p25Days ?? "—"}
										</dd>
									</div>
									<div>
										<dt className="text-muted-foreground text-xs">
											{t("median")}
										</dt>
										<dd className="mt-0.5 font-serif-display text-xl tabular-nums">
											{a.timeToFill.medianDays ?? "—"}
										</dd>
									</div>
									<div>
										<dt className="text-muted-foreground text-xs">P75</dt>
										<dd className="mt-0.5 font-serif-display text-xl tabular-nums">
											{a.timeToFill.p75Days ?? "—"}
										</dd>
									</div>
								</dl>
							</Card>
						</section>

						<section className="mb-8">
							<Card title={t("activity")} hint={t("activityHint")}>
								{a.activity.length === 0 ? (
									<p className="text-muted-foreground text-xs italic">
										{t("noActivity")}
									</p>
								) : (
									<ol className="space-y-2 text-xs">
										{a.activity.map((e) => (
											<li
												key={`${e.applicationId}-${e.ts.toISOString()}`}
												className="flex items-baseline gap-3"
											>
												<span className="w-20 shrink-0 font-mono text-[10px] text-muted-foreground">
													{fmt.dateTime(e.ts, { dateStyle: "short" })}
												</span>
												<span className="flex-1">
													{e.kind === "status_change" && e.status
														? `Status → ${STATUS_LABEL_DE[e.status] ?? e.status}`
														: e.kind === "stage_change" && e.outcome
															? `Stage: ${e.outcome}`
															: e.kind}
												</span>
												<Link
													href={`/applications/${e.applicationId}`}
													className="shrink-0 text-primary hover:underline"
												>
													{t("openApp")}
												</Link>
											</li>
										))}
									</ol>
								)}
							</Card>
						</section>
					</>
				)}
			</main>
			<Footer />
		</>
	);
}
