import Link from "next/link";
import { getTranslations } from "next-intl/server";
import {
	AuditForm,
	FindingStatusSelect,
	FindingToNcButton,
	ProgrammeForm,
	ProgrammeItemForm,
	RemoveItemButton,
} from "@/components/audits/audit-forms";
import { EmptyState } from "@/components/entity/empty-state";
import { UrlTabs } from "@/components/entity/url-tabs";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { DOMAINS } from "@/db/schema/enums";
import { requireOrg, toOrgCtx } from "@/lib/auth/guards";
import { roleAllows } from "@/lib/auth/permissions";
import { programmeCoverage } from "@/lib/compliance/audit-programme";
import { fmtDate, shortFrameworkName } from "@/lib/compliance/page-data";
import { listMembersForPicker } from "@/lib/compliance/queries";
import { listProviders } from "@/lib/compliance/queries-p2";
import {
	listAllFindings,
	listAuditProgrammes,
	listAudits,
	listProcesses,
} from "@/lib/compliance/queries-p3";
import { readOrg } from "@/lib/db/with-org";
import { listOrgFrameworks } from "@/lib/org/queries";

type Search = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

const SEV_TONE = {
	observation: "muted",
	minor: "outline",
	major: "warning",
	critical: "destructive",
} as const;
const STATUS_TONE = {
	planned: "outline",
	in_progress: "warning",
	reported: "default",
	closed: "muted",
} as const;

export default async function AuditsPage({
	searchParams,
}: {
	searchParams: Promise<Search>;
}) {
	const ctx = await requireOrg({ audit: ["read"] });
	const sp = await searchParams;
	const tab = one(sp.tab) ?? "audits";
	const t = await getTranslations("Audits");
	const canEdit = roleAllows(ctx.orgRole, { audit: ["create"] });
	const canFinding = roleAllows(ctx.orgRole, { audit_finding: ["update"] });
	const canNc = roleAllows(ctx.orgRole, { nonconformity: ["create"] });

	const data = await readOrg(toOrgCtx(ctx), async (tx) => ({
		audits: await listAudits(tx, ctx.orgId),
		programmes: await listAuditProgrammes(tx, ctx.orgId),
		members: await listMembersForPicker(tx, ctx.orgId),
		frameworks: await listOrgFrameworks(tx, ctx.orgId),
		processes: tab === "programm" ? await listProcesses(tx, ctx.orgId) : [],
		providers: tab === "programm" ? await listProviders(tx, ctx.orgId) : [],
		findings: tab === "findings" ? await listAllFindings(tx, ctx.orgId) : [],
	}));
	const expected = {
		domains: [...DOMAINS],
		processes: data.processes
			.filter((p) => p.criticality !== "standard" && p.status !== "retired")
			.map((p) => ({ code: p.code, name: p.name })),
		providers: data.providers
			.filter((p) => p.isMaterial || p.criticality === "critical")
			.map((p) => ({ id: p.id, name: p.name })),
	};
	const openFindings = data.findings.filter(
		(f) => f.status !== "closed",
	).length;

	return (
		<>
			<PageHeader
				title={t("title")}
				lead={t("lead")}
				actions={
					canEdit ? (
						<div className="flex flex-wrap gap-2">
							{tab === "programm" ? (
								<ProgrammeForm />
							) : (
								<AuditForm
									members={data.members}
									frameworks={data.frameworks}
									programmes={data.programmes.map((p) => ({
										id: p.id,
										title: p.title,
									}))}
								/>
							)}
						</div>
					) : undefined
				}
			/>
			<UrlTabs
				base="/audits"
				active={tab}
				tabs={[
					{ value: "programm", label: t("tabProgramme") },
					{ value: "audits", label: t("tabAudits"), count: data.audits.length },
					{
						value: "findings",
						label: t("tabFindings"),
						count: openFindings || undefined,
					},
				]}
			/>

			{tab === "programm" && (
				<section className="flex flex-col gap-6">
					<p className="text-muted-foreground text-sm">{t("programmeLead")}</p>
					{data.programmes.length === 0 ? (
						<EmptyState
							title={t("programmeEmpty")}
							lead={t("programmeEmptyLead")}
							requiredBy={t("requiredBy")}
							actions={canEdit ? <ProgrammeForm /> : undefined}
						/>
					) : (
						data.programmes.map((p) => {
							const cov = programmeCoverage(p, p.items, expected);
							const years = Array.from(
								{ length: p.cycleYears },
								(_, i) => cov.cycleStartYear + i,
							);
							const options = [
								...expected.domains.map((d) => ({
									type: "domain",
									ref: d,
									label: d,
								})),
								...data.processes.map((x) => ({
									type: "process",
									ref: x.code,
									label: `${x.code} ${x.name}`,
								})),
								...data.providers.map((x) => ({
									type: "provider",
									ref: x.id,
									label: x.name,
								})),
								...data.frameworks.map((f) => ({
									type: "framework",
									ref: f.slug,
									label: f.name,
								})),
							];
							return (
								<article
									key={p.id}
									className="flex flex-col gap-4 rounded-md border p-4 text-sm"
								>
									<div className="flex flex-wrap items-center gap-3">
										<h2 className="font-serif-display text-xl text-primary">
											{p.title}
										</h2>
										<span className="text-muted-foreground text-xs">
											{cov.cycleStartYear}–{cov.cycleEndYear} ·{" "}
											{t("cycleYearsShort", { n: p.cycleYears })}
										</span>
										<Badge
											variant={cov.gaps.length === 0 ? "success" : "warning"}
										>
											{t("coverage", {
												covered: cov.covered,
												total: cov.total,
											})}
										</Badge>
										{canEdit && (
											<div className="ml-auto flex items-center gap-2">
												<ProgrammeItemForm
													programmeId={p.id}
													options={options}
													years={years}
												/>
												<ProgrammeForm
													initial={{
														id: p.id,
														title: p.title,
														cycleStart: p.cycleStart,
														cycleYears: p.cycleYears,
													}}
												/>
											</div>
										)}
									</div>
									{cov.gaps.length > 0 && (
										<div className="rounded-md border border-warning/40 bg-warning/5 p-3 text-xs">
											<p className="font-medium">{t("gapsTitle")}</p>
											<p className="mt-1 text-muted-foreground">
												{cov.gaps.map((g) => g.label).join(" · ")}
											</p>
										</div>
									)}
									<div className="grid gap-3 md:grid-cols-3">
										{years.map((y) => (
											<div key={y} className="rounded-md border p-3">
												<p className="lv-eyebrow mb-2 text-[0.52rem] text-muted-foreground">
													{y}
												</p>
												<ul className="flex flex-col gap-1">
													{p.items
														.filter((i) => i.plannedYear === y)
														.map((i) => (
															<li
																key={i.id}
																className="flex items-center gap-2 text-xs"
															>
																<Badge
																	variant="outline"
																	className="normal-case tracking-normal"
																>
																	{t(`scope_${i.scopeType}`)}
																</Badge>
																<span className="min-w-0 flex-1 truncate">
																	{options.find(
																		(o) =>
																			o.type === i.scopeType &&
																			o.ref === i.scopeRef,
																	)?.label ?? i.scopeRef}
																</span>
																<span className="text-muted-foreground">
																	{t(`rating_${i.riskRating}`)}
																</span>
																{i.auditId && (
																	<Link
																		href={`/audits/${i.auditId}`}
																		className="text-primary hover:underline"
																	>
																		{t("linkedAudit")}
																	</Link>
																)}
																{canEdit && <RemoveItemButton id={i.id} />}
															</li>
														))}
													{p.items.filter((i) => i.plannedYear === y).length ===
														0 && (
														<li className="text-muted-foreground text-xs">—</li>
													)}
												</ul>
											</div>
										))}
									</div>
								</article>
							);
						})
					)}
				</section>
			)}

			{tab === "audits" &&
				(data.audits.length === 0 ? (
					<EmptyState
						title={t("empty")}
						lead={t("emptyLead")}
						requiredBy={t("requiredBy")}
						actions={
							canEdit ? (
								<AuditForm
									members={data.members}
									frameworks={data.frameworks}
									programmes={[]}
								/>
							) : undefined
						}
					/>
				) : (
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>{t("titleField")}</TableHead>
								<TableHead className="w-28">{t("type")}</TableHead>
								<TableHead className="w-40">{t("frameworks")}</TableHead>
								<TableHead className="w-40">{t("auditors")}</TableHead>
								<TableHead className="w-28">{t("plannedAt")}</TableHead>
								<TableHead className="w-28">{t("status")}</TableHead>
								<TableHead className="w-32 text-right">
									{t("progress")}
								</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{data.audits.map((a) => (
								<TableRow key={a.id}>
									<TableCell>
										<Link
											href={`/audits/${a.id}`}
											className="font-medium hover:underline underline-offset-4"
										>
											{a.title}
										</Link>
										{a.periodStart && (
											<p className="text-muted-foreground text-xs">
												{fmtDate.format(new Date(a.periodStart))}
												{a.periodEnd
													? ` – ${fmtDate.format(new Date(a.periodEnd))}`
													: ""}
											</p>
										)}
									</TableCell>
									<TableCell className="text-xs">
										{t(`type_${a.type}`)}
									</TableCell>
									<TableCell>
										<span className="flex flex-wrap gap-1">
											{a.frameworkIds.map((f) => (
												<Badge
													key={f}
													variant="muted"
													className="normal-case tracking-normal"
												>
													{shortFrameworkName(f)}
												</Badge>
											))}
										</span>
									</TableCell>
									<TableCell className="text-xs">
										{a.auditorNames.join(", ") || "—"}
									</TableCell>
									<TableCell>
										{a.plannedAt ? fmtDate.format(new Date(a.plannedAt)) : "—"}
									</TableCell>
									<TableCell>
										<Badge variant={STATUS_TONE[a.status]}>
											{t(`status_${a.status}`)}
										</Badge>
									</TableCell>
									<TableCell className="text-right text-muted-foreground text-xs">
										{a.requestsTotal - a.requestsOpen}/{a.requestsTotal}{" "}
										{t("requestsShort")} · {a.findingsOpen}{" "}
										{t("findingsOpenShort")}
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				))}

			{tab === "findings" &&
				(data.findings.length === 0 ? (
					<p className="text-sm">{t("findingsEmpty")}</p>
				) : (
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead className="w-28">{t("severity")}</TableHead>
								<TableHead>{t("titleField")}</TableHead>
								<TableHead className="w-40">{t("audit")}</TableHead>
								<TableHead className="w-28">Control</TableHead>
								<TableHead className="w-40">{t("status")}</TableHead>
								<TableHead className="w-48 text-right">
									{t("nonconformity")}
								</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{data.findings.map((f) => (
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
									</TableCell>
									<TableCell className="text-xs">
										<Link
											href={`/audits/${f.auditId}?tab=findings`}
											className="hover:underline"
										>
											{f.auditTitle}
										</Link>
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
											disabled={!canFinding}
										/>
									</TableCell>
									<TableCell className="text-right">
										{f.nonconformityId ? (
											<Link
												href={`/abweichungen/${f.nonconformityId}`}
												className="font-mono text-xs hover:underline"
											>
												{f.ncCode}
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
				))}
		</>
	);
}
