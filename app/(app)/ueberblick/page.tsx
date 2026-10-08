import { CheckCircle2, Circle } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { CoverageBar } from "@/components/entity/coverage-bar";
import { Sparkline } from "@/components/entity/sparkline";
import { PageHeader } from "@/components/page-header";
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
import { listOrgMembers, listPendingInvitations } from "@/lib/auth/org";
import { CONTROL_BY_CODE, FRAMEWORK_BY_SLUG } from "@/lib/compliance/catalog";
import {
	requiredResolutions,
	resolutionCoverage,
} from "@/lib/compliance/catalog/resolutions-required";
import {
	CATALOG_CONTROL_REFS,
	CATALOG_EDGES,
	CATALOG_REQ_REFS,
} from "@/lib/compliance/catalog-view";
import { capaState } from "@/lib/compliance/nonconformity";
import { runState } from "@/lib/compliance/obligations";
import {
	getOrgCoverageCached,
	pct,
	shortFrameworkName,
} from "@/lib/compliance/page-data";
import { postureTrend } from "@/lib/compliance/posture";
import {
	listControlRows,
	listEvidenceWithControls,
	listTasks,
} from "@/lib/compliance/queries";
import {
	listDocuments,
	listProviders,
	listRisks,
} from "@/lib/compliance/queries-p2";
import {
	dependencyMap,
	governanceStatus,
	listNonconformities,
	listObligationRuns,
	listProcesses,
	listResolutions,
} from "@/lib/compliance/queries-p3";
import { listPostureSnapshots } from "@/lib/compliance/queries-p4";
import { DEFAULT_RISK_APPETITE } from "@/lib/compliance/risk";
import { prioritizePlan } from "@/lib/compliance/synergy";
import { readOrg } from "@/lib/db/with-org";
import { getOrgSettings } from "@/lib/org/queries";

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
	const [members, invitations, cov] = await Promise.all([
		listOrgMembers(ctx.orgId),
		listPendingInvitations(ctx.orgId),
		getOrgCoverageCached(ctx),
	]);
	const settings = cov?.profile;
	const fws = cov?.frameworks ?? [];
	const stage = settings?.licenceStage ?? "0_vorbereitung";
	const now = new Date();
	const g = await readOrg(toOrgCtx(ctx), async (tx) => {
		const [
			controls,
			evidence,
			tasks,
			orgSettings,
			docs,
			providers,
			risks,
			procs,
			deps,
			gov,
			resolutions,
			ncs,
			runs,
			snapshots,
		] = await Promise.all([
			listControlRows(tx, ctx.orgId),
			listEvidenceWithControls(tx, ctx.orgId),
			listTasks(tx, ctx.orgId, { openOnly: true }),
			getOrgSettings(tx, ctx.orgId),
			listDocuments(tx, ctx.orgId),
			listProviders(tx, ctx.orgId),
			listRisks(tx, ctx.orgId),
			listProcesses(tx, ctx.orgId),
			dependencyMap(tx, ctx.orgId),
			governanceStatus(tx, ctx.orgId, fws, stage),
			listResolutions(tx, ctx.orgId),
			listNonconformities(tx, ctx.orgId),
			listObligationRuns(tx, ctx.orgId),
			listPostureSnapshots(tx, ctx.orgId, 35),
		]);
		return {
			controls,
			evidence,
			openTasks: tasks.length,
			orgSettings,
			docs,
			providers,
			risks,
			procs,
			deps,
			gov,
			resolutions,
			ncs,
			runs,
			snapshots,
		};
	});
	const { controls, evidence, openTasks } = g;
	const appetiteConfirmed =
		g.risks.length > 0 ||
		JSON.stringify(g.orgSettings?.riskAppetite ?? DEFAULT_RISK_APPETITE) !==
			JSON.stringify(DEFAULT_RISK_APPETITE);
	const resCov = resolutionCoverage(
		requiredResolutions(fws, stage),
		g.resolutions
			.filter((r) => r.effective)
			.map((r) => ({
				requiredCode: r.requiredCode,
				date: r.date,
				resolutionNumber: r.resolutionNumber,
			})),
		now,
	);
	const processesWithoutA = g.procs.filter(
		(p) => p.status !== "retired" && !p.accountable,
	);
	const overdueNcs = g.ncs.filter((n) => capaState(n, now).overdue);
	const overdueRuns = g.runs.filter(
		(r) => runState(r, r.leadDays, now) === "overdue",
	);
	const sodBlocks = g.gov.sod.filter((v) => v.rule.severity === "block");
	const gaps: { key: string; label: string; count: number; href: string }[] = [
		{
			key: "roles",
			label: t("gapRoles"),
			count: g.gov.coverage.gaps.length,
			href: "/organisation?tab=rollen",
		},
		{
			key: "sod",
			label: t("gapSod"),
			count: sodBlocks.length,
			href: "/organisation?tab=rollen",
		},
		{
			key: "resolutions",
			label: t("gapResolutions"),
			count: resCov.gaps.length,
			href: "/beschluesse?tab=pflicht",
		},
		{
			key: "processes",
			label: t("gapProcessesA"),
			count: processesWithoutA.length,
			href: "/prozesse",
		},
		{
			key: "ncs",
			label: t("gapNcs"),
			count: overdueNcs.length,
			href: "/abweichungen?overdue=1",
		},
		{
			key: "runs",
			label: t("gapRuns"),
			count: overdueRuns.length,
			href: "/kalender",
		},
	].filter((x) => x.count > 0);
	const hasNis2 = fws.includes("nis2");
	const hasDora = fws.includes("dora");
	const accepted = controls.filter((c) => c.status !== "not_started").length;
	const withEvidence = new Set(evidence.flatMap((e) => e.controlCodes));
	const implementedWithoutEvidence = controls.filter(
		(c) => c.status === "implemented" && !withEvidence.has(c.code),
	);
	const withoutOwner = controls.filter((c) => !c.ownerUserId);

	const steps: {
		key: string;
		label: string;
		done: boolean;
		href: string;
		phase?: string;
	}[] = [
		{ key: "mfa", label: t("setupMfa"), done: true, href: "/einstellungen" },
		{
			key: "team",
			label: t("setupTeam"),
			done: members.length > 1 || invitations.length > 0,
			href: "/team",
		},
		...(hasNis2
			? [
					{
						key: "nis2",
						label: t("setupNis2"),
						done: settings?.nis2Status !== "unchecked",
						href: "/einstellungen?tab=frameworks",
					},
				]
			: []),
		...(hasDora
			? [
					{
						key: "tlpt",
						label: t("setupTlpt"),
						done:
							Boolean(g.orgSettings?.setupFlags?.tlptConfirmedAt) ||
							Boolean(settings?.tlptDesignated),
						href: "/einstellungen?tab=frameworks",
					},
				]
			: []),
		{
			key: "roles",
			label: t("setupRoles"),
			done: g.gov.required.length > 0 && g.gov.coverage.gaps.length === 0,
			href: "/organisation?tab=rollen",
		},
		{
			key: "controls",
			label:
				accepted >= 10
					? t("setupControlsDone", { n: accepted })
					: t("setupControls"),
			done: accepted >= 10,
			href: "/controls",
		},
		{
			key: "appetite",
			label: t("setupAppetite"),
			done: appetiteConfirmed,
			href: "/einstellungen?tab=risk",
		},
		{
			key: "templates",
			label: t("setupTemplates"),
			done: g.docs.length > 0,
			href: "/dokumente",
		},
		{
			key: "providers",
			label: t("setupProviders"),
			done: g.providers.length > 0,
			href: "/dienstleister",
		},
		{
			key: "process",
			label: t("setupProcess"),
			done: g.deps.some((d) => d.assets.length > 0 && d.providers.length > 0),
			href: "/prozesse",
		},
	];
	const open = steps.filter((s) => !s.done);
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
				requirements: CATALOG_REQ_REFS,
				edges: CATALOG_EDGES,
				controls: CATALOG_CONTROL_REFS,
				applicability,
			},
			cov.implStatus,
			5,
		);
	}

	return (
		<>
			<PageHeader title={t("title")} />
			<div className="grid gap-4 lg:grid-cols-3">
				<Card className="lg:col-span-2">
					<CardHeader>
						<CardTitle>{t("coverageTitle")}</CardTitle>
						<CardDescription>{t("coverageLead")}</CardDescription>
					</CardHeader>
					<CardContent className="flex flex-col gap-4">
						{fws.filter(
							(f) => (FRAMEWORK_BY_SLUG.get(f)?.requirements.length ?? 0) > 0,
						).length === 0 ? (
							<p className="text-muted-foreground text-sm">
								{t("coverageNone")}
							</p>
						) : (
							fws.map((fw) => {
								const b = cov?.result.byFramework.get(fw);
								if (!b || b.total === 0) return null;
								return (
									<div key={fw} className="flex flex-col gap-1">
										<div className="flex items-baseline justify-between gap-2 text-sm">
											<Link
												href={`/rahmenwerke/${fw}`}
												className="font-medium hover:underline underline-offset-4"
											>
												{shortFrameworkName(fw)}
											</Link>
											<span className="font-serif-display text-lg text-primary">
												{pct(b.coveragePct)}
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
												<div className="flex items-center justify-between text-muted-foreground text-xs">
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
				<div className="flex flex-col gap-4">
					<Card>
						<CardHeader>
							<CardTitle className="text-base">{t("setupTitle")}</CardTitle>
							<CardDescription>{t("setupLead")}</CardDescription>
						</CardHeader>
						<CardContent>
							<ul className="flex flex-col divide-y divide-border/60">
								{steps.map((s) => (
									<li
										key={s.key}
										className="flex items-center gap-3 py-2 text-sm"
									>
										{s.done ? (
											<CheckCircle2
												className="size-4 text-success"
												strokeWidth={1.5}
											/>
										) : (
											<Circle
												className="size-4 text-muted-foreground"
												strokeWidth={1.5}
											/>
										)}
										{s.phase && !s.done ? (
											<span className="text-muted-foreground">{s.label}</span>
										) : (
											<Link
												href={s.href}
												className={
													s.done
														? "text-muted-foreground line-through"
														: "hover:underline"
												}
											>
												{s.label}
											</Link>
										)}
										{s.phase && !s.done && (
											<span className="ml-auto text-[0.58rem] tracking-[0.12em] text-muted-foreground">
												{s.phase}
											</span>
										)}
									</li>
								))}
							</ul>
							<p className="mt-3 text-muted-foreground text-xs">
								{steps.length - open.length} {t("done")} · {open.length}{" "}
								{t("open")}
							</p>
						</CardContent>
					</Card>
					<Card>
						<CardHeader>
							<CardTitle className="text-base">{t("gapsTitle")}</CardTitle>
							<CardDescription>{t("gapsLead")}</CardDescription>
						</CardHeader>
						<CardContent>
							{gaps.length === 0 ? (
								<p className="text-muted-foreground text-sm">{t("gapsNone")}</p>
							) : (
								<ul className="flex flex-col divide-y divide-border/60 text-sm">
									{gaps.map((x) => (
										<li
											key={x.key}
											className="flex items-center justify-between gap-2 py-2"
										>
											<Link href={x.href} className="hover:underline">
												{x.label}
											</Link>
											<Badge variant="destructive">{x.count}</Badge>
										</li>
									))}
								</ul>
							)}
						</CardContent>
					</Card>
				</div>
			</div>

			<div className="mt-4 grid gap-4 lg:grid-cols-3">
				<Card className="lg:col-span-2">
					<CardHeader>
						<CardTitle className="flex items-center justify-between text-base">
							{t("nextControls")}
							<Link
								href="/synergien"
								className="text-primary text-xs font-normal normal-case hover:underline"
							>
								{t("toSynergies")}
							</Link>
						</CardTitle>
						<CardDescription>{t("nextControlsLead")}</CardDescription>
					</CardHeader>
					<CardContent>
						{!plan || plan.steps.length === 0 ? (
							<p className="text-muted-foreground text-sm">
								{t("nextControlsEmpty")}
							</p>
						) : (
							<ol className="flex flex-col divide-y divide-border/60 text-sm">
								{plan.steps.map((s, i) => (
									<li key={s.control} className="flex items-center gap-3 py-2">
										<span className="w-5 text-muted-foreground">{i + 1}</span>
										<Link
											href={`/controls/${s.control}`}
											className="min-w-0 flex-1 truncate hover:underline underline-offset-4"
										>
											<span className="font-mono text-xs">{s.control}</span> ·{" "}
											{CONTROL_BY_CODE.get(s.control)?.title}
										</Link>
										<span className="hidden gap-1 sm:flex">
											{s.frameworks.map((fw) => (
												<Badge
													key={fw}
													variant="outline"
													className="normal-case tracking-normal"
												>
													{shortFrameworkName(fw)}
												</Badge>
											))}
										</span>
										<span className="w-16 text-right text-muted-foreground text-xs">
											{tc(`effort_${s.effort}`)}
										</span>
										<span className="w-14 text-right font-medium">
											{pct(s.cumulativeCoveragePct)}
										</span>
									</li>
								))}
							</ol>
						)}
					</CardContent>
				</Card>
				<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
					<Card>
						<CardHeader>
							<CardTitle className="text-base">
								{t("withoutEvidence")}
							</CardTitle>
						</CardHeader>
						<CardContent className="flex items-baseline justify-between">
							<span className="font-serif-display text-3xl text-primary">
								{implementedWithoutEvidence.length}
							</span>
							<Link
								href="/controls?status=implemented"
								className="text-primary text-xs hover:underline"
							>
								{t("toControls")}
							</Link>
						</CardContent>
					</Card>
					<Card>
						<CardHeader>
							<CardTitle className="text-base">{t("withoutOwner")}</CardTitle>
						</CardHeader>
						<CardContent className="flex items-baseline justify-between">
							<span className="font-serif-display text-3xl text-primary">
								{withoutOwner.length}
							</span>
							<Link
								href="/controls?unowned=1"
								className="text-primary text-xs hover:underline"
							>
								{t("toControls")}
							</Link>
						</CardContent>
					</Card>
					<Card>
						<CardHeader>
							<CardTitle className="text-base">{t("openTasks")}</CardTitle>
						</CardHeader>
						<CardContent className="flex items-baseline justify-between">
							<span className="font-serif-display text-3xl text-primary">
								{openTasks}
							</span>
							<Link
								href="/heute/aufgaben?all=1"
								className="text-primary text-xs hover:underline"
							>
								{t("toControls")}
							</Link>
						</CardContent>
					</Card>
					<Card>
						<CardHeader>
							<CardTitle className="text-base">{t("stage")}</CardTitle>
						</CardHeader>
						<CardContent className="text-sm">
							{STAGE_LABEL[settings?.licenceStage ?? "0_vorbereitung"]}
							<p className="mt-1 text-muted-foreground text-xs">
								{t("members")}: {members.length}
							</p>
						</CardContent>
					</Card>
				</div>
			</div>
		</>
	);
}
