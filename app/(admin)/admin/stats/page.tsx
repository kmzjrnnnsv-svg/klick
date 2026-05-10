import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getAdminAnalytics } from "@/app/actions/admin";
import { auth } from "@/auth";
import { Footer } from "@/components/footer";
import { Header } from "@/components/header";
import { db } from "@/db";
import { users } from "@/db/schema";

function pctBar({ pct }: { pct: number }) {
	return (
		<div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
			<div
				className="h-full rounded-full bg-primary"
				style={{ width: `${Math.min(100, pct)}%` }}
			/>
		</div>
	);
}

function StatCard({
	label,
	value,
	hint,
}: {
	label: string;
	value: string | number;
	hint?: string;
}) {
	return (
		<div className="rounded-sm border border-border bg-background p-3">
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

export default async function AdminStatsPage() {
	const session = await auth();
	if (!session?.user?.id) redirect("/login");
	const [user] = await db
		.select({ role: users.role })
		.from(users)
		.where(eq(users.id, session.user.id))
		.limit(1);
	if (user?.role !== "admin") redirect("/post-login");

	const t = await getTranslations("AdminStats");
	const a = await getAdminAnalytics();

	const completionPct = (n: number) =>
		a.profileCompleteness.total > 0
			? Math.round((n / a.profileCompleteness.total) * 100)
			: 0;

	return (
		<>
			<Header />
			<main className="mx-auto w-full max-w-5xl flex-1 px-3 pt-6 pb-20 sm:px-6 sm:pt-12">
				<header className="mb-5 sm:mb-7">
					<h1 className="font-semibold text-xl tracking-tight sm:text-3xl">
						{t("title")}
					</h1>
					<p className="mt-1.5 text-muted-foreground text-sm leading-snug">
						{t("subtitle")}
					</p>
				</header>

				<section className="mb-8">
					<h2 className="mb-3 font-medium text-sm">{t("growth")}</h2>
					<div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
						<StatCard
							label={t("usersLabel")}
							value={a.growth.users7d}
							hint={t("over30d", { n: a.growth.users30d })}
						/>
						<StatCard
							label={t("jobsLabel")}
							value={a.growth.jobs7d}
							hint={t("over30d", { n: a.growth.jobs30d })}
						/>
						<StatCard
							label={t("matchesLabel")}
							value={a.growth.matches7d}
							hint={t("over30d", { n: a.growth.matches30d })}
						/>
					</div>
				</section>

				<section className="mb-8">
					<h2 className="mb-3 font-medium text-sm">{t("funnel")}</h2>
					<div className="grid gap-3 sm:grid-cols-4">
						<StatCard label={t("matchesLabel")} value={a.funnel.matches} />
						<StatCard
							label={t("interestsLabel")}
							value={a.funnel.interests}
							hint={t("conversionPct", { pct: a.conversion.matchToInterest })}
						/>
						<StatCard
							label={t("approvedLabel")}
							value={a.funnel.interestsApproved}
							hint={t("conversionPct", { pct: a.conversion.interestToApproval })}
						/>
						<StatCard
							label={t("offersLabel")}
							value={a.funnel.offers}
							hint={t("conversionPct", { pct: a.conversion.approvalToOffer })}
						/>
						<StatCard
							label={t("offersAccepted")}
							value={a.funnel.offersAccepted}
							hint={t("conversionPct", { pct: a.conversion.offerToAccept })}
						/>
						<StatCard
							label={t("offersDeclined")}
							value={a.funnel.offersDeclined}
						/>
						<StatCard
							label={t("offersPending")}
							value={a.funnel.offersPending}
						/>
						<StatCard
							label={t("interestsRejected")}
							value={a.funnel.interestsRejected}
						/>
					</div>
				</section>

				<section className="mb-8 grid gap-4 sm:grid-cols-2">
					<div className="rounded-sm border border-border bg-background p-4">
						<h2 className="mb-3 font-medium text-sm">
							{t("candidateResponse")}
						</h2>
						<dl className="space-y-2 text-sm">
							<div className="flex items-center justify-between">
								<dt className="text-muted-foreground text-xs">
									{t("decided")}
								</dt>
								<dd className="font-mono">{a.candidateResponse.decided}</dd>
							</div>
							<div className="flex items-center justify-between">
								<dt className="text-muted-foreground text-xs">
									{t("pending")}
								</dt>
								<dd className="font-mono">{a.candidateResponse.pending}</dd>
							</div>
							<div className="flex items-center justify-between">
								<dt className="text-muted-foreground text-xs">
									{t("medianHours")}
								</dt>
								<dd className="font-mono">
									{a.candidateResponse.median_hours ?? "—"}
								</dd>
							</div>
						</dl>
					</div>
					<div className="rounded-sm border border-border bg-background p-4">
						<h2 className="mb-3 font-medium text-sm">{t("employerResponse")}</h2>
						<dl className="space-y-2 text-sm">
							<div className="flex items-center justify-between">
								<dt className="text-muted-foreground text-xs">
									{t("offersTotal")}
								</dt>
								<dd className="font-mono">{a.employerResponse.offersTotal}</dd>
							</div>
							<div className="flex items-center justify-between">
								<dt className="text-muted-foreground text-xs">
									{t("decided")}
								</dt>
								<dd className="font-mono">{a.employerResponse.offersDecided}</dd>
							</div>
							<div className="flex items-center justify-between">
								<dt className="text-muted-foreground text-xs">
									{t("medianHours")}
								</dt>
								<dd className="font-mono">
									{a.employerResponse.median_hours ?? "—"}
								</dd>
							</div>
						</dl>
					</div>
				</section>

				<section className="mb-8 grid gap-4 sm:grid-cols-2">
					<div className="rounded-sm border border-border bg-background p-4">
						<h2 className="mb-3 font-medium text-sm">
							{t("topCandidateSkills")}
						</h2>
						{a.topCandidateSkills.length === 0 ? (
							<p className="text-muted-foreground text-xs">{t("none")}</p>
						) : (
							<ul className="space-y-1.5 text-sm">
								{a.topCandidateSkills.map((s) => (
									<li
										key={s.name}
										className="flex items-center justify-between gap-3"
									>
										<span>{s.name}</span>
										<span className="font-mono text-muted-foreground text-xs">
											{s.n}
										</span>
									</li>
								))}
							</ul>
						)}
					</div>
					<div className="rounded-sm border border-border bg-background p-4">
						<h2 className="mb-3 font-medium text-sm">{t("topJobSkills")}</h2>
						{a.topJobSkills.length === 0 ? (
							<p className="text-muted-foreground text-xs">{t("none")}</p>
						) : (
							<ul className="space-y-1.5 text-sm">
								{a.topJobSkills.map((s) => (
									<li
										key={s.name}
										className="flex items-center justify-between gap-3"
									>
										<span>{s.name}</span>
										<span className="font-mono text-muted-foreground text-xs">
											{s.n}
										</span>
									</li>
								))}
							</ul>
						)}
					</div>
				</section>

				<section className="mb-8 grid gap-4 sm:grid-cols-2">
					<div className="rounded-sm border border-border bg-background p-4">
						<h2 className="mb-3 font-medium text-sm">{t("topLocations")}</h2>
						{a.topLocations.length === 0 ? (
							<p className="text-muted-foreground text-xs">{t("none")}</p>
						) : (
							<ul className="space-y-1.5 text-sm">
								{a.topLocations.map((l) => (
									<li
										key={l.location}
										className="flex items-center justify-between gap-3"
									>
										<span>{l.location}</span>
										<span className="font-mono text-muted-foreground text-xs">
											{l.n}
										</span>
									</li>
								))}
							</ul>
						)}
					</div>
					<div className="rounded-sm border border-border bg-background p-4">
						<h2 className="mb-3 font-medium text-sm">{t("verifyMix")}</h2>
						{a.verifyMix.length === 0 ? (
							<p className="text-muted-foreground text-xs">{t("none")}</p>
						) : (
							<ul className="space-y-1.5 text-sm">
								{a.verifyMix.map((v) => (
									<li
										key={v.kind}
										className="flex items-center justify-between gap-3"
									>
										<span>{v.kind}</span>
										<span className="font-mono text-muted-foreground text-xs">
											{v.n}
										</span>
									</li>
								))}
							</ul>
						)}
					</div>
				</section>

				<section className="mb-8 rounded-sm border border-border bg-background p-4">
					<h2 className="mb-3 font-medium text-sm">{t("profileCompleteness")}</h2>
					<p className="mb-3 text-muted-foreground text-xs">
						{t("totalProfiles", { n: a.profileCompleteness.total })}
					</p>
					<dl className="space-y-3 text-sm">
						{(
							[
								["hasSummary", t("hasSummary"), a.profileCompleteness.hasSummary],
								["hasSkills", t("hasSkills"), a.profileCompleteness.hasSkills],
								[
									"hasEducation",
									t("hasEducation"),
									a.profileCompleteness.hasEducation,
								],
								[
									"hasExperience",
									t("hasExperience"),
									a.profileCompleteness.hasExperience,
								],
							] as const
						).map(([k, label, n]) => (
							<div key={k}>
								<div className="flex items-center justify-between text-xs">
									<dt>{label}</dt>
									<dd className="font-mono">
										{n} ({completionPct(n)} %)
									</dd>
								</div>
								<div className="mt-1">{pctBar({ pct: completionPct(n) })}</div>
							</div>
						))}
					</dl>
					<p className="mt-3 font-mono text-[10px] text-muted-foreground">
						{t("activeTenants", { n: a.activeTenants })}
					</p>
				</section>
			</main>
			<Footer />
		</>
	);
}
