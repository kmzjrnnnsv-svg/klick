import { CheckCircle2, Circle } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { CoverageBar } from "@/components/entity/coverage-bar";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { requireOrg, toOrgCtx } from "@/lib/auth/guards";
import { listOrgMembers, listPendingInvitations } from "@/lib/auth/org";
import { CONTROL_BY_CODE, FRAMEWORK_BY_SLUG } from "@/lib/compliance/catalog";
import {
	CATALOG_CONTROL_REFS,
	CATALOG_EDGES,
	CATALOG_REQ_REFS,
} from "@/lib/compliance/catalog-view";
import {
	getOrgCoverageCached,
	pct,
	shortFrameworkName,
} from "@/lib/compliance/page-data";
import {
	listControlRows,
	listEvidenceWithControls,
	listTasks,
} from "@/lib/compliance/queries";
import { prioritizePlan } from "@/lib/compliance/synergy";
import { readOrg } from "@/lib/db/with-org";

const STAGE_LABEL: Record<string, string> = {
	"0_vorbereitung": "0 · Vorbereitung",
	"1_agent": "1 · Agent / Dienstleister",
	"2_casp_zag": "2 · CASP + ZAG",
	"3_emi": "3 · E-Geld-Institut",
	"4_bank": "4 · Bank",
};

export default async function OverviewPage() {
	const ctx = await requireOrg();
	const t = await getTranslations("Overview");
	const tc = await getTranslations("Controls");
	const [members, invitations, cov] = await Promise.all([
		listOrgMembers(ctx.orgId),
		listPendingInvitations(ctx.orgId),
		getOrgCoverageCached(ctx),
	]);
	const { controls, evidence, openTasks } = await readOrg(
		toOrgCtx(ctx),
		async (tx) => ({
			controls: await listControlRows(tx, ctx.orgId),
			evidence: await listEvidenceWithControls(tx, ctx.orgId),
			openTasks: (await listTasks(tx, ctx.orgId, { openOnly: true })).length,
		}),
	);
	const settings = cov?.profile;
	const fws = cov?.frameworks ?? [];
	const hasNis2 = fws.includes("nis2");
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
		{
			key: "roles",
			label: t("setupRoles"),
			done: false,
			href: "/organisation",
			phase: "P3",
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
			done: false,
			href: "/einstellungen",
			phase: "P2",
		},
		{
			key: "templates",
			label: t("setupTemplates"),
			done: false,
			href: "/dokumente",
			phase: "P2",
		},
		{
			key: "providers",
			label: t("setupProviders"),
			done: false,
			href: "/dienstleister",
			phase: "P2",
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
