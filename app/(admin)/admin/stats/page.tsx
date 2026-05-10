import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getAdminAnalytics } from "@/app/actions/admin";
import { auth } from "@/auth";
import {
	FunnelChart,
	HBarChart,
	StackedBar,
	VBarHistogram,
} from "@/components/admin/charts";
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

const DEGREE_LABEL: Record<string, string> = {
	school: "Schule / Abi",
	apprenticeship: "Ausbildung",
	bachelor: "Bachelor",
	master: "Master",
	phd: "PhD",
	mba: "MBA",
	other: "Sonstige",
};

const POLICY_LABEL: Record<string, string> = {
	onsite: "Vor Ort",
	hybrid: "Hybrid",
	remote: "Remote",
};

const EMPLOYMENT_LABEL: Record<string, string> = {
	fulltime: "Vollzeit",
	parttime: "Teilzeit",
	contract: "Freelance/Contract",
	internship: "Praktikum",
};

const STATUS_LABEL: Record<string, string> = {
	draft: "Entwurf",
	published: "Veröffentlicht",
	archived: "Archiviert",
};

const KIND_LABEL: Record<string, string> = {
	identity: "Identität",
	cert: "Zertifikat",
	badge: "Badge",
	employment: "Beschäftigung",
};

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
			<main className="mx-auto w-full max-w-6xl flex-1 px-3 pt-6 pb-20 sm:px-6 sm:pt-12">
				<header className="mb-6 sm:mb-8">
					<h1 className="font-semibold text-xl tracking-tight sm:text-3xl">
						{t("title")}
					</h1>
					<p className="mt-1.5 text-muted-foreground text-sm leading-snug">
						{t("subtitle")}
					</p>
				</header>

				{/* Top-Tiles */}
				<section className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
					<StatTile
						label={t("usersLabel")}
						value={a.growth.users7d}
						hint={t("over30d", { n: a.growth.users30d })}
						tone="primary"
					/>
					<StatTile
						label={t("jobsLabel")}
						value={a.growth.jobs7d}
						hint={t("over30d", { n: a.growth.jobs30d })}
						tone="primary"
					/>
					<StatTile
						label={t("matchesLabel")}
						value={a.growth.matches7d}
						hint={t("over30d", { n: a.growth.matches30d })}
						tone="primary"
					/>
					<StatTile
						label={t("activeSessionsLabel")}
						value={a.activeSessions.uniqueUsers}
						hint={t("activeSessionsHint", {
							total: a.activeSessions.total,
						})}
						tone="emerald"
					/>
				</section>

				{/* Sekundäre Tiles */}
				<section className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
					<StatTile
						label={t("activeTenantsLabel")}
						value={a.activeTenants}
						hint={t("activeTenantsHint")}
					/>
					<StatTile
						label={t("vaultItemsLabel")}
						value={a.vault.totalItems}
						hint={t("vaultOwnersHint", { owners: a.vault.uniqueOwners })}
					/>
					<StatTile
						label={t("savedSearchesLabel")}
						value={a.savedSearches.total}
						hint={t("savedSearchesHint", {
							owners: a.savedSearches.uniqueOwners,
						})}
					/>
					<StatTile
						label={t("careerAdoptionLabel")}
						value={a.careerAdoption.hasAnalysis}
						hint={t("careerAdoptionHint", {
							total: a.careerAdoption.totalCandidates,
						})}
					/>
				</section>

				{/* Funnel */}
				<section className="mb-8">
					<Card title={t("funnel")} hint={t("funnelHint")}>
						<FunnelChart
							steps={[
								{ label: t("matchesLabel"), n: a.funnel.matches },
								{
									label: t("interestsLabel"),
									n: a.funnel.interests,
									pct: a.conversion.matchToInterest,
								},
								{
									label: t("approvedLabel"),
									n: a.funnel.interestsApproved,
									pct: a.conversion.interestToApproval,
								},
								{
									label: t("offersLabel"),
									n: a.funnel.offers,
									pct: a.conversion.approvalToOffer,
								},
								{
									label: t("offersAccepted"),
									n: a.funnel.offersAccepted,
									pct: a.conversion.offerToAccept,
								},
							]}
						/>
					</Card>
				</section>

				{/* Antwortzeiten */}
				<section className="mb-8 grid gap-3 sm:grid-cols-2">
					<Card title={t("candidateResponse")}>
						<dl className="grid grid-cols-3 gap-3 text-sm">
							<div>
								<dt className="text-muted-foreground text-xs">{t("decided")}</dt>
								<dd className="mt-0.5 font-serif-display text-xl tabular-nums">
									{a.candidateResponse.decided}
								</dd>
							</div>
							<div>
								<dt className="text-muted-foreground text-xs">{t("pending")}</dt>
								<dd className="mt-0.5 font-serif-display text-xl tabular-nums">
									{a.candidateResponse.pending}
								</dd>
							</div>
							<div>
								<dt className="text-muted-foreground text-xs">
									{t("medianHours")}
								</dt>
								<dd className="mt-0.5 font-serif-display text-xl tabular-nums">
									{a.candidateResponse.median_hours ?? "—"}
								</dd>
							</div>
						</dl>
					</Card>
					<Card title={t("employerResponse")}>
						<dl className="grid grid-cols-3 gap-3 text-sm">
							<div>
								<dt className="text-muted-foreground text-xs">
									{t("offersTotal")}
								</dt>
								<dd className="mt-0.5 font-serif-display text-xl tabular-nums">
									{a.employerResponse.offersTotal}
								</dd>
							</div>
							<div>
								<dt className="text-muted-foreground text-xs">{t("decided")}</dt>
								<dd className="mt-0.5 font-serif-display text-xl tabular-nums">
									{a.employerResponse.offersDecided}
								</dd>
							</div>
							<div>
								<dt className="text-muted-foreground text-xs">
									{t("medianHours")}
								</dt>
								<dd className="mt-0.5 font-serif-display text-xl tabular-nums">
									{a.employerResponse.median_hours ?? "—"}
								</dd>
							</div>
						</dl>
					</Card>
				</section>

				{/* Job-Daten Mix */}
				<section className="mb-8 grid gap-3 sm:grid-cols-3">
					<Card title={t("remotePolicy")}>
						<StackedBar
							items={a.remotePolicyMix.map((m) => ({
								label: POLICY_LABEL[m.policy] ?? m.policy,
								n: m.n,
							}))}
						/>
					</Card>
					<Card title={t("employmentType")}>
						<StackedBar
							items={a.employmentTypeMix.map((m) => ({
								label: EMPLOYMENT_LABEL[m.type] ?? m.type,
								n: m.n,
							}))}
						/>
					</Card>
					<Card title={t("jobStatus")}>
						<StackedBar
							items={a.jobStatusMix.map((m) => ({
								label: STATUS_LABEL[m.status] ?? m.status,
								n: m.n,
							}))}
						/>
					</Card>
				</section>

				{/* Distributions */}
				<section className="mb-8 grid gap-3 sm:grid-cols-2">
					<Card title={t("salaryDesired")} hint={t("salaryHint")}>
						<VBarHistogram
							items={a.salaryDesiredHist.map((b) => ({
								label: b.bucket,
								n: b.n,
							}))}
						/>
					</Card>
					<Card title={t("jobSalary")} hint={t("jobSalaryHint")}>
						<VBarHistogram
							items={a.jobSalaryHist.map((b) => ({
								label: b.bucket,
								n: b.n,
							}))}
						/>
					</Card>
					<Card title={t("yearsExperience")}>
						<VBarHistogram
							items={a.yearsExperienceHist.map((b) => ({
								label: b.bucket,
								n: b.n,
							}))}
						/>
					</Card>
					<Card title={t("yearsRequired")}>
						<VBarHistogram
							items={a.yearsRequiredHist.map((b) => ({
								label: b.bucket,
								n: b.n,
							}))}
						/>
					</Card>
				</section>

				<section className="mb-8">
					<Card title={t("matchScore")} hint={t("matchScoreHint")}>
						<VBarHistogram
							items={a.matchScoreHist.map((b) => ({
								label: b.bucket,
								n: b.n,
							}))}
						/>
					</Card>
				</section>

				{/* Top-Listen */}
				<section className="mb-8 grid gap-3 sm:grid-cols-2">
					<Card title={t("topCandidateSkills")}>
						<HBarChart
							items={a.topCandidateSkills.map((s) => ({ label: s.name, n: s.n }))}
						/>
					</Card>
					<Card title={t("topJobSkills")}>
						<HBarChart
							tone="emerald"
							items={a.topJobSkills.map((s) => ({ label: s.name, n: s.n }))}
						/>
					</Card>
					<Card title={t("topLocations")}>
						<HBarChart
							items={a.topLocations.map((l) => ({ label: l.location, n: l.n }))}
						/>
					</Card>
					<Card title={t("topJobLocations")}>
						<HBarChart
							tone="emerald"
							items={a.topJobLocations.map((l) => ({
								label: l.location,
								n: l.n,
							}))}
						/>
					</Card>
					<Card title={t("topIndustries")}>
						<HBarChart
							tone="amber"
							items={a.topIndustries.map((i) => ({ label: i.name, n: i.n }))}
						/>
					</Card>
					<Card title={t("topLanguages")}>
						<HBarChart
							tone="amber"
							items={a.topLanguages.map((l) => ({ label: l.name, n: l.n }))}
						/>
					</Card>
				</section>

				<section className="mb-8 grid gap-3 sm:grid-cols-2">
					<Card title={t("topCertifications")}>
						<HBarChart
							items={a.topCertifications.map((c) => ({ label: c.name, n: c.n }))}
						/>
					</Card>
					<Card title={t("degreeMix")}>
						<StackedBar
							items={a.degreeTypeMix.map((d) => ({
								label: DEGREE_LABEL[d.type] ?? d.type,
								n: d.n,
							}))}
						/>
					</Card>
				</section>

				{/* Verify */}
				<section className="mb-8 grid gap-3 sm:grid-cols-2">
					<Card title={t("verifyMix")}>
						<HBarChart
							items={a.verifyMix.map((v) => ({
								label: KIND_LABEL[v.kind] ?? v.kind,
								n: v.n,
							}))}
						/>
					</Card>
					<Card title={t("verifyResults")} hint={t("verifyResultsHint")}>
						{a.verifyResults.length === 0 ? (
							<p className="text-muted-foreground text-xs italic">
								{t("none")}
							</p>
						) : (
							<ul className="space-y-2">
								{a.verifyResults.map((v) => {
									const tot = v.passed + v.failed + v.pending || 1;
									return (
										<li key={v.kind}>
											<div className="mb-1 flex items-baseline justify-between text-xs">
												<span className="font-medium">
													{KIND_LABEL[v.kind] ?? v.kind}
												</span>
												<span className="font-mono text-muted-foreground">
													{Math.round((v.passed / tot) * 100)} % passed
												</span>
											</div>
											<StackedBar
												items={[
													{
														label: "passed",
														n: v.passed,
														tone: "bg-emerald-500",
													},
													{ label: "failed", n: v.failed, tone: "bg-rose-500" },
													{
														label: "pending",
														n: v.pending,
														tone: "bg-amber-500",
													},
												]}
											/>
										</li>
									);
								})}
							</ul>
						)}
					</Card>
				</section>

				{/* Profile completeness */}
				<section className="mb-8">
					<Card
						title={t("profileCompleteness")}
						hint={t("totalProfiles", { n: a.profileCompleteness.total })}
					>
						<div className="space-y-3 text-sm">
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
									<div className="mb-1 flex items-center justify-between text-xs">
										<span>{label}</span>
										<span className="font-mono text-muted-foreground">
											{n} ({completionPct(n)} %)
										</span>
									</div>
									<div className="h-2 w-full overflow-hidden rounded-full bg-muted">
										<div
											className="h-full rounded-full bg-primary"
											style={{ width: `${completionPct(n)}%` }}
										/>
									</div>
								</div>
							))}
						</div>
					</Card>
				</section>

				{/* Application-Drop-Off + Stage-Outcomes + Reject-Reasons */}
				<section className="mb-8 grid gap-3 sm:grid-cols-2">
					<Card title={t("applicationStatus")} hint={t("applicationStatusHint")}>
						<HBarChart
							items={a.applicationStatusMix.map((s) => ({
								label: s.status,
								n: s.n,
							}))}
						/>
					</Card>
					<Card title={t("stageOutcomes")} hint={t("stageOutcomesHint")}>
						<StackedBar
							items={a.stageOutcomes.map((o) => ({
								label: o.outcome,
								n: o.n,
								tone:
									o.outcome === "advance"
										? "bg-emerald-500"
										: o.outcome === "reject"
											? "bg-rose-500"
											: "bg-amber-500",
							}))}
						/>
						{a.rejectReasons.length > 0 && (
							<div className="mt-4 border-border border-t pt-3">
								<p className="mb-2 text-muted-foreground text-xs">
									{t("topRejectReasons")}
								</p>
								<HBarChart
									tone="rose"
									items={a.rejectReasons.map((r) => ({
										label: r.reason,
										n: r.n,
									}))}
								/>
							</div>
						)}
					</Card>
				</section>

				{/* Time-to-Fill */}
				<section className="mb-8">
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
								<dt className="text-muted-foreground text-xs">
									{t("ttfP25")}
								</dt>
								<dd className="mt-0.5 font-serif-display text-xl tabular-nums">
									{a.timeToFill.p25Days ?? "—"}
								</dd>
							</div>
							<div>
								<dt className="text-muted-foreground text-xs">
									{t("ttfMedian")}
								</dt>
								<dd className="mt-0.5 font-serif-display text-xl tabular-nums">
									{a.timeToFill.medianDays ?? "—"}
								</dd>
							</div>
							<div>
								<dt className="text-muted-foreground text-xs">
									{t("ttfP75")}
								</dt>
								<dd className="mt-0.5 font-serif-display text-xl tabular-nums">
									{a.timeToFill.p75Days ?? "—"}
								</dd>
							</div>
						</dl>
					</Card>
				</section>

				{/* Vault + Saved-Searches */}
				<section className="mb-8 grid gap-3 sm:grid-cols-2">
					<Card title={t("vaultMix")} hint={t("vaultMixHint")}>
						<StackedBar
							items={a.vault.kindMix.map((k) => ({ label: k.kind, n: k.n }))}
						/>
						<p className="mt-3 text-muted-foreground text-xs">
							{t("vaultUrlOnly", { n: a.vault.urlOnly })}
						</p>
					</Card>
					<Card title={t("savedSearchesAnalysis")} hint={t("savedSearchesHint2")}>
						{a.savedSearches.topSkills.length === 0 ? (
							<p className="text-muted-foreground text-xs italic">
								{t("none")}
							</p>
						) : (
							<>
								<p className="mb-2 text-muted-foreground text-xs">
									{t("ssTopSkills")}
								</p>
								<HBarChart
									tone="amber"
									items={a.savedSearches.topSkills.map((s) => ({
										label: s.name,
										n: s.n,
									}))}
								/>
								{a.savedSearches.remoteMix.length > 0 && (
									<div className="mt-4 border-border border-t pt-3">
										<p className="mb-2 text-muted-foreground text-xs">
											{t("ssRemoteMix")}
										</p>
										<StackedBar
											items={a.savedSearches.remoteMix.map((r) => ({
												label: r.policy,
												n: r.n,
											}))}
										/>
									</div>
								)}
							</>
						)}
					</Card>
				</section>

				{/* Notification-Engagement + Translations */}
				<section className="mb-8 grid gap-3 sm:grid-cols-2">
					<Card
						title={t("notifEngagement")}
						hint={t("notifEngagementHint", {
							pct:
								a.notificationEngagement.total > 0
									? Math.round(
											(a.notificationEngagement.read /
												a.notificationEngagement.total) *
												100,
										)
									: 0,
						})}
					>
						{a.notificationEngagement.byKind.length === 0 ? (
							<p className="text-muted-foreground text-xs italic">
								{t("none")}
							</p>
						) : (
							<ul className="space-y-2">
								{a.notificationEngagement.byKind.map((k) => {
									const pct =
										k.total > 0 ? Math.round((k.read / k.total) * 100) : 0;
									return (
										<li key={k.kind}>
											<div className="mb-1 flex items-baseline justify-between text-xs">
												<span className="font-medium">{k.kind}</span>
												<span className="font-mono text-muted-foreground">
													{k.read}/{k.total} ({pct} %)
												</span>
											</div>
											<div className="h-2 w-full overflow-hidden rounded-full bg-muted">
												<div
													className="h-full rounded-full bg-emerald-500"
													style={{ width: `${pct}%` }}
												/>
											</div>
										</li>
									);
								})}
							</ul>
						)}
					</Card>
					<Card
						title={t("translationsCoverage")}
						hint={t("translationsCoverageHint")}
					>
						<dl className="grid grid-cols-2 gap-3 text-sm">
							<div>
								<dt className="text-muted-foreground text-xs">
									{t("totalProfiles", { n: a.translationsCoverage.total })}
								</dt>
								<dd className="mt-0.5 font-serif-display text-xl tabular-nums">
									{a.translationsCoverage.hasTranslations}
								</dd>
								<p className="mt-1 font-mono text-[10px] text-muted-foreground">
									{a.translationsCoverage.total > 0
										? Math.round(
												(a.translationsCoverage.hasTranslations /
													a.translationsCoverage.total) *
													100,
											)
										: 0}{" "}
									%
								</p>
							</div>
							<div>
								<dt className="text-muted-foreground text-xs">
									{t("careerAdoptionLabel")}
								</dt>
								<dd className="mt-0.5 font-serif-display text-xl tabular-nums">
									{a.careerAdoption.hasAnalysis}
								</dd>
								<p className="mt-1 font-mono text-[10px] text-muted-foreground">
									{a.careerAdoption.totalCandidates > 0
										? Math.round(
												(a.careerAdoption.hasAnalysis /
													a.careerAdoption.totalCandidates) *
													100,
											)
										: 0}{" "}
									%
								</p>
							</div>
						</dl>
					</Card>
				</section>

				{/* Diversity (k-anonym) */}
				<section className="mb-8">
					<Card
						title={t("diversity")}
						hint={t("diversityHint", { n: a.diversity.total })}
					>
						{a.diversity.total < 5 ? (
							<p className="text-muted-foreground text-xs italic">
								{t("diversityTooSmall")}
							</p>
						) : (
							<div className="grid gap-4 sm:grid-cols-3">
								<div>
									<p className="mb-2 text-muted-foreground text-xs">
										{t("gender")}
									</p>
									<HBarChart
										tone="amber"
										items={a.diversity.gender.map((g) => ({
											label: g.bucket,
											n: g.n,
										}))}
									/>
								</div>
								<div>
									<p className="mb-2 text-muted-foreground text-xs">
										{t("age")}
									</p>
									<HBarChart
										tone="amber"
										items={a.diversity.ageRange.map((g) => ({
											label: g.bucket,
											n: g.n,
										}))}
									/>
								</div>
								<div>
									<p className="mb-2 text-muted-foreground text-xs">
										{t("disability")}
									</p>
									<HBarChart
										tone="amber"
										items={a.diversity.hasDisability.map((g) => ({
											label: g.bucket,
											n: g.n,
										}))}
									/>
								</div>
							</div>
						)}
					</Card>
				</section>
			</main>
			<Footer />
		</>
	);
}
