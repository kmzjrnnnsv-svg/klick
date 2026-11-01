import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { CoverageBar } from "@/components/entity/coverage-bar";
import { Sparkline } from "@/components/entity/sparkline";
import { PageHeader } from "@/components/page-header";
import { NextStepsList } from "@/components/today/next-steps";
import { Badge } from "@/components/ui/badge";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { requireOrgPage } from "@/lib/auth/gates";
import { toOrgCtx } from "@/lib/auth/guards";
import { listOrgMembers } from "@/lib/auth/org";
import { allows } from "@/lib/auth/permissions";
import { CONTROL_BY_CODE } from "@/lib/compliance/catalog";
import { CATALOG_CONTROL_REFS } from "@/lib/compliance/catalog-view";
import { nextSteps } from "@/lib/compliance/next-steps";
import {
	getOrgCoverageCached,
	pct,
	shortFrameworkName,
} from "@/lib/compliance/page-data";
import { postureTrend } from "@/lib/compliance/posture";
import { listControlRows } from "@/lib/compliance/queries";
import { listAssessments } from "@/lib/compliance/queries-assessments";
import {
	countOpenTasks,
	implementedWithoutEvidenceCount,
} from "@/lib/compliance/queries-counts";
import {
	loadOrgStatus,
	personalStepFacts,
} from "@/lib/compliance/queries-next-steps";
import { listPostureSnapshots } from "@/lib/compliance/queries-p4";
import { prioritizePlan } from "@/lib/compliance/synergy";
import { readOrg } from "@/lib/db/with-org";
import { getOrgSettings } from "@/lib/org/queries";
import { setupState } from "@/lib/setup/steps";

const STAGE_LABEL: Record<string, string> = {
	"0_vorbereitung": "0 · Vorbereitung",
	"1_agent": "1 · Agent / Dienstleister",
	"2_casp_zag": "2 · CASP + ZAG",
	"3_emi": "3 · E-Geld-Institut",
	"4_bank": "4 · Bank",
};

export default async function OverviewPage() {
	const ctx = await requireOrgPage();
	const t = await getTranslations("Overview");
	const tc = await getTranslations("Controls");
	const tr = await getTranslations("Readiness");
	const [members, cov] = await Promise.all([
		listOrgMembers(ctx.orgId),
		getOrgCoverageCached(ctx),
	]);
	const settings = cov?.profile;
	const fws = cov?.frameworks ?? [];
	const now = new Date();
	// Leistung bei wachsenden Daten: nur Zahlen und die Liste „Als Nächstes“
	// (zwischengespeichert je Org), keine ganzen Register
	const g = await readOrg(toOrgCtx(ctx), async (tx) => {
		const [controls, withoutEvidence, openTasks, flags, snapshots, gaps] =
			await Promise.all([
				listControlRows(tx, ctx.orgId),
				implementedWithoutEvidenceCount(tx, ctx.orgId),
				countOpenTasks(tx, ctx.orgId),
				getOrgSettings(tx, ctx.orgId).then((x) => x?.setupFlags ?? {}),
				listPostureSnapshots(tx, ctx.orgId, 35),
				listAssessments(tx, ctx.orgId, "self"),
			]);
		return {
			controls,
			withoutEvidence,
			openTasks,
			flags,
			snapshots,
			gaps,
			status: await loadOrgStatus(tx, ctx.orgId, now),
		};
	});
	const { controls, openTasks } = g;
	const withoutOwner = controls.filter((c) => !c.ownerUserId);
	const steps = nextSteps({
		...g.status.next,
		...(await personalStepFacts({
			setup: setupState(g.flags),
			canSetup: allows(ctx, { settings: ["update"] }),
			canCreateGap: allows(ctx, { assessment: ["create"] }),
			gapAnalyses: g.gaps,
			coverage: async () => cov,
		})),
	});
	const labels = {
		covered: t("covered"),
		partial: t("partial"),
		open: t("open"),
		applicable: t("applicable"),
	};

	let plan: ReturnType<typeof prioritizePlan> | null = null;
	if (cov && fws.length > 0) {
		const applicability = new Map<string, boolean>();
		if (cov.input.applicability instanceof Map)
			for (const [k, v] of cov.input.applicability) applicability.set(k, v);
		plan = prioritizePlan(
			fws,
			{
				requirements: cov.catalog.reqRefs,
				edges: cov.catalog.edgeRefs,
				controls: CATALOG_CONTROL_REFS,
				applicability,
			},
			cov.implStatus,
			5,
		);
	}

	// Prüfungsreife heute je Rahmenwerk, aus derselben Rechnung wie „Als Nächstes“
	const readinessBy = new Map(g.status.readiness.map((r) => [r.framework, r]));

	return (
		<>
			<PageHeader title={t("title")} />
			<div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
				<Card className="lg:col-span-2">
					<CardHeader>
						<CardTitle>{t("coverageTitle")}</CardTitle>
						<CardDescription>{t("coverageLead")}</CardDescription>
					</CardHeader>
					<CardContent className="flex flex-col gap-4">
						{fws.filter(
							(f) =>
								(cov?.catalog.frameworkBySlug.get(f)?.requirements.length ??
									0) > 0,
						).length === 0 ? (
							<p className="text-muted-foreground text-subhead">
								{t("coverageNone")}
							</p>
						) : (
							fws.map((fw) => {
								const b = cov?.result.byFramework.get(fw);
								if (!b || b.total === 0) return null;
								return (
									<div key={fw} className="flex flex-col gap-1">
										<div className="flex items-baseline justify-between gap-2 text-subhead">
											<Link
												href={`/rahmenwerke/${fw}`}
												className="font-medium hover:underline underline-offset-4"
											>
												{shortFrameworkName(fw, cov?.catalog)}
											</Link>
											<span className="flex items-baseline gap-3">
												{(() => {
													const r = readinessBy.get(fw);
													if (!r || r.score === null) return null;
													return (
														<Link
															href={`/rahmenwerke/${fw}?tab=pruefungsreife`}
															className="text-muted-foreground text-footnote hover:underline underline-offset-4"
															title={tr("overviewLead")}
														>
															{tr("auditBadge", { score: r.score })} ·{" "}
															{tr(`verdict_${r.verdict}`)}
														</Link>
													);
												})()}
												<span className="font-semibold text-headline">
													{pct(b.coveragePct)}
												</span>
											</span>
										</div>
										<CoverageBar bucket={b} labels={labels} />
										{(() => {
											const tr = postureTrend(
												g.snapshots.filter((x) => x.slug === fw),
												now,
											);
											if (tr.points.length < 2) return null;
											return (
												<div className="flex items-center justify-between text-muted-foreground text-footnote">
													<span>
														{t("trend30", {
															delta: `${(tr.deltaPct ?? 0) >= 0 ? "+" : ""}${tr.deltaPct ?? 0}`,
														})}
													</span>
													<Sparkline
														points={tr.points}
														title={t("trendTitle")}
													/>
												</div>
											);
										})()}
									</div>
								);
							})
						)}
					</CardContent>
				</Card>
				<NextStepsList steps={steps} />
			</div>

			<div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
				<Card className="lg:col-span-2">
					<CardHeader>
						<CardTitle className="flex items-center justify-between text-headline">
							{t("nextControls")}
							<Link
								href="/synergien"
								className="text-primary text-footnote font-normal normal-case hover:underline"
							>
								{t("toSynergies")}
							</Link>
						</CardTitle>
						<CardDescription>{t("nextControlsLead")}</CardDescription>
					</CardHeader>
					<CardContent>
						{!plan || plan.steps.length === 0 ? (
							<p className="text-muted-foreground text-subhead">
								{t("nextControlsEmpty")}
							</p>
						) : (
							<ol className="flex flex-col divide-y divide-border/60 text-subhead">
								{plan.steps.map((s, i) => (
									<li key={s.control} className="flex items-center gap-3 py-2">
										<span className="w-5 shrink-0 text-muted-foreground">
											{i + 1}
										</span>
										<Link
											href={`/controls/${s.control}`}
											className="min-w-0 flex-1 truncate hover:underline underline-offset-4"
										>
											<span className="font-mono text-footnote">
												{s.control}
											</span>{" "}
											· {CONTROL_BY_CODE.get(s.control)?.title}
										</Link>
										<span className="hidden min-w-0 max-w-[45%] flex-wrap justify-end gap-1 sm:flex">
											{s.frameworks.map((fw) => (
												<Badge key={fw} variant="outline" className="">
													{shortFrameworkName(fw, cov?.catalog)}
												</Badge>
											))}
										</span>
										<span className="w-16 shrink-0 text-right text-muted-foreground text-footnote">
											{tc(`effort_${s.effort}`)}
										</span>
										<span className="w-14 shrink-0 text-right font-medium">
											{pct(s.cumulativeCoveragePct)}
										</span>
									</li>
								))}
							</ol>
						)}
					</CardContent>
				</Card>
				<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-1">
					<Card>
						<CardHeader>
							<CardTitle className="text-headline">
								{t("withoutEvidence")}
							</CardTitle>
						</CardHeader>
						<CardContent className="flex items-baseline justify-between">
							<span className="font-bold text-title-1">
								{g.withoutEvidence}
							</span>
							<Link
								href="/controls?status=implemented"
								className="text-primary text-footnote hover:underline"
							>
								{t("toControls")}
							</Link>
						</CardContent>
					</Card>
					<Card>
						<CardHeader>
							<CardTitle className="text-headline">
								{t("withoutOwner")}
							</CardTitle>
						</CardHeader>
						<CardContent className="flex items-baseline justify-between">
							<span className="font-bold text-title-1">
								{withoutOwner.length}
							</span>
							<Link
								href="/controls?unowned=1"
								className="text-primary text-footnote hover:underline"
							>
								{t("toControls")}
							</Link>
						</CardContent>
					</Card>
					<Card>
						<CardHeader>
							<CardTitle className="text-headline">{t("openTasks")}</CardTitle>
						</CardHeader>
						<CardContent className="flex items-baseline justify-between">
							<span className="font-bold text-title-1">{openTasks}</span>
							<Link
								href="/heute/aufgaben?all=1"
								className="text-primary text-footnote hover:underline"
							>
								{t("toControls")}
							</Link>
						</CardContent>
					</Card>
					<Card>
						<CardHeader>
							<CardTitle className="text-headline">{t("stage")}</CardTitle>
						</CardHeader>
						<CardContent className="text-subhead">
							{STAGE_LABEL[settings?.licenceStage ?? "0_vorbereitung"]}
							<p className="mt-1 text-muted-foreground text-footnote">
								{t("members")}: {members.length}
							</p>
						</CardContent>
					</Card>
					<Card>
						<CardHeader>
							<CardTitle className="text-headline">
								{t("relationsTitle")}
							</CardTitle>
							<CardDescription>{t("relationsLead")}</CardDescription>
						</CardHeader>
						<CardContent>
							<Link
								href="/zusammenhaenge"
								className="text-primary text-subhead hover:underline underline-offset-4"
							>
								{t("relationsOpen")}
							</Link>
						</CardContent>
					</Card>
				</div>
			</div>
		</>
	);
}
