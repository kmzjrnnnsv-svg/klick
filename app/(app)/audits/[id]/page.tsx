import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ensureStepUp } from "@/app/actions/security";
import {
	AdoptFindingsButton,
	AuditForm,
	AuditRequestForm,
	AuditStatusSelect,
	DecideRequestButtons,
	FindingForm,
	FindingStatusSelect,
	FindingToNcButton,
	RespondRequestForm,
} from "@/components/audits/audit-forms";
import { Timeline } from "@/components/charts/timeline";
import { ExportLink } from "@/components/entity/export-link";
import { RegisterFilters } from "@/components/entity/register-filters";
import { SummaryCard, SummaryGrid } from "@/components/entity/summary-card";
import { UrlTabs } from "@/components/entity/url-tabs";
import { UserChip } from "@/components/entity/user-chip";
import { EvidenceFileLink } from "@/components/evidence/evidence-file-link";
import { EntityEvidence } from "@/components/evidence-studio/entity-evidence";
import { withMessages } from "@/components/i18n/with-messages";
import { PageHeader } from "@/components/page-header";
import {
	BlockerList,
	VERDICT_TONE,
} from "@/components/readiness/readiness-panel";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Donut, Ring } from "@/components/ui/ring";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { requireOrgPage } from "@/lib/auth/gates";
import { toOrgCtx } from "@/lib/auth/guards";
import { isExternal } from "@/lib/auth/memberships";
import { allows } from "@/lib/auth/permissions";
import { maskSecret } from "@/lib/auth/visibility";
import { independenceIssues } from "@/lib/compliance/audit-programme";
import {
	auditPhases,
	auditsAsAuditor,
	matchesRequest,
	REQUEST_VIEWS,
	type RequestView,
	requestCounts,
	requestOverdue,
	requestViewOf,
	viewCount,
} from "@/lib/compliance/audit-workspace";
import {
	CONTROL_BY_CODE,
	CONTROLS,
	EDGES_BY_REQUIREMENT,
	FRAMEWORK_BY_SLUG,
} from "@/lib/compliance/catalog";
import type { ReqCoverage } from "@/lib/compliance/coverage";
import { findingNeedsNonconformity } from "@/lib/compliance/nonconformity";
import {
	fmtDate,
	getOrgCoverageCached,
	shortFrameworkName,
} from "@/lib/compliance/page-data";
import {
	listControlRows,
	listEvidence,
	listEvidenceWithControls,
	listMembersForPicker,
} from "@/lib/compliance/queries";
import {
	getAudit,
	listAuditProgrammes,
	listProcesses,
	requestCommentCounts,
} from "@/lib/compliance/queries-p3";
import { loadReadiness } from "@/lib/compliance/queries-readiness";
import { newRiskHref } from "@/lib/compliance/risk-sources";
import { readOrg } from "@/lib/db/with-org";
import { NONCONFORMITY_STATUS } from "@/lib/entities/nonconformity";
import { berlinToday } from "@/lib/evidence-studio/queries";
import { listOrgFrameworks } from "@/lib/org/queries";
import { cn } from "@/lib/utils";
import { responsibleValue } from "@/lib/validation/responsible-ref";

type Search = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

const TONE: Record<ReqCoverage, "success" | "warning" | "outline" | "muted"> = {
	covered: "success",
	partial: "warning",
	open: "outline",
	not_applicable: "muted",
};
const SEV_TONE = {
	observation: "muted",
	minor: "outline",
	major: "warning",
	critical: "destructive",
} as const;
const REQ_TONE = {
	open: "warning",
	answered: "default",
	accepted: "success",
	rejected: "destructive",
} as const;
const IMPL_KEY = {
	not_started: "notStarted",
	planned: "planned",
	in_progress: "inProgress",
	implemented: "implemented",
	not_applicable: "notApplicable",
} as const;

// Prüfungs-Cockpit: Scope → Prüfpfad (Anforderung → Control → Nachweis) →
// Nachweisanfragen (PBC) → Findings. Lesend für Prüfer:innen; Antworten durch
// die Org, Entscheidungen durch Prüfer:innen/Owner.
async function AuditCockpitPage({
	params,
	searchParams,
}: {
	params: Promise<{ id: string }>;
	searchParams: Promise<Search>;
}) {
	const { id } = await params;
	if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
	const sp = await searchParams;
	const tab = one(sp.tab) ?? "uebersicht";
	const ctx = await requireOrgPage({ audit: ["read"] });
	const t = await getTranslations("Audits");
	const tNav = await getTranslations("Nav");
	const ts = await getTranslations("Status");
	const canEdit = allows(ctx, { audit: ["update"] });
	const canRequest = allows(ctx, { audit_request: ["create"] });
	const canRespond = allows(ctx, { audit_request: ["respond"] });
	const canDecide = allows(ctx, { audit_request: ["decide"] });
	const canFinding = allows(ctx, { audit_finding: ["create"] });
	const canNc = allows(ctx, { nonconformity: ["create"] });
	const canRisk = allows(ctx, { risk: ["create"] });
	const trs = await getTranslations("RiskSources");
	const canExport = allows(ctx, { export: ["create"] });

	const cov = await getOrgCoverageCached(ctx);
	const data = await readOrg(toOrgCtx(ctx), async (tx) => {
		const a = await getAudit(tx, ctx.orgId, id);
		if (!a) return null;
		const [
			members,
			frameworks,
			programmes,
			controls,
			evidenceLinks,
			evidence,
			processes,
			commentCounts,
		] = await Promise.all([
			listMembersForPicker(tx, ctx.orgId),
			listOrgFrameworks(tx, ctx.orgId),
			listAuditProgrammes(tx, ctx.orgId),
			listControlRows(tx, ctx.orgId),
			listEvidenceWithControls(tx, ctx.orgId),
			listEvidence(tx, ctx.orgId),
			listProcesses(tx, ctx.orgId),
			requestCommentCounts(
				tx,
				ctx.orgId,
				a.requests.map((r) => r.id),
			),
		]);
		return {
			...a,
			commentCounts,
			members,
			frameworks,
			programmes,
			controls,
			evidenceLinks,
			evidence,
			processes,
		};
	});
	if (!data) notFound();
	// Prüfungsreife zum Prüfungstermin (geplant, sonst Periodenende, sonst heute)
	// über die Rahmenwerke des Audits, inklusive PBC-Stand.
	const auditSlugs = data.audit.frameworkIds.filter((s) =>
		FRAMEWORK_BY_SLUG.has(s),
	);
	const today = new Date();
	const auditDate = data.audit.plannedAt ?? data.audit.periodEnd;
	const readinessAsOf =
		auditDate && new Date(auditDate) > today
			? new Date(`${auditDate}T12:00:00Z`)
			: today;
	const readiness = await readOrg(toOrgCtx(ctx), (tx) =>
		loadReadiness(tx, ctx.orgId, {
			asOf: readinessAsOf,
			frameworks: auditSlugs.length > 0 ? auditSlugs : undefined,
			auditId: data.audit.id,
		}),
	);
	const tr = await getTranslations("Readiness");
	const {
		audit,
		findings,
		requests,
		names,
		members,
		frameworks,
		controls,
		evidenceLinks,
	} = data;
	// streng geheime Nachweise ohne Grant: ohne Titel (Prüfer-Sicht)
	const secretTitle = (await getTranslations("Evidence"))("secretTitle");
	const evidence = maskSecret(ctx, data.evidence, secretTitle);
	// Prüfer:innen dieses Audits laden das Paket auch ohne Export-Recht
	const auditorHere = auditsAsAuditor([audit], ctx.userId).length > 0;
	const canPackage = canExport || auditorHere;
	const isAuditor = ctx.orgRole === "auditor";

	const adoptable = findings.filter(
		(f) =>
			!f.nonconformityId &&
			f.status !== "closed" &&
			findingNeedsNonconformity(f.severity),
	).length;
	const evidenceCount = new Map<string, number>();
	const evidenceByControl = new Map<string, typeof evidenceLinks>();
	for (const e of maskSecret(ctx, evidenceLinks, secretTitle))
		for (const code of e.controlCodes) {
			evidenceCount.set(code, (evidenceCount.get(code) ?? 0) + 1);
			const list = evidenceByControl.get(code) ?? [];
			list.push(e);
			evidenceByControl.set(code, list);
		}
	const controlByCode = new Map(controls.map((c) => [c.code, c]));
	const slugs = audit.frameworkIds.filter((s) => FRAMEWORK_BY_SLUG.has(s));
	const path = slugs.flatMap((slug) => {
		const fw = FRAMEWORK_BY_SLUG.get(slug);
		if (!fw) return [];
		return fw.requirements.map((r) => {
			const key = `${slug}:${r.code}`;
			const status =
				cov?.result.byRequirement.get(key) ?? ("open" as ReqCoverage);
			const edges = EDGES_BY_REQUIREMENT.get(key) ?? [];
			return { slug, r, status, edges };
		});
	});
	// Prüfpfad als eine Stelle: Filter nach Rahmenwerk, Stand und Suche
	const pathFw = one(sp.rahmenwerk);
	const pathStand = one(sp.stand);
	const pathQ = (one(sp.q) ?? "").trim().toLowerCase();
	const shownPath = path.filter(
		({ slug, r, status, edges }) =>
			(!pathFw || slug === pathFw) &&
			(!pathStand || status === pathStand) &&
			(!pathQ ||
				`${r.code} ${r.title} ${edges.map((e) => e.control).join(" ")}`
					.toLowerCase()
					.includes(pathQ)),
	);
	const independence = independenceIssues(audit.auditorMemberIds, [
		...controls.map((c) => ({
			kind: "control" as const,
			ref: c.code,
			ownerUserId: c.ownerUserId,
		})),
		...data.processes.map((p) => ({
			kind: "process" as const,
			ref: p.code,
			ownerUserId: p.ownerUserId,
		})),
	]);
	const todayIso = berlinToday();
	const counts = requestCounts(requests);
	// offen = offen oder abgelehnt (Nacharbeit), wie die Ansicht „Offen“
	const openCount = viewCount("offen", counts);
	const view: RequestView = requestViewOf(one(sp.ansicht), counts);
	const q = one(sp.q);
	const shownRequests = requests.filter(
		(r) =>
			(REQUEST_VIEWS[view] as readonly string[]).includes(r.status) &&
			matchesRequest(r, q),
	);
	const viewHref = (v: RequestView) => {
		const p = new URLSearchParams({ tab: "anfragen", ansicht: v });
		if (q) p.set("q", q);
		return `/audits/${audit.id}?${p}`;
	};
	const phases = auditPhases(
		audit,
		requests,
		todayIso,
		{
			periodStart: t("phasePeriodStart"),
			periodEnd: t("phasePeriodEnd"),
			planned: t("phasePlanned"),
			performed: t("phasePerformed"),
			requestsDue: (n) => t("phaseRequestsDue", { n }),
		},
		() => `/audits/${audit.id}?tab=anfragen&ansicht=offen`,
	);
	const openFindings = findings.filter((f) => f.status !== "closed");
	// Rückfrage aus dem Prüfpfad: Anfrage-Dialog mit Control vorbelegt
	const followUp = {
		open: one(sp.neu) === "1",
		control: one(sp.control),
		title: one(sp.titel),
	};
	const periodLabel =
		audit.periodStart || audit.periodEnd
			? `${audit.periodStart ? fmtDate.format(new Date(audit.periodStart)) : "…"} – ${audit.periodEnd ? fmtDate.format(new Date(audit.periodEnd)) : "…"}`
			: null;

	return (
		<>
			<PageHeader
				back={{ href: "/audits", label: tNav("audits") }}
				eyebrow={`${t(`type_${audit.type}`)}${periodLabel ? ` · ${periodLabel}` : ""}`}
				title={audit.title}
				lead={audit.scope ?? undefined}
				actions={
					<div className="flex flex-wrap items-center gap-2">
						{canPackage && (
							<ExportLink
								href={`/api/export/pruefungspaket.zip?audit=${audit.id}`}
								className={cn(
									buttonVariants({
										variant: isAuditor ? "default" : "outline",
										size: "sm",
									}),
								)}
								title={t("exportPackageHint")}
								ensure={canExport ? undefined : ensureStepUp}
							>
								{t("exportPackage")}
							</ExportLink>
						)}
						{canEdit ? (
							<AuditStatusSelect auditId={audit.id} status={audit.status} />
						) : (
							<Badge variant="outline">{t(`status_${audit.status}`)}</Badge>
						)}
						{canEdit && (
							<AuditForm
								members={members}
								frameworks={frameworks}
								programmes={data.programmes.map((p) => ({
									id: p.id,
									title: p.title,
								}))}
								initial={{
									id: audit.id,
									programmeId: audit.programmeId,
									type: audit.type,
									title: audit.title,
									scope: audit.scope,
									periodStart: audit.periodStart,
									periodEnd: audit.periodEnd,
									frameworkIds: audit.frameworkIds,
									auditorMemberIds: audit.auditorMemberIds,
									externalAuditor: audit.externalAuditor,
									plannedAt: audit.plannedAt,
									ownerUserId: responsibleValue(audit),
								}}
							/>
						)}
					</div>
				}
			/>
			<div className="-mt-2 mb-6">
				<EntityEvidence ctx={ctx} code="NW-AUDITBERICHT" entityId={audit.id} />
			</div>
			<dl className="mb-6 grid grid-cols-1 gap-x-6 gap-y-2 text-subhead sm:grid-cols-2 lg:grid-cols-4">
				<div>
					<dt className="font-medium text-footnote text-muted-foreground">
						{t("frameworks")}
					</dt>
					<dd className="flex flex-wrap gap-1">
						{slugs.length === 0 ? (
							<span className="text-muted-foreground">
								{t("frameworksNone")}
							</span>
						) : (
							slugs.map((s) => (
								<Badge key={s} variant="muted" className="">
									{shortFrameworkName(s)}
								</Badge>
							))
						)}
					</dd>
				</div>
				<div>
					<dt className="font-medium text-footnote text-muted-foreground">
						{t("auditors")}
					</dt>
					<dd className="flex flex-wrap gap-2">
						{audit.auditorMemberIds.map((u) => (
							<UserChip key={u} name={names.get(u)} />
						))}
						{audit.externalAuditor && <span>{audit.externalAuditor}</span>}
						{audit.auditorMemberIds.length === 0 && !audit.externalAuditor && (
							<span className="text-muted-foreground">{t("auditorsNone")}</span>
						)}
					</dd>
				</div>
				<div>
					<dt className="font-medium text-footnote text-muted-foreground">
						{t("owner")}
					</dt>
					<dd>
						<UserChip name={names.get(audit.ownerUserId ?? "")} />
					</dd>
				</div>
				<div>
					<dt className="font-medium text-footnote text-muted-foreground">
						{t("requests")}
					</dt>
					<dd className="font-semibold text-title-3">
						{requests.length - openCount}/{requests.length}
					</dd>
				</div>
				{readiness && (
					<div>
						<dt className="font-medium text-footnote text-muted-foreground">
							{tr("title")} · {fmtDate.format(readinessAsOf)}
						</dt>
						<dd className="flex items-center gap-2">
							<Link
								href={`/audits/${audit.id}?tab=pruefungsreife`}
								scroll={false}
								className="font-semibold text-title-3 tabular-nums hover:underline"
							>
								{readiness.combined.score ?? "—"}
							</Link>
							<Badge variant={VERDICT_TONE[readiness.combined.verdict]}>
								{tr(`verdict_${readiness.combined.verdict}`)}
							</Badge>
						</dd>
					</div>
				)}
			</dl>
			{independence.length > 0 && (
				<div className="mb-6 rounded-xl bg-destructive/10 p-3 text-subhead">
					<p className="font-medium">{t("independenceTitle")}</p>
					<ul className="mt-1 list-disc pl-5 text-footnote">
						{independence.map((i) => (
							<li key={`${i.auditorUserId}-${i.kind}-${i.ref}`}>
								{names.get(i.auditorUserId) ?? i.auditorUserId}:{" "}
								{t(`indep_${i.kind}`)} {i.ref}
							</li>
						))}
					</ul>
				</div>
			)}
			{isExternal(ctx.orgRole) && ctx.accessUntil && (
				<p className="text-footnote text-muted-foreground">
					{t("accessUntil", { date: fmtDate.format(ctx.accessUntil) })}
				</p>
			)}
			<UrlTabs
				base={`/audits/${audit.id}`}
				active={tab}
				// Prüfer:innen arbeiten zuerst mit den Anfragen
				tabs={[
					{ value: "uebersicht", label: t("tabOverview") },
					...(isAuditor
						? [
								{
									value: "anfragen",
									label: t("tabRequests"),
									count: openCount || undefined,
								},
								{ value: "pruefpfad", label: t("tabPath"), count: path.length },
							]
						: [
								{ value: "pruefpfad", label: t("tabPath"), count: path.length },
								{
									value: "anfragen",
									label: t("tabRequests"),
									count: openCount || undefined,
								},
							]),
					{
						value: "findings",
						label: t("tabFindings"),
						count:
							findings.filter((f) => f.status !== "closed").length || undefined,
					},
					{
						value: "pruefungsreife",
						label: t("tabReadiness"),
						count: readiness?.combined.criticalBlockers || undefined,
					},
				]}
			/>

			{tab === "uebersicht" && (
				<SummaryGrid>
					<SummaryCard
						title={t("timelineTitle")}
						className="md:col-span-2 xl:col-span-3"
					>
						<Timeline
							start={phases.start}
							end={phases.end}
							today={todayIso}
							items={phases.items}
							label={t("timelineTitle")}
							todayLabel={t("today")}
							empty={t("timelineEmpty")}
						/>
					</SummaryCard>
					<SummaryCard title={t("requests")}>
						{requests.length === 0 ? (
							<p className="text-footnote text-muted-foreground">
								{t("requestsEmpty")}
							</p>
						) : (
							<Donut
								label={t("requests")}
								center={requests.length}
								items={[
									{
										key: "open",
										label: t("rstatus_open"),
										value: counts.open,
										tone: "warning",
										href: viewHref("offen"),
									},
									{
										key: "rejected",
										label: t("rstatus_rejected"),
										value: counts.rejected,
										tone: "destructive",
										href: viewHref("offen"),
									},
									{
										key: "answered",
										label: t("rstatus_answered"),
										value: counts.answered,
										tone: "primary",
										href: viewHref("beantwortet"),
									},
									{
										key: "accepted",
										label: t("rstatus_accepted"),
										value: counts.accepted,
										tone: "success",
										href: viewHref("akzeptiert"),
									},
								]}
							/>
						)}
					</SummaryCard>
					<SummaryCard title={t("findingsOpenTitle")}>
						{openFindings.length === 0 ? (
							<p className="text-footnote text-muted-foreground">
								{t("findingsNoneOpen")}
							</p>
						) : (
							<Donut
								label={t("findingsOpenTitle")}
								center={openFindings.length}
								items={(
									["critical", "major", "minor", "observation"] as const
								).map((sev) => ({
									key: sev,
									label: t(`severity_${sev}`),
									value: openFindings.filter((f) => f.severity === sev).length,
									tone:
										sev === "critical"
											? "destructive"
											: sev === "major"
												? "warning"
												: sev === "minor"
													? "primary"
													: "muted",
									href: `/audits/${audit.id}?tab=findings`,
								}))}
							/>
						)}
					</SummaryCard>
					{readiness && (
						<SummaryCard
							title={`${tr("title")} · ${fmtDate.format(readinessAsOf)}`}
						>
							<Link
								href={`/audits/${audit.id}?tab=pruefungsreife`}
								className="flex items-center gap-4 rounded-xl hover:bg-muted/50"
							>
								<Ring
									value={readiness.combined.score ?? 0}
									size={72}
									tone={
										(readiness.combined.score ?? 0) >= 80
											? "success"
											: (readiness.combined.score ?? 0) >= 50
												? "warning"
												: "destructive"
									}
									label={`${tr("title")}: ${readiness.combined.score ?? "—"}`}
								>
									{readiness.combined.score ?? "—"}
								</Ring>
								<span className="flex flex-col gap-1 text-subhead">
									<Badge variant={VERDICT_TONE[readiness.combined.verdict]}>
										{tr(`verdict_${readiness.combined.verdict}`)}
									</Badge>
									<span className="text-footnote text-muted-foreground">
										{t("blockersCount", {
											n: readiness.combined.blockers.length,
										})}
									</span>
								</span>
							</Link>
						</SummaryCard>
					)}
				</SummaryGrid>
			)}

			{tab === "pruefungsreife" && readiness && (
				<section className="flex flex-col gap-4">
					<p className="text-muted-foreground text-subhead">{tr("lead")}</p>
					<ul className="flex flex-wrap gap-2 text-subhead">
						{readiness.results.map((r) => (
							<li key={r.framework}>
								<Link
									href={`/rahmenwerke/${r.framework}?tab=pruefungsreife&stichtag=${r.asOf}`}
									className="flex items-center gap-2 rounded-xl bg-card px-3 py-1.5 hover:bg-muted"
								>
									<span>{shortFrameworkName(r.framework)}</span>
									<span className="tabular-nums">{r.score ?? "—"}</span>
									<Badge variant={VERDICT_TONE[r.verdict]}>
										{tr(`verdict_${r.verdict}`)}
									</Badge>
								</Link>
							</li>
						))}
					</ul>
					<h2 className="font-medium">{tr("blockers")}</h2>
					<BlockerList
						blockers={readiness.combined.blockers}
						canCreateTask={allows(ctx, { task: ["create"] })}
					/>
				</section>
			)}

			{tab === "pruefpfad" && (
				<section className="flex flex-col gap-3">
					<p className="text-muted-foreground text-subhead">{t("pathLead")}</p>
					{path.length > 0 && (
						<RegisterFilters
							filters={[
								...(slugs.length > 1
									? [
											{
												key: "rahmenwerk",
												label: t("pathFramework"),
												options: slugs.map((s) => ({
													value: s,
													label: shortFrameworkName(s),
												})),
											},
										]
									: []),
								{
									key: "stand",
									label: t("status"),
									options: (["covered", "partial", "open"] as const).map(
										(s) => ({ value: s, label: t(`pathStatus_${s}`) }),
									),
								},
							]}
							searchPlaceholder={t("pathSearch")}
							ignore={["tab"]}
						/>
					)}
					{path.length === 0 ? (
						<p className="text-subhead">{t("pathEmpty")}</p>
					) : shownPath.length === 0 ? (
						<p className="text-muted-foreground text-subhead">
							{t("pathNoMatch")}
						</p>
					) : (
						<div className="overflow-x-auto rounded-2xl bg-card">
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead className="w-32">{t("requirement")}</TableHead>
										<TableHead>{t("titleField")}</TableHead>
										<TableHead className="w-24">{t("status")}</TableHead>
										<TableHead>{t("controlsEvidence")}</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{shownPath.map(({ slug, r, status, edges }) => (
										<TableRow key={`${slug}:${r.code}`}>
											<TableCell className="align-top">
												<Link
													href={`/rahmenwerke/${slug}/${encodeURIComponent(r.code)}`}
													className="font-mono text-footnote hover:underline"
												>
													{shortFrameworkName(slug)} {r.code}
												</Link>
											</TableCell>
											<TableCell className="align-top text-footnote">
												{r.title}
											</TableCell>
											<TableCell className="align-top">
												<Badge variant={TONE[status]}>
													{t(`pathStatus_${status}`)}
												</Badge>
											</TableCell>
											<TableCell className="align-top">
												<ul className="flex flex-col gap-1 text-footnote">
													{edges.map((e) => {
														const c = controlByCode.get(e.control);
														const ev = evidenceCount.get(e.control) ?? 0;
														return (
															<li
																key={e.control}
																className="flex flex-wrap items-center gap-2"
															>
																<Link
																	href={`/controls/${e.control}`}
																	className="font-mono hover:underline"
																	title={CONTROL_BY_CODE.get(e.control)?.title}
																>
																	{e.control}
																</Link>
																<Badge
																	variant={
																		c?.status === "implemented"
																			? "success"
																			: c?.status === "in_progress"
																				? "warning"
																				: "outline"
																	}
																>
																	{ts(
																		IMPL_KEY[
																			(c?.status ??
																				"not_started") as keyof typeof IMPL_KEY
																		],
																	)}
																</Badge>
																<UserChip name={c?.ownerName} fallback="—" />
																{ev === 0 ? (
																	<Link
																		href={`/controls/${e.control}?audit=${audit.id}#nachweise`}
																		className="text-destructive hover:underline"
																	>
																		{t("evidenceNone")}
																	</Link>
																) : (
																	<details className="group w-full">
																		<summary className="hit-area inline-flex cursor-pointer list-none items-center gap-1 text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden">
																			<ChevronRight
																				aria-hidden="true"
																				className="size-3.5 transition-transform group-open:rotate-90 motion-reduce:transition-none"
																			/>
																			{t("evidenceCount", { n: ev })}
																		</summary>
																		<ul className="mt-1 flex flex-col gap-1 pl-4">
																			{(evidenceByControl.get(e.control) ?? [])
																				.slice(0, 5)
																				.map((x) => (
																					<li
																						key={x.id}
																						className="flex flex-wrap items-center gap-x-2"
																					>
																						<Link
																							href={`/nachweise/${x.id}?audit=${audit.id}`}
																							className="min-w-0 truncate hover:underline"
																						>
																							{x.title}
																						</Link>
																						{x.storageKey && (
																							<EvidenceFileLink
																								id={x.id}
																								classification={
																									x.classification
																								}
																								className="hit-area text-primary hover:underline"
																							>
																								{t("evidenceDownload")}
																							</EvidenceFileLink>
																						)}
																					</li>
																				))}
																			{ev > 5 && (
																				<li>
																					<Link
																						href={`/controls/${e.control}?audit=${audit.id}#nachweise`}
																						className="text-primary hover:underline"
																					>
																						{t("evidenceAll", { n: ev })}
																					</Link>
																				</li>
																			)}
																		</ul>
																	</details>
																)}
																{canRequest && (
																	<Link
																		href={`/audits/${audit.id}?${new URLSearchParams(
																			{
																				tab: "anfragen",
																				neu: "1",
																				control: e.control,
																				titel: t("followUpTitle", {
																					req: `${shortFrameworkName(slug)} ${r.code}`,
																				}),
																			},
																		)}`}
																		className="text-primary hover:underline"
																	>
																		{t("followUp")}
																	</Link>
																)}
															</li>
														);
													})}
													{edges.length === 0 && (
														<li className="text-muted-foreground">
															{t("controlNone")}
														</li>
													)}
												</ul>
											</TableCell>
										</TableRow>
									))}
								</TableBody>
							</Table>
						</div>
					)}
				</section>
			)}

			{tab === "anfragen" && (
				<section className="flex flex-col gap-4">
					<div className="flex items-start justify-between gap-3">
						<p className="text-muted-foreground text-subhead">
							{t("requestsLead")}
						</p>
						{canRequest && (
							<AuditRequestForm
								auditId={audit.id}
								members={members}
								controlOptions={CONTROLS.map((c) => ({
									code: c.code,
									title: c.title,
								}))}
								initialOpen={followUp.open}
								initialControl={followUp.control}
								initialTitle={followUp.title}
							/>
						)}
					</div>
					{requests.length > 0 && (
						<div className="flex flex-wrap items-center gap-3">
							<nav
								aria-label={t("requestViews")}
								className="inline-flex rounded-xl bg-muted p-0.5 text-subhead"
							>
								{(Object.keys(REQUEST_VIEWS) as RequestView[]).map((v) => (
									<Link
										key={v}
										href={viewHref(v)}
										aria-current={view === v ? "true" : undefined}
										className={cn(
											"hit-area rounded-lg px-3 py-1.5",
											view === v && "bg-card font-medium shadow-sm",
										)}
									>
										{t(`rview_${v}`)}{" "}
										<span className="text-muted-foreground tabular-nums">
											{viewCount(v, counts)}
										</span>
									</Link>
								))}
							</nav>
							<RegisterFilters
								filters={[]}
								searchPlaceholder={t("requestsSearch")}
								ignore={["tab", "ansicht"]}
							/>
						</div>
					)}
					{requests.length === 0 ? (
						<p className="text-subhead">{t("requestsEmpty")}</p>
					) : shownRequests.length === 0 ? (
						<p className="text-muted-foreground text-subhead">
							{t("requestsNoMatch")}
						</p>
					) : (
						<ul className="flex flex-col gap-3">
							{shownRequests.map((r) => (
								<li
									key={r.id}
									className="flex flex-col gap-2 rounded-2xl bg-card p-3 text-subhead"
								>
									<div className="flex flex-wrap items-center gap-2">
										<Badge variant={REQ_TONE[r.status]}>
											{t(`rstatus_${r.status}`)}
										</Badge>
										<Link
											href={`/audits/${audit.id}/anfragen/${r.id}`}
											className="font-medium hover:underline"
										>
											{r.title}
										</Link>
										{(data.commentCounts.get(r.id) ?? 0) > 0 && (
											<span className="text-footnote text-muted-foreground">
												{t("commentsCount", {
													n: data.commentCounts.get(r.id) ?? 0,
												})}
											</span>
										)}
										{r.controlCode && (
											<Link
												href={`/controls/${r.controlCode}`}
												className="font-mono text-footnote hover:underline"
											>
												{r.controlCode}
											</Link>
										)}
										<span className="ml-auto text-muted-foreground text-footnote">
											{t("requestedBy")}{" "}
											{names.get(r.requestedByUserId ?? "") ?? "—"} ·{" "}
											{t("assignee")}:{" "}
											{names.get(r.assigneeUserId ?? "") ?? "—"}
											{r.dueAt ? (
												<span
													className={
														requestOverdue(r, todayIso)
															? "text-destructive"
															: undefined
													}
												>
													{` · ${t("dueAt")} ${fmtDate.format(new Date(r.dueAt))}`}
												</span>
											) : null}
										</span>
									</div>
									{r.description && (
										<p className="text-muted-foreground text-footnote">
											{r.description}
										</p>
									)}
									{r.responseNote && (
										<div className="rounded-md bg-muted/40 p-2 text-footnote">
											<p className="font-medium text-footnote mb-1 text-muted-foreground">
												{t("response")}
											</p>
											<p className="whitespace-pre-wrap">{r.responseNote}</p>
											{r.responseEvidenceIds.length > 0 && (
												<p className="mt-1 flex flex-wrap gap-1">
													{r.responseEvidenceIds.map((eid) => {
														const ev = evidence.find((x) => x.id === eid);
														return (
															<EvidenceFileLink
																key={eid}
																id={eid}
																classification={ev?.classification ?? "secret"}
																className="rounded-sm border px-1.5 py-0.5 hover:bg-muted"
															>
																{ev?.title ?? eid.slice(0, 8)}
															</EvidenceFileLink>
														);
													})}
												</p>
											)}
										</div>
									)}
									<div className="flex flex-wrap gap-2">
										{canRespond &&
											(r.status === "open" || r.status === "rejected") && (
												<RespondRequestForm
													requestId={r.id}
													evidence={evidence.map((e) => ({
														id: e.id,
														title: e.title,
													}))}
												/>
											)}
										{canDecide && r.status === "answered" && (
											<DecideRequestButtons requestId={r.id} />
										)}
									</div>
								</li>
							))}
						</ul>
					)}
				</section>
			)}

			{tab === "findings" && (
				<section className="flex flex-col gap-4">
					<div className="flex items-start justify-between gap-3">
						<p className="text-muted-foreground text-subhead">
							{t("findingsLead")}
						</p>
						<div className="flex shrink-0 flex-wrap items-center gap-2">
							{canNc && adoptable > 0 && (
								<AdoptFindingsButton auditId={audit.id} count={adoptable} />
							)}
							{canFinding && (
								<FindingForm
									auditId={audit.id}
									controlOptions={CONTROLS.map((c) => ({
										code: c.code,
										title: c.title,
									}))}
								/>
							)}
						</div>
					</div>
					{findings.length === 0 ? (
						<p className="text-subhead">{t("findingsEmpty")}</p>
					) : (
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead className="w-28">{t("severity")}</TableHead>
									<TableHead>{t("titleField")}</TableHead>
									<TableHead className="w-28">Control</TableHead>
									<TableHead className="w-40">{t("status")}</TableHead>
									<TableHead className="w-48 text-right">
										{t("nonconformity")}
									</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{findings.map((f) => (
									<TableRow key={f.id}>
										<TableCell>
											<Badge variant={SEV_TONE[f.severity]}>
												{t(`severity_${f.severity}`)}
											</Badge>
										</TableCell>
										<TableCell>
											<p className="font-medium">{f.title}</p>
											{f.description && (
												<p className="text-muted-foreground text-footnote">
													{f.description}
												</p>
											)}
											<p className="text-muted-foreground text-footnote">
												{names.get(f.createdByUserId ?? "") ?? "—"} ·{" "}
												{fmtDate.format(f.createdAt)}
												{f.requirementCode ? ` · ${f.requirementCode}` : ""}
											</p>
										</TableCell>
										<TableCell className="whitespace-nowrap font-mono text-footnote">
											{f.controlCode ? (
												<Link
													href={`/controls/${f.controlCode}`}
													className="hover:underline"
												>
													{f.controlCode}
												</Link>
											) : (
												"—"
											)}
										</TableCell>
										<TableCell>
											<FindingStatusSelect
												findingId={f.id}
												status={f.status}
												disabled={
													!allows(ctx, {
														audit_finding: ["update"],
													})
												}
											/>
										</TableCell>
										<TableCell className="text-right">
											{f.nonconformityId ? (
												<Link
													href={`/abweichungen/${f.nonconformityId}`}
													className="font-mono text-footnote hover:underline"
												>
													{f.ncCode} ·{" "}
													{f.ncStatus
														? ts(
																NONCONFORMITY_STATUS.labelKey[
																	f.ncStatus
																] as "ncOpen",
															)
														: ""}
												</Link>
											) : canNc ? (
												<FindingToNcButton findingId={f.id} />
											) : (
												"—"
											)}
											{canRisk && f.severity !== "observation" && (
												<Link
													href={newRiskHref("audit_finding", f.id)}
													className="mt-1 block text-primary text-footnote hover:underline"
												>
													{trs("create")}
												</Link>
											)}
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					)}
				</section>
			)}
		</>
	);
}

export default withMessages(AuditCockpitPage, [
	"Audits",
	"Auth",
	"Common",
	"Entity",
	"EvidenceStudio",
	"Functions",
	"Organisation",
	"Readiness",
	"Signatures",
]);
