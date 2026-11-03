import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { LineChart } from "@/components/charts/line-chart";
import { StackedBars } from "@/components/charts/stacked-bars";
import { Timeline } from "@/components/charts/timeline";
import { RegisterFilters } from "@/components/entity/register-filters";
import { SummaryCard } from "@/components/entity/summary-card";
import { withMessages } from "@/components/i18n/with-messages";
import { PageHeader } from "@/components/page-header";
import { SectionSwitch } from "@/components/shell/section-switch";
import { requireOrgPage } from "@/lib/auth/gates";
import { toOrgCtx } from "@/lib/auth/guards";
import { addDays } from "@/lib/charts/timeline";
import { shortFrameworkName } from "@/lib/compliance/framework-names";
import { getOrgCoverageCached } from "@/lib/compliance/page-data";
import { userNames } from "@/lib/compliance/queries";
import { loadAuditRegimeContext } from "@/lib/compliance/queries-audit-regimes";
import { listAudits } from "@/lib/compliance/queries-p3";
import {
	openItemsByPerson,
	postureReport,
	testsByDomain,
} from "@/lib/compliance/queries-report";
import {
	auditTimeline,
	PERIODS,
	periodOf,
	rankPeople,
} from "@/lib/compliance/report";
import { readOrg } from "@/lib/db/with-org";
import { berlinToday } from "@/lib/evidence-studio/queries";
import { cn } from "@/lib/utils";

type Search = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
// „bald fällig“: die nächsten 14 Tage
const SOON_DAYS = 14;

// Auswertung (Teil 3, Nov 2026): Fortschritt über die Zeit, kommende Audits,
// offene Punkte je Person, Tests nach Bereich. Zeitraum und Rahmenwerk über
// die URL; alle Zahlen per SQL gezählt (lib/compliance/queries-report.ts).
async function AnalyticsPage({
	searchParams,
}: {
	searchParams: Promise<Search>;
}) {
	const ctx = await requireOrgPage();
	const sp = await searchParams;
	const t = await getTranslations("Analytics");
	const tc = await getTranslations("Controls");
	const ta = await getTranslations("Audits");
	const cov = await getOrgCoverageCached(ctx);
	const catalog = cov?.catalog;
	const all = cov?.frameworks ?? [];
	const picked = one(sp.rahmenwerk);
	const slugs = picked && all.includes(picked) ? [picked] : all;
	const period = periodOf(one(sp.zeitraum));
	const today = berlinToday();
	const from = addDays(today, -period);
	const fwName = (s: string) => shortFrameworkName(s, catalog);
	// Tests nur der Controls, die das gewählte Rahmenwerk trägt
	const onlyControls =
		picked && catalog
			? [
					...new Set(
						catalog.edges
							.filter((e) => e.requirement.startsWith(`${picked}:`))
							.map((e) => e.control),
					),
				]
			: undefined;

	const data = await readOrg(toOrgCtx(ctx), async (tx) => {
		const [posture, people, tests, regimes, audits] = await Promise.all([
			postureReport(tx, ctx.orgId, { from, slugs, weekly: period > 30 }),
			openItemsByPerson(tx, ctx.orgId, today, addDays(today, SOON_DAYS)),
			testsByDomain(tx, ctx.orgId, from, onlyControls),
			loadAuditRegimeContext(tx, ctx.orgId),
			listAudits(tx, ctx.orgId),
		]);
		const ranked = rankPeople(people);
		const names = await userNames(
			tx,
			ranked.top.map((p) => p.userId),
		);
		return { posture, ranked, names, tests, regimes, audits };
	});

	const series = data.posture.series.map((p) => ({
		date: p.date,
		value: Number(p.value),
	}));
	const firstValue = series[0]?.value ?? null;
	const lastValue = series.at(-1)?.value ?? null;
	const change =
		firstValue !== null && lastValue !== null
			? Math.round(lastValue - firstValue)
			: null;

	const timeline = auditTimeline({
		frameworks: slugs,
		settings: data.regimes.settings,
		registered: data.regimes.registered,
		audits: data.audits,
		today,
		labels: {
			cycle: (label, fw) => ({
				label: `${fwName(fw)}: ${label}`,
				detail: t("cycle"),
			}),
			audit: (a) =>
				`${ta(`type_${a.type}` as "type_internal")} · ${ta(`status_${a.status}` as "status_planned")}`,
		},
	});

	const peopleRows = [
		...data.ranked.top.map((p) => ({
			key: p.userId,
			label: data.names.get(p.userId) ?? t("unknownPerson"),
			href: `/team/${p.userId}`,
			values: {
				overdue: p.overdue,
				soon: p.soon,
				planned: p.planned,
				undated: p.undated,
			},
		})),
		...(data.ranked.rest
			? [
					{
						key: "rest",
						label: t("restPeople", { n: data.ranked.rest.people }),
						values: data.ranked.rest,
					},
				]
			: []),
	];
	const testRows = data.tests
		.map((r) => ({
			key: r.domain,
			label: tc(`domain_${r.domain}` as "domain_access"),
			href: `/controls?domain=${r.domain}`,
			values: { pass: r.pass, partial: r.partial, fail: r.fail },
		}))
		.sort(
			(a, b) =>
				b.values.fail - a.values.fail ||
				b.values.partial - a.values.partial ||
				a.label.localeCompare(b.label, "de"),
		);

	const periodHref = (p: number) => {
		const q = new URLSearchParams();
		if (picked) q.set("rahmenwerk", picked);
		if (p !== 90) q.set("zeitraum", String(p));
		const s = q.toString();
		return s ? `/auswertung?${s}` : "/auswertung";
	};

	return (
		<>
			<SectionSwitch group="overview" current="/auswertung" ctx={ctx} />
			<PageHeader title={t("title")} lead={t("lead")} />
			<div className="mb-5 flex flex-wrap items-center gap-3">
				<nav
					aria-label={t("periodLabel")}
					className="inline-flex rounded-xl bg-muted p-0.5 text-subhead"
				>
					{PERIODS.map((p) => (
						<Link
							key={p}
							href={periodHref(p)}
							aria-current={period === p ? "true" : undefined}
							className={cn(
								"hit-area rounded-lg px-3 py-1.5",
								period === p && "bg-card font-medium shadow-sm",
							)}
						>
							{t(`period_${p}`)}
						</Link>
					))}
				</nav>
				{all.length > 1 && (
					<RegisterFilters
						search={false}
						filters={[
							{
								key: "rahmenwerk",
								label: t("framework"),
								options: all.map((s) => ({ value: s, label: fwName(s) })),
							},
						]}
					/>
				)}
			</div>

			<div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
				<SummaryCard title={t("progressTitle")}>
					{series.length < 2 ? (
						<p className="text-footnote text-muted-foreground">
							{t("progressEmpty")}
						</p>
					) : (
						<>
							<p className="mb-2 flex flex-wrap items-baseline gap-x-2">
								<span className="font-semibold text-large-title tabular-nums">
									{Math.round(lastValue ?? 0)}&nbsp;%
								</span>
								<span className="text-footnote text-muted-foreground">
									{picked ? fwName(picked) : t("progressAverage")}
									{change !== null &&
										` · ${t("progressChange", { n: change, sign: change > 0 ? "+" : "" })}`}
								</span>
							</p>
							<LineChart
								points={series}
								start={from}
								end={today}
								label={t("progressTitle")}
							/>
						</>
					)}
					{data.posture.byFramework.length > 0 && (
						<details className="mt-2">
							<summary className="hit-area w-fit cursor-pointer text-footnote text-primary">
								{t("byFramework")}
							</summary>
							<table className="mt-2 w-full text-footnote">
								<thead>
									<tr className="text-left text-muted-foreground">
										<th className="py-1 font-normal">{t("framework")}</th>
										<th className="py-1 text-right font-normal">
											{t("colFrom")}
										</th>
										<th className="py-1 text-right font-normal">
											{t("colNow")}
										</th>
										<th className="py-1 text-right font-normal">
											{t("colChange")}
										</th>
									</tr>
								</thead>
								<tbody>
									{data.posture.byFramework
										.map((r) => ({
											...r,
											delta: Math.round(Number(r.last) - Number(r.first)),
										}))
										.sort((a, b) => b.delta - a.delta)
										.map((r) => (
											<tr key={r.slug} className="border-t">
												<td className="py-1">
													<Link
														href={`/rahmenwerke/${r.slug}`}
														className="hover:underline"
													>
														{fwName(r.slug)}
													</Link>
												</td>
												<td className="py-1 text-right tabular-nums">
													{Math.round(Number(r.first))}&nbsp;%
												</td>
												<td className="py-1 text-right tabular-nums">
													{Math.round(Number(r.last))}&nbsp;%
												</td>
												<td className="py-1 text-right font-medium tabular-nums">
													{r.delta > 0 ? "+" : ""}
													{r.delta}
												</td>
											</tr>
										))}
								</tbody>
							</table>
						</details>
					)}
				</SummaryCard>

				<SummaryCard title={t("auditsTitle")}>
					<Timeline
						start={timeline.start}
						end={timeline.end}
						today={today}
						items={timeline.items}
						label={t("auditsTitle")}
						todayLabel={t("today")}
						empty={t("auditsEmpty")}
					/>
					{timeline.missing && (
						<Link
							href="/einstellungen?tab=audits"
							className="hit-area mt-3 inline-block text-footnote text-primary underline-offset-4 hover:underline"
						>
							{t("auditsSetDates")}
						</Link>
					)}
				</SummaryCard>

				<SummaryCard title={t("peopleTitle")}>
					<StackedBars
						label={t("peopleTitle")}
						tableLabel={t("asTable")}
						totalLabel={t("total")}
						empty={t("peopleEmpty")}
						categories={[
							{ key: "overdue", label: t("overdue"), tone: "destructive" },
							{ key: "soon", label: t("soon"), tone: "warning" },
							{ key: "planned", label: t("planned"), tone: "primary" },
							{ key: "undated", label: t("undated"), tone: "muted" },
						]}
						rows={peopleRows}
					/>
				</SummaryCard>

				<SummaryCard title={t("testsTitle")}>
					<StackedBars
						label={t("testsTitle")}
						tableLabel={t("asTable")}
						totalLabel={t("total")}
						empty={t("testsEmpty")}
						categories={[
							{ key: "pass", label: t("pass"), tone: "success" },
							{ key: "partial", label: t("partial"), tone: "warning" },
							{ key: "fail", label: t("fail"), tone: "destructive" },
						]}
						rows={testRows}
					/>
				</SummaryCard>
			</div>
		</>
	);
}

export default withMessages(AnalyticsPage, ["Entity"]);
