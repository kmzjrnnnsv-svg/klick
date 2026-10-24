import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { EmptyState } from "@/components/entity/empty-state";
import { RegisterFilters } from "@/components/entity/register-filters";
import { StatusBadge } from "@/components/entity/status-badge";
import { UrlTabs } from "@/components/entity/url-tabs";
import { PageHeader } from "@/components/page-header";
import { NewEngagementDialog } from "@/components/security/engagement-forms";
import {
	QuickCheckForm,
	RefreshWhileRunning,
	ScanImportDialog,
} from "@/components/security/security-forms";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import {
	FINDING_CATEGORIES,
	FINDING_SEVERITIES,
	FINDING_STATUS,
	type FindingSeverity,
} from "@/db/schema/enums";
import { requireOrgPage } from "@/lib/auth/gates";
import { toOrgCtx } from "@/lib/auth/guards";
import { allows } from "@/lib/auth/permissions";
import { fmtDate } from "@/lib/compliance/page-data";
import { listEngagements } from "@/lib/compliance/queries-engagements";
import { listProductOptions } from "@/lib/compliance/queries-products";
import {
	findingStats,
	listFindings,
	listScans,
} from "@/lib/compliance/queries-security";
import { readOrg } from "@/lib/db/with-org";
import { ENGAGEMENT_STATUS_MACHINE } from "@/lib/entities/engagement";
import {
	FINDING_STATUS_MACHINE,
	SEVERITY_TONE,
} from "@/lib/entities/security-finding";
import { SCAN_TOOL_LABEL } from "@/lib/security/parsers";
import { QUICK_CHECKS_PER_DAY } from "@/lib/security/quick-check-service";
import { cn } from "@/lib/utils";

const TABS = [
	"uebersicht",
	"befunde",
	"scans",
	"schnellcheck",
	"auftraege",
] as const;
type Tab = (typeof TABS)[number];
type Search = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

// Security-Checks: Befunde aus Scan-Import, CI-Ingest und passivem
// Schnellcheck — mit SLA, Eskalation und Wirkung auf die Prüfungsreife.
export default async function SecurityPage({
	searchParams,
}: {
	searchParams: Promise<Search>;
}) {
	const ctx = await requireOrgPage({ security: ["read"] });
	const sp = await searchParams;
	const t = await getTranslations("Security");
	const te = await getTranslations("Entity");
	const ts = await getTranslations("Status");
	const tab: Tab = (TABS as readonly string[]).includes(one(sp.tab) ?? "")
		? (one(sp.tab) as Tab)
		: "uebersicht";
	const canCreate = allows(ctx, { security: ["create"] });
	const { findings, scans, products, engagements } = await readOrg(
		toOrgCtx(ctx),
		async (tx) => ({
			findings: await listFindings(tx, ctx.orgId),
			scans: await listScans(tx, ctx.orgId),
			products: await listProductOptions(tx, ctx.orgId),
			engagements: await listEngagements(tx, ctx.orgId),
		}),
	);
	const tg = await getTranslations("Engagements");
	const now = new Date();
	const stats = findingStats(findings, now);
	const quickToday = scans.filter(
		(s) =>
			s.tool === "quick_check" &&
			now.getTime() - s.startedAt.getTime() < 86_400_000,
	).length;
	const running = scans.some((s) => s.status === "running" && !s.stale);

	const severityBadge = (s: FindingSeverity) => (
		<Badge variant={SEVERITY_TONE[s]}>{t(`sev_${s}`)}</Badge>
	);

	const q = one(sp.q)?.toLowerCase();
	const sev = one(sp.severity);
	const status = one(sp.status);
	const cat = one(sp.category);
	const overdue = one(sp.overdue) === "1";
	const openOnly = one(sp.open) === "1";
	const filtered = findings
		.filter(
			(f) =>
				!q ||
				`${f.title} ${f.location ?? ""} ${f.cve ?? ""} ${f.packageName ?? ""}`
					.toLowerCase()
					.includes(q),
		)
		.filter((f) => !sev || f.severity === sev)
		.filter((f) => !status || f.status === status)
		.filter((f) => !cat || f.category === cat)
		.filter(
			(f) => !openOnly || f.status === "open" || f.status === "in_progress",
		)
		.filter(
			(f) =>
				!overdue ||
				((f.status === "open" || f.status === "in_progress") &&
					f.dueAt !== null &&
					f.dueAt < now),
		);

	return (
		<>
			<PageHeader
				title={t("title")}
				lead={t("lead")}
				actions={
					<div className="flex flex-wrap gap-2">
						{allows(ctx, { export: ["create"] }) && (
							<a
								href="/api/export/sicherheitsbericht.md"
								className={buttonVariants({ variant: "outline", size: "sm" })}
							>
								{t("report")}
							</a>
						)}
						{canCreate && <ScanImportDialog products={products} />}
					</div>
				}
			/>
			<RefreshWhileRunning running={running} />
			<UrlTabs
				base="/sicherheit"
				active={tab}
				tabs={TABS.map((x) => ({
					value: x,
					label: t(`tab_${x}`),
					count:
						x === "befunde"
							? stats.open
							: x === "scans"
								? scans.length
								: x === "auftraege"
									? engagements.length
									: undefined,
				}))}
			/>

			{tab === "uebersicht" &&
				(findings.length === 0 && scans.length === 0 ? (
					<EmptyState
						title={t("emptyTitle")}
						lead={t("emptyLead")}
						actions={
							<>
								<Link
									href="/sicherheit?tab=schnellcheck"
									scroll={false}
									className={buttonVariants({ size: "sm" })}
								>
									{t("tab_schnellcheck")}
								</Link>
								<Link
									href="/einstellungen?tab=integrationen"
									className={buttonVariants({ variant: "outline", size: "sm" })}
								>
									{t("toIntegrations")}
								</Link>
							</>
						}
					/>
				) : (
					<div className="flex flex-col gap-6">
						<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
							<div className="flex flex-col gap-1 rounded-2xl bg-card p-4">
								<span className="font-medium text-footnote text-muted-foreground">
									{t("light")}
								</span>
								<span className="flex items-center gap-2">
									<span
										aria-hidden
										className={cn(
											"size-3 rounded-full",
											stats.light === "red"
												? "bg-destructive"
												: stats.light === "yellow"
													? "bg-warning"
													: "bg-success",
										)}
									/>
									<span className="font-medium">
										{t(`light_${stats.light}`)}
									</span>
								</span>
							</div>
							{(
								[
									["open", stats.open, "/sicherheit?tab=befunde&open=1"],
									[
										"overdue",
										stats.overdue,
										"/sicherheit?tab=befunde&overdue=1",
									],
									[
										"secrets",
										stats.secrets,
										"/sicherheit?tab=befunde&category=secret&open=1",
									],
								] as const
							).map(([k, n, href]) => (
								<Link
									key={k}
									href={href}
									className="flex flex-col gap-1 rounded-2xl bg-card p-4 hover:bg-muted"
								>
									<span className="font-medium text-footnote text-muted-foreground">
										{t(`stat_${k}`)}
									</span>
									<span
										className={cn(
											"font-bold text-title-1 tabular-nums",
											n > 0 && k !== "open"
												? "text-destructive"
												: "text-primary",
										)}
									>
										{n}
									</span>
								</Link>
							))}
						</div>
						<div className="flex flex-wrap gap-2">
							{FINDING_SEVERITIES.map((s) => (
								<Link
									key={s}
									href={`/sicherheit?tab=befunde&open=1&severity=${s}`}
									scroll={false}
									className="flex items-center gap-2 rounded-xl bg-card px-3 py-1.5 text-subhead hover:bg-muted"
								>
									{severityBadge(s)}
									<span className="tabular-nums">{stats.bySeverity[s]}</span>
								</Link>
							))}
						</div>
						<section>
							<h2 className="mb-2 font-medium">{t("topFindings")}</h2>
							<ul className="flex flex-col divide-y divide-border/60 overflow-hidden rounded-2xl bg-card text-subhead">
								{findings
									.filter(
										(f) => f.status === "open" || f.status === "in_progress",
									)
									.slice(0, 5)
									.map((f) => (
										<li
											key={f.id}
											className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
										>
											<Link
												href={`/sicherheit/befunde/${f.id}`}
												className="min-w-0 truncate hover:underline"
											>
												{f.title}
											</Link>
											<span className="flex items-center gap-2 text-footnote">
												{severityBadge(f.severity)}
												{f.dueAt && (
													<span
														className={cn(f.dueAt < now && "text-destructive")}
													>
														{t("dueAt", { date: fmtDate.format(f.dueAt) })}
													</span>
												)}
											</span>
										</li>
									))}
								{stats.open === 0 && (
									<li className="px-3 py-2 text-muted-foreground">
										{t("noOpen")}
									</li>
								)}
							</ul>
						</section>
					</div>
				))}

			{tab === "befunde" && (
				<>
					<div className="mb-4">
						<RegisterFilters
							filters={[
								{
									key: "severity",
									label: t("severity"),
									options: FINDING_SEVERITIES.map((s) => ({
										value: s,
										label: t(`sev_${s}`),
									})),
								},
								{
									key: "status",
									label: te("status"),
									options: FINDING_STATUS.map((s) => ({
										value: s,
										label: ts(FINDING_STATUS_MACHINE.labelKey[s] as "sfOpen"),
									})),
								},
								{
									key: "category",
									label: t("category"),
									options: FINDING_CATEGORIES.map((c) => ({
										value: c,
										label: t(`cat_${c}`),
									})),
								},
							]}
							chips={[
								{ key: "open", label: t("chipOpen") },
								{ key: "overdue", label: te("chipOverdue") },
							]}
							searchPlaceholder={t("search")}
						/>
					</div>
					{filtered.length === 0 ? (
						<p className="text-muted-foreground text-subhead">
							{findings.length === 0 ? t("noFindings") : te("noMatches")}
						</p>
					) : (
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>{t("finding")}</TableHead>
									<TableHead className="w-24">{t("severity")}</TableHead>
									<TableHead className="hidden w-32 md:table-cell">
										{t("category")}
									</TableHead>
									<TableHead className="w-32">{te("status")}</TableHead>
									<TableHead className="hidden w-28 md:table-cell">
										{t("due")}
									</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{filtered.slice(0, 500).map((f) => (
									<TableRow key={f.id}>
										<TableCell className="max-w-0">
											<Link
												href={`/sicherheit/befunde/${f.id}`}
												className="block truncate font-medium hover:underline"
											>
												{f.title}
											</Link>
											<span className="block truncate text-muted-foreground text-footnote">
												{[f.location, f.productCode, SCAN_TOOL_LABEL[f.tool]]
													.filter(Boolean)
													.join(" · ")}
											</span>
										</TableCell>
										<TableCell>{severityBadge(f.severity)}</TableCell>
										<TableCell className="hidden md:table-cell">
											{t(`cat_${f.category}`)}
										</TableCell>
										<TableCell>
											<StatusBadge
												machine={FINDING_STATUS_MACHINE}
												status={f.status}
												label={ts(
													FINDING_STATUS_MACHINE.labelKey[f.status] as "sfOpen",
												)}
											/>
										</TableCell>
										<TableCell
											className={cn(
												"hidden tabular-nums md:table-cell",
												f.dueAt &&
													f.dueAt < now &&
													(f.status === "open" || f.status === "in_progress") &&
													"text-destructive",
											)}
										>
											{f.dueAt ? fmtDate.format(f.dueAt) : "—"}
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					)}
				</>
			)}

			{tab === "scans" && (
				<>
					<p className="mb-4 max-w-2xl text-muted-foreground text-subhead">
						{t("scansLead")}
					</p>
					{scans.length === 0 ? (
						<p className="text-muted-foreground text-subhead">{t("noScans")}</p>
					) : (
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>{t("scan")}</TableHead>
									<TableHead className="w-28">{t("source")}</TableHead>
									<TableHead className="w-48">{t("result")}</TableHead>
									<TableHead className="w-32">{t("when")}</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{scans.map((s) => (
									<TableRow key={s.id}>
										<TableCell className="max-w-0">
											<span className="block truncate font-medium">
												{s.toolName ?? SCAN_TOOL_LABEL[s.tool]}
											</span>
											<span className="block truncate text-muted-foreground text-footnote">
												{[
													s.target,
													s.productCode,
													s.fullScan ? t("fullScanShort") : null,
												]
													.filter(Boolean)
													.join(" · ")}
											</span>
										</TableCell>
										<TableCell>{t(`source_${s.source}`)}</TableCell>
										<TableCell className="text-footnote">
											{s.status === "running" && !s.stale ? (
												<Badge variant="outline">{t("running")}</Badge>
											) : s.status === "failed" || s.stale ? (
												<Badge variant="destructive">
													{t("failed")}
													{s.error
														? ` (${t(`err_${s.error}` as "err_internal")})`
														: ""}
												</Badge>
											) : s.counts ? (
												<span className="tabular-nums">
													{t("countsShort", {
														critical: s.counts.critical,
														high: s.counts.high,
														created: s.counts.new,
														resolved: s.counts.resolved,
													})}
												</span>
											) : (
												"—"
											)}
										</TableCell>
										<TableCell className="text-footnote tabular-nums">
											{fmtDate.format(s.startedAt)}
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					)}
				</>
			)}

			{tab === "schnellcheck" && (
				<div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_20rem]">
					<section className="flex flex-col gap-4">
						<p className="max-w-xl text-subhead">{t("quickLead")}</p>
						{canCreate ? (
							<QuickCheckForm
								products={products}
								remaining={Math.max(0, QUICK_CHECKS_PER_DAY - quickToday)}
							/>
						) : (
							<p className="text-muted-foreground text-subhead">
								{te("viewer")}
							</p>
						)}
						<ul className="flex flex-col divide-y divide-border/60 overflow-hidden rounded-2xl bg-card text-subhead">
							{scans
								.filter((s) => s.tool === "quick_check")
								.slice(0, 10)
								.map((s) => (
									<li
										key={s.id}
										className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
									>
										<span className="min-w-0 truncate">{s.target}</span>
										<span className="text-footnote">
											{s.status === "running" && !s.stale
												? t("running")
												: s.status === "failed" || s.stale
													? `${t("failed")}${s.error ? ` (${t(`err_${s.error}` as "err_internal")})` : ""}`
													: s.counts
														? t("countsShort", {
																critical: s.counts.critical,
																high: s.counts.high,
																created: s.counts.new,
																resolved: s.counts.resolved,
															})
														: "—"}
										</span>
									</li>
								))}
						</ul>
					</section>
					<aside className="flex flex-col gap-3 rounded-2xl bg-card p-4 text-subhead">
						<h2 className="font-medium">{t("quickWhatTitle")}</h2>
						<ul className="list-disc pl-5 text-muted-foreground">
							{(
								[
									"headers",
									"cookies",
									"tls",
									"dns",
									"securitytxt",
									"bundles",
									"sourcemaps",
								] as const
							).map((k) => (
								<li key={k}>{t(`quickWhat_${k}`)}</li>
							))}
						</ul>
						<h2 className="font-medium">{t("quickNotTitle")}</h2>
						<p className="text-muted-foreground">{t("quickNot")}</p>
					</aside>
				</div>
			)}
			{tab === "auftraege" && (
				<section className="flex flex-col gap-4">
					<div className="flex flex-wrap items-start justify-between gap-3">
						<p className="max-w-2xl text-subhead">{tg("lead")}</p>
						{canCreate && <NewEngagementDialog products={products} />}
					</div>
					{engagements.length === 0 ? (
						<EmptyState title={tg("empty")} lead={tg("emptyLead")} />
					) : (
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>{tg("engagement")}</TableHead>
									<TableHead className="w-36">{tg("kind")}</TableHead>
									<TableHead className="w-40">{tg("period")}</TableHead>
									<TableHead className="w-40">{tg("findings")}</TableHead>
									<TableHead className="w-32">{tg("status")}</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{engagements.map((e) => (
									<TableRow key={e.id}>
										<TableCell>
											<Link
												href={`/sicherheit/auftraege/${e.id}`}
												className="font-medium hover:underline"
											>
												<span
													className="font-mono text-footnote"
													translate="no"
												>
													{e.code}
												</span>{" "}
												{e.title}
											</Link>
											{e.productCode && (
												<span className="block text-muted-foreground text-footnote">
													{e.productCode} {e.productName}
												</span>
											)}
										</TableCell>
										<TableCell className="text-subhead">
											{tg(`kind_${e.kind}`)}
										</TableCell>
										<TableCell className="text-subhead">
											{e.startAt
												? `${fmtDate.format(new Date(e.startAt))} – ${e.endAt ? fmtDate.format(new Date(e.endAt)) : "…"}`
												: "—"}
										</TableCell>
										<TableCell className="text-subhead">
											{tg("findingsShort", {
												total: e.findings.total,
												open: e.findings.open,
											})}
											{e.findings.critical + e.findings.high > 0 && (
												<Badge variant="destructive" className="ml-2">
													{tg("criticalHigh", {
														n: e.findings.critical + e.findings.high,
													})}
												</Badge>
											)}
										</TableCell>
										<TableCell>
											<StatusBadge
												machine={ENGAGEMENT_STATUS_MACHINE}
												status={e.status}
												label={ts(
													ENGAGEMENT_STATUS_MACHINE.labelKey[
														e.status
													] as "egPlanned",
												)}
											/>
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
