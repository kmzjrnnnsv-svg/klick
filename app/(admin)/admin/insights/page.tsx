import { eq } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { aggregatedDiversityStats } from "@/app/actions/diversity";
import { aggregatedOutcomesPlatform } from "@/app/actions/outcomes";
import { auth } from "@/auth";
import { Footer } from "@/components/footer";
import { Header } from "@/components/header";
import { db } from "@/db";
import { users } from "@/db/schema";

function pct(n: number, total: number): string {
	if (total === 0) return "—";
	return `${Math.round((n / total) * 100)}%`;
}

export default async function AdminInsightsPage() {
	const session = await auth();
	if (!session?.user?.id) redirect("/login");
	const [u] = await db
		.select({ role: users.role })
		.from(users)
		.where(eq(users.id, session.user.id))
		.limit(1);
	if (u?.role !== "admin") redirect("/post-login");

	const t = await getTranslations("AdminInsights");
	const fmt = await getFormatter();
	const [diversity, outcomes] = await Promise.all([
		aggregatedDiversityStats(),
		aggregatedOutcomesPlatform(),
	]);

	return (
		<>
			<Header />
			<main className="mx-auto w-full max-w-3xl flex-1 px-3 pt-6 pb-20 sm:px-6 sm:pt-12">
				<header className="mb-8">
					<Link
						href="/admin"
						className="lv-eyebrow text-[0.55rem] text-muted-foreground hover:text-foreground"
					>
						← {t("back")}
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

				<section className="mb-12">
					<p className="lv-eyebrow text-[0.55rem] text-primary">
						{t("outcomesEyebrow")}
					</p>
					<h2 className="mt-2 font-serif-display text-xl sm:text-2xl">
						{t("outcomesTitle")}
					</h2>
					<dl className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
						{[
							["totalReports", outcomes.totalReports],
							["hired", outcomes.hired],
							["declinedByCandidate", outcomes.declinedByCandidate],
							["declinedByEmployer", outcomes.declinedByEmployer],
						].map(([key, value]) => (
							<div
								key={String(key)}
								className="rounded-sm border border-border bg-background p-4"
							>
								<dt className="lv-eyebrow text-[0.5rem] text-muted-foreground">
									{t(`outcomeMetric.${key as string}`)}
								</dt>
								<dd className="mt-1 font-serif-display text-2xl">
									{String(value)}
								</dd>
							</div>
						))}
					</dl>
					<dl className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
						<div className="rounded-sm border border-emerald-500/30 bg-emerald-500/5 p-4">
							<dt className="lv-eyebrow text-[0.5rem] text-emerald-700 dark:text-emerald-300">
								{t("hireRate")}
							</dt>
							<dd className="mt-1 font-serif-display text-3xl text-emerald-700 dark:text-emerald-300">
								{outcomes.hireRate !== null ? `${outcomes.hireRate}%` : "—"}
							</dd>
						</div>
						<div className="rounded-sm border border-border bg-background p-4">
							<dt className="lv-eyebrow text-[0.5rem] text-muted-foreground">
								{t("avgFinalSalary")}
							</dt>
							<dd className="mt-1 font-serif-display text-3xl">
								{outcomes.avgFinalSalary !== null
									? fmt.number(outcomes.avgFinalSalary, {
											style: "currency",
											currency: "EUR",
											maximumFractionDigits: 0,
										})
									: "—"}
							</dd>
						</div>
					</dl>
				</section>

				<section>
					<p className="lv-eyebrow text-[0.55rem] text-primary">
						{t("diversityEyebrow")}
					</p>
					<h2 className="mt-2 font-serif-display text-xl sm:text-2xl">
						{t("diversityTitle")}
					</h2>
					<p className="mt-2 mb-4 text-muted-foreground text-xs leading-relaxed">
						{t("diversityDisclaimer", {
							consented: diversity.totalConsented,
							total: diversity.totalCandidates,
						})}
					</p>

					<div className="grid gap-6 sm:grid-cols-2">
						<DivBlock
							title={t("diversityGender")}
							data={diversity.gender}
							total={diversity.totalConsented}
							labelFn={(k) => t(`gender.${k}`, { fallback: k })}
						/>
						<DivBlock
							title={t("diversityAge")}
							data={diversity.ageRange}
							total={diversity.totalConsented}
							labelFn={(k) => k.replace("_", "–").replace("plus", "+")}
						/>
						<DivBlock
							title={t("diversityEthnicity")}
							data={diversity.ethnicity}
							total={diversity.totalConsented}
						/>
						<DivBlock
							title={t("diversityDisability")}
							data={{
								yes: diversity.disability.yes,
								no: diversity.disability.no,
							}}
							total={diversity.totalConsented}
							labelFn={(k) => t(`disability.${k}`)}
						/>
					</div>
					<p className="mt-6 text-muted-foreground text-[10px] leading-relaxed">
						{t("suppressionNote")}
					</p>
				</section>
			</main>
			<Footer />
		</>
	);
}

function DivBlock({
	title,
	data,
	total,
	labelFn,
}: {
	title: string;
	data: Record<string, number>;
	total: number;
	labelFn?: (k: string) => string;
}) {
	const entries = Object.entries(data).filter(([, v]) => v > 0);
	return (
		<div>
			<p className="lv-eyebrow text-[0.55rem] text-muted-foreground">{title}</p>
			{entries.length === 0 ? (
				<p className="mt-2 text-muted-foreground text-xs italic">
					(zu wenig Daten)
				</p>
			) : (
				<ul className="mt-2 space-y-1.5">
					{entries.map(([k, v]) => (
						<li key={k}>
							<div className="flex items-baseline justify-between text-xs">
								<span>{labelFn ? labelFn(k) : k}</span>
								<span className="font-mono">
									{v} · {pct(v, total)}
								</span>
							</div>
							<div className="mt-1 h-1 rounded-full bg-muted">
								<div
									className="h-full rounded-full bg-primary"
									style={{ width: total > 0 ? `${(v / total) * 100}%` : "0%" }}
								/>
							</div>
						</li>
					))}
				</ul>
			)}
		</div>
	);
}
