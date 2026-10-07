import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import {
	AuditForm,
	AuditRequestForm,
	AuditStatusSelect,
	DecideRequestButtons,
	FindingForm,
	FindingStatusSelect,
	FindingToNcButton,
	RespondRequestForm,
} from "@/components/audits/audit-forms";
import { UrlTabs } from "@/components/entity/url-tabs";
import { UserChip } from "@/components/entity/user-chip";
import { PageHeader } from "@/components/page-header";
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
import { requireOrg, toOrgCtx } from "@/lib/auth/guards";
import { roleAllows } from "@/lib/auth/permissions";
import { independenceIssues } from "@/lib/compliance/audit-programme";
import {
	CONTROL_BY_CODE,
	CONTROLS,
	EDGES_BY_REQUIREMENT,
	FRAMEWORK_BY_SLUG,
} from "@/lib/compliance/catalog";
import type { ReqCoverage } from "@/lib/compliance/coverage";
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
} from "@/lib/compliance/queries-p3";
import { readOrg } from "@/lib/db/with-org";
import { listOrgFrameworks } from "@/lib/org/queries";
import { cn } from "@/lib/utils";

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
export default async function AuditCockpitPage({
	params,
	searchParams,
}: {
	params: Promise<{ id: string }>;
	searchParams: Promise<Search>;
}) {
	const { id } = await params;
	if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
	const sp = await searchParams;
	const tab = one(sp.tab) ?? "pruefpfad";
	const ctx = await requireOrg({ audit: ["read"] });
	const t = await getTranslations("Audits");
	const ts = await getTranslations("Status");
	const canEdit = roleAllows(ctx.orgRole, { audit: ["update"] });
	const canRequest = roleAllows(ctx.orgRole, { audit_request: ["create"] });
	const canRespond = roleAllows(ctx.orgRole, { audit_request: ["respond"] });
	const canDecide = roleAllows(ctx.orgRole, { audit_request: ["decide"] });
	const canFinding = roleAllows(ctx.orgRole, { audit_finding: ["create"] });
	const canNc = roleAllows(ctx.orgRole, { nonconformity: ["create"] });
	const canExport = roleAllows(ctx.orgRole, { export: ["create"] });

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
		] = await Promise.all([
			listMembersForPicker(tx, ctx.orgId),
			listOrgFrameworks(tx, ctx.orgId),
			listAuditProgrammes(tx, ctx.orgId),
			listControlRows(tx, ctx.orgId),
			listEvidenceWithControls(tx, ctx.orgId),
			listEvidence(tx, ctx.orgId),
			listProcesses(tx, ctx.orgId),
		]);
		return {
			...a,
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
	const {
		audit,
		findings,
		requests,
		names,
		members,
		frameworks,
		controls,
		evidenceLinks,
		evidence,
	} = data;

	const evidenceCount = new Map<string, number>();
	for (const e of evidenceLinks)
		for (const code of e.controlCodes)
			evidenceCount.set(code, (evidenceCount.get(code) ?? 0) + 1);
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
	const answered = requests.filter((r) => r.status !== "open").length;
	const periodLabel =
		audit.periodStart || audit.periodEnd
			? `${audit.periodStart ? fmtDate.format(new Date(audit.periodStart)) : "…"} – ${audit.periodEnd ? fmtDate.format(new Date(audit.periodEnd)) : "…"}`
			: null;

	return (
		<>
			<PageHeader
				eyebrow={`${t(`type_${audit.type}`)}${periodLabel ? ` · ${periodLabel}` : ""}`}
				title={audit.title}
				lead={audit.scope ?? undefined}
				actions={
					<div className="flex flex-wrap items-center gap-2">
						{canExport && (
							<a
								href={`/api/export/pruefungspaket.zip?audit=${audit.id}`}
								className={cn(
									buttonVariants({ variant: "outline", size: "sm" }),
								)}
								title={t("exportPackageHint")}
							>
								{t("exportPackage")}
							</a>
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
									ownerUserId: audit.ownerUserId,
								}}
							/>
						)}
					</div>
				}
			/>
			<dl className="mb-6 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
				<div>
					<dt className="lv-eyebrow text-[0.52rem] text-muted-foreground">
						{t("frameworks")}
					</dt>
					<dd className="flex flex-wrap gap-1">
						{slugs.length === 0
							? "—"
							: slugs.map((s) => (
									<Badge
										key={s}
										variant="muted"
										className="normal-case tracking-normal"
									>
										{shortFrameworkName(s)}
									</Badge>
								))}
					</dd>
				</div>
				<div>
					<dt className="lv-eyebrow text-[0.52rem] text-muted-foreground">
						{t("auditors")}
					</dt>
					<dd className="flex flex-wrap gap-2">
						{audit.auditorMemberIds.map((u) => (
							<UserChip key={u} name={names.get(u)} />
						))}
						{audit.externalAuditor && <span>{audit.externalAuditor}</span>}
						{audit.auditorMemberIds.length === 0 &&
							!audit.externalAuditor &&
							"—"}
					</dd>
				</div>
				<div>
					<dt className="lv-eyebrow text-[0.52rem] text-muted-foreground">
						{t("owner")}
					</dt>
					<dd>
						<UserChip name={names.get(audit.ownerUserId ?? "")} />
					</dd>
				</div>
				<div>
					<dt className="lv-eyebrow text-[0.52rem] text-muted-foreground">
						{t("requests")}
					</dt>
					<dd className="font-serif-display text-xl text-primary">
						{answered}/{requests.length}
					</dd>
				</div>
			</dl>
			{independence.length > 0 && (
				<div className="mb-6 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
					<p className="font-medium">{t("independenceTitle")}</p>
					<ul className="mt-1 list-disc pl-5 text-xs">
						{independence.map((i) => (
							<li key={`${i.auditorUserId}-${i.kind}-${i.ref}`}>
								{names.get(i.auditorUserId) ?? i.auditorUserId}:{" "}
								{t(`indep_${i.kind}`)} {i.ref}
							</li>
						))}
					</ul>
				</div>
			)}
			<UrlTabs
				base={`/audits/${audit.id}`}
				active={tab}
				tabs={[
					{ value: "pruefpfad", label: t("tabPath"), count: path.length },
					{
						value: "anfragen",
						label: t("tabRequests"),
						count: requests.length - answered || undefined,
					},
					{
						value: "findings",
						label: t("tabFindings"),
						count:
							findings.filter((f) => f.status !== "closed").length || undefined,
					},
				]}
			/>

			{tab === "pruefpfad" && (
				<section className="flex flex-col gap-3">
					<p className="text-muted-foreground text-sm">{t("pathLead")}</p>
					{path.length === 0 ? (
						<p className="text-sm">{t("pathEmpty")}</p>
					) : (
						<div className="overflow-x-auto rounded-md border">
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
									{path.map(({ slug, r, status, edges }) => (
										<TableRow key={`${slug}:${r.code}`}>
											<TableCell className="align-top">
												<Link
													href={`/rahmenwerke/${slug}/${encodeURIComponent(r.code)}`}
													className="font-mono text-xs hover:underline"
												>
													{shortFrameworkName(slug)} {r.code}
												</Link>
											</TableCell>
											<TableCell className="align-top text-xs">
												{r.title}
											</TableCell>
											<TableCell className="align-top">
												<Badge variant={TONE[status]}>{status}</Badge>
											</TableCell>
											<TableCell className="align-top">
												<ul className="flex flex-col gap-1 text-xs">
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
																<Link
																	href={`/controls/${e.control}#nachweise`}
																	className={
																		ev === 0
																			? "text-destructive"
																			: "text-muted-foreground"
																	}
																>
																	{ev} {t("evidenceShort")}
																</Link>
															</li>
														);
													})}
													{edges.length === 0 && (
														<li className="text-muted-foreground">—</li>
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
						<p className="text-muted-foreground text-sm">{t("requestsLead")}</p>
						{canRequest && (
							<AuditRequestForm
								auditId={audit.id}
								members={members}
								controlOptions={CONTROLS.map((c) => ({
									code: c.code,
									title: c.title,
								}))}
							/>
						)}
					</div>
					{requests.length === 0 ? (
						<p className="text-sm">{t("requestsEmpty")}</p>
					) : (
						<ul className="flex flex-col gap-3">
							{requests.map((r) => (
								<li
									key={r.id}
									className="flex flex-col gap-2 rounded-md border p-3 text-sm"
								>
									<div className="flex flex-wrap items-center gap-2">
										<Badge variant={REQ_TONE[r.status]}>
											{t(`rstatus_${r.status}`)}
										</Badge>
										<span className="font-medium">{r.title}</span>
										{r.controlCode && (
											<Link
												href={`/controls/${r.controlCode}`}
												className="font-mono text-xs hover:underline"
											>
												{r.controlCode}
											</Link>
										)}
										<span className="ml-auto text-muted-foreground text-xs">
											{t("requestedBy")}{" "}
											{names.get(r.requestedByUserId ?? "") ?? "—"} ·{" "}
											{t("assignee")}:{" "}
											{names.get(r.assigneeUserId ?? "") ?? "—"}
											{r.dueAt
												? ` · ${t("dueAt")} ${fmtDate.format(new Date(r.dueAt))}`
												: ""}
										</span>
									</div>
									{r.description && (
										<p className="text-muted-foreground text-xs">
											{r.description}
										</p>
									)}
									{r.responseNote && (
										<div className="rounded-md bg-muted/40 p-2 text-xs">
											<p className="lv-eyebrow mb-1 text-[0.5rem] text-muted-foreground">
												{t("response")}
											</p>
											<p className="whitespace-pre-wrap">{r.responseNote}</p>
											{r.responseEvidenceIds.length > 0 && (
												<p className="mt-1 flex flex-wrap gap-1">
													{r.responseEvidenceIds.map((eid) => {
														const ev = evidence.find((x) => x.id === eid);
														return (
															<a
																key={eid}
																href={`/api/nachweise/${eid}`}
																className="rounded-sm border px-1.5 py-0.5 hover:bg-muted"
															>
																{ev?.title ?? eid.slice(0, 8)}
															</a>
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
						<p className="text-muted-foreground text-sm">{t("findingsLead")}</p>
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
					{findings.length === 0 ? (
						<p className="text-sm">{t("findingsEmpty")}</p>
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
												<p className="text-muted-foreground text-xs">
													{f.description}
												</p>
											)}
											<p className="text-muted-foreground text-[0.65rem]">
												{names.get(f.createdByUserId ?? "") ?? "—"} ·{" "}
												{fmtDate.format(f.createdAt)}
												{f.requirementCode ? ` · ${f.requirementCode}` : ""}
											</p>
										</TableCell>
										<TableCell className="font-mono text-xs">
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
													!roleAllows(ctx.orgRole, {
														audit_finding: ["update"],
													})
												}
											/>
										</TableCell>
										<TableCell className="text-right">
											{f.nonconformityId ? (
												<Link
													href={`/abweichungen/${f.nonconformityId}`}
													className="font-mono text-xs hover:underline"
												>
													{f.ncCode} · {f.ncStatus}
												</Link>
											) : canNc ? (
												<FindingToNcButton findingId={f.id} />
											) : (
												"—"
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
