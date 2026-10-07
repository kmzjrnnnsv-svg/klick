import Link from "next/link";
import { getTranslations } from "next-intl/server";
import {
	ApplyJurisdictionSeedButton,
	CorridorTemplateButton,
	JurisdictionCsvImport,
	JurisdictionForm,
	MonitoringRuleForm,
	RiskAnalysisApproveButton,
	RiskAnalysisForm,
	SuspiciousReportForm,
	SuspiciousTransitionButtons,
} from "@/components/aml/aml-forms";
import { EmptyState } from "@/components/entity/empty-state";
import { UrlTabs } from "@/components/entity/url-tabs";
import { UserChip } from "@/components/entity/user-chip";
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
import type { ImplStatus } from "@/db/schema/enums";
import { requireOrg, toOrgCtx } from "@/lib/auth/guards";
import { listOrgMembers } from "@/lib/auth/org";
import { roleAllows } from "@/lib/auth/permissions";
import { aggregateSuspicious, type RiskDimensions } from "@/lib/compliance/aml";
import { CONTROL_BY_CODE } from "@/lib/compliance/catalog";
import {
	CORRIDOR_DOSSIER_QUESTIONS,
	CORRIDOR_STEPS,
} from "@/lib/compliance/catalog/corridor-template";
import { TEMPLATE_BY_CODE } from "@/lib/compliance/catalog/document-templates";
import { upcomingLegalChanges } from "@/lib/compliance/catalog/regulatory-calendar";
import { fmtDate } from "@/lib/compliance/page-data";
import {
	getOrgProfile,
	listControlRows,
	listMembersForPicker,
} from "@/lib/compliance/queries";
import {
	listDocuments,
	listTrainingRequirements,
	listTrainings,
} from "@/lib/compliance/queries-p2";
import { listObligationRuns } from "@/lib/compliance/queries-p3";
import {
	listAmlRiskAnalyses,
	listCryptoAssets,
	listJurisdictions,
	listMonitoringRules,
	listSuspiciousReports,
} from "@/lib/compliance/queries-p4";
import { decryptMany, fieldAad } from "@/lib/crypto/org-dek";
import { readOrg } from "@/lib/db/with-org";

type Search = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const TABS = [
	"risikoanalyse",
	"sorgfalt",
	"monitoring",
	"verdacht",
	"laender",
	"travel-rule",
	"schulung",
] as const;
type Tab = (typeof TABS)[number];

const fmtTs = new Intl.DateTimeFormat("de-DE", {
	dateStyle: "medium",
	timeStyle: "short",
	timeZone: "Europe/Berlin",
});

const IMPL_KEY: Record<
	ImplStatus,
	"notStarted" | "planned" | "inProgress" | "implemented" | "notApplicable"
> = {
	not_started: "notStarted",
	planned: "planned",
	in_progress: "inProgress",
	implemented: "implemented",
	not_applicable: "notApplicable",
};
const IMPL_TONE: Record<
	ImplStatus,
	"muted" | "outline" | "warning" | "success"
> = {
	not_started: "muted",
	planned: "outline",
	in_progress: "warning",
	implemented: "success",
	not_applicable: "muted",
};
const DOC_KEY: Record<string, string> = {
	draft: "docDraft",
	in_review: "docInReview",
	approved: "docApproved",
	published: "docPublished",
	retired: "docRetired",
	superseded: "docSuperseded",
};

const DD_CONTROLS = ["CC-AML-04", "CC-AML-05", "CC-AML-09", "CC-AML-10"];
const DD_DOCS = [
	"VA-KYC",
	"RL-AML-HANDBUCH",
	"KZ-AML-RISIKOANALYSE",
	"RL-SANKTIONEN",
];
const TR_CONTROLS = ["CC-TR-01", "CC-TR-02", "CC-TR-03", "CC-SAN-01"];
const TR_DOCS = ["RL-TRAVEL-RULE"];
const MON_CONTROLS = ["CC-AML-06", "CC-SAN-01", "CC-FRD-01"];
const GWG_OBLIGATIONS = [
	"OBL-GWG-ANNUAL-REPORT",
	"OBL-GWG-RISK-ANALYSIS",
	"OBL-GWG-TRAINING",
	"OBL-SANCTIONS-LIST",
];

// /aml — Geldwäsche-Programm als Modul: Risikoanalyse, Kunden-Sorgfalt,
// Monitoring-Regelwerk, Verdachtsmeldungen/STOR, Länder & Korridore, Travel
// Rule, Schulung & Berichte. Die Fachsysteme (KYC, TM, Analytics, Travel
// Rule) laufen bei Dienstleistern; hier liegen Regelwerk, Register und Nachweise.
export default async function AmlPage({
	searchParams,
}: {
	searchParams: Promise<Search>;
}) {
	const ctx = await requireOrg({ aml: ["read"] });
	const sp = await searchParams;
	const tab: Tab = (TABS as readonly string[]).includes(one(sp.tab) ?? "")
		? (one(sp.tab) as Tab)
		: "risikoanalyse";
	const t = await getTranslations("Aml");
	const ts = await getTranslations("Status");
	const tf = await getTranslations("Functions");
	const now = new Date();
	const canEdit = roleAllows(ctx.orgRole, { aml: ["update"] });
	const detail = ctx.orgRole !== "auditor" || ctx.grants.includes("aml_detail");
	const memberCount = (await listOrgMembers(ctx.orgId)).length;

	const data = await readOrg(toOrgCtx(ctx), async (tx) => {
		const profile = await getOrgProfile(tx, ctx.orgId);
		const members = await listMembersForPicker(tx, ctx.orgId);
		const base = { profile, members };
		switch (tab) {
			case "risikoanalyse":
				return { ...base, analyses: await listAmlRiskAnalyses(tx, ctx.orgId) };
			case "sorgfalt":
			case "travel-rule":
			case "monitoring": {
				const controls = await listControlRows(tx, ctx.orgId);
				const documents = await listDocuments(tx, ctx.orgId);
				return {
					...base,
					controls,
					documents,
					rules:
						tab === "monitoring"
							? await listMonitoringRules(tx, ctx.orgId)
							: [],
					assets:
						tab === "travel-rule" ? await listCryptoAssets(tx, ctx.orgId) : [],
					jurisdictions:
						tab === "travel-rule" ? await listJurisdictions(tx, ctx.orgId) : [],
				};
			}
			case "verdacht": {
				const reports = detail
					? await listSuspiciousReports(tx, ctx.orgId)
					: [];
				const notes =
					detail && canEdit
						? await decryptMany<string>(
								tx,
								ctx.orgId,
								reports.map((r) => ({
									stored: r.decisionNote,
									aad: fieldAad("suspicious_reports", r.id, "decision_note"),
								})),
							)
						: reports.map(() => null);
				const all = detail
					? reports
					: await listSuspiciousReports(tx, ctx.orgId);
				return {
					...base,
					reports,
					notes,
					stats: aggregateSuspicious(all, now),
				};
			}
			case "laender":
				return {
					...base,
					jurisdictions: await listJurisdictions(tx, ctx.orgId),
				};
			case "schulung": {
				const from = new Date(now.getTime() - 30 * 86_400_000)
					.toISOString()
					.slice(0, 10);
				const to = new Date(now.getTime() + 365 * 86_400_000)
					.toISOString()
					.slice(0, 10);
				const runs = (
					await listObligationRuns(tx, ctx.orgId, { from, to })
				).filter((r) => GWG_OBLIGATIONS.includes(r.code));
				const reports = await listSuspiciousReports(tx, ctx.orgId);
				return {
					...base,
					runs,
					trainings: await listTrainings(tx, ctx.orgId),
					requirements: (await listTrainingRequirements(tx, ctx.orgId)).filter(
						(r) =>
							r.code.includes("GWG") ||
							r.code.includes("AML") ||
							r.code.includes("SANK") ||
							(r.legalBasis ?? "").includes("GwG"),
					),
					rules: await listMonitoringRules(tx, ctx.orgId),
					analyses: await listAmlRiskAnalyses(tx, ctx.orgId),
					stats: aggregateSuspicious(reports, now),
				};
			}
		}
	});
	const fws = data.profile?.frameworks ?? [];
	const legal = upcomingLegalChanges(now, 540, [
		"gwg",
		"amlr",
		"tfr",
		"sanctions",
	]);

	const ControlList = ({ codes }: { codes: string[] }) => {
		const rows = "controls" in data ? data.controls : [];
		return (
			<ul className="flex flex-col divide-y divide-border/60 rounded-md border text-sm">
				{codes.map((code) => {
					const row = rows.find((r) => r.code === code);
					const meta = CONTROL_BY_CODE.get(code);
					return (
						<li
							key={code}
							className="flex items-center justify-between gap-3 p-2.5"
						>
							<span>
								<Link
									href={`/controls/${code}`}
									className="font-mono text-xs hover:underline underline-offset-4"
								>
									{code}
								</Link>{" "}
								<span>{meta?.title}</span>
							</span>
							{row ? (
								<Badge variant={IMPL_TONE[row.status]}>
									{ts(IMPL_KEY[row.status])}
								</Badge>
							) : (
								<Badge variant="muted">{t("notInScope")}</Badge>
							)}
						</li>
					);
				})}
			</ul>
		);
	};
	const DocList = ({ codes }: { codes: string[] }) => {
		const docs = "documents" in data ? data.documents : [];
		return (
			<ul className="flex flex-col divide-y divide-border/60 rounded-md border text-sm">
				{codes.map((code) => {
					const tpl = TEMPLATE_BY_CODE.get(code);
					const doc = docs.find((d) => d.templateCode === code);
					return (
						<li
							key={code}
							className="flex items-center justify-between gap-3 p-2.5"
						>
							<span>
								{doc ? (
									<Link
										href={`/dokumente/${encodeURIComponent(doc.docNumber)}`}
										className="hover:underline underline-offset-4"
									>
										<span className="font-mono text-xs">{doc.docNumber}</span>{" "}
										{doc.title}
									</Link>
								) : (
									<span>{tpl?.title ?? code}</span>
								)}
							</span>
							{doc ? (
								<Badge
									variant={
										doc.status === "published" || doc.status === "approved"
											? "success"
											: "outline"
									}
								>
									{ts(DOC_KEY[doc.status] as "docDraft")}
								</Badge>
							) : (
								<Link
									href="/dokumente"
									className="text-primary text-xs hover:underline"
								>
									{t("docMissing")}
								</Link>
							)}
						</li>
					);
				})}
			</ul>
		);
	};

	return (
		<>
			<PageHeader
				title={t("title")}
				lead={t("lead")}
				actions={
					canEdit ? (
						tab === "risikoanalyse" ? (
							<RiskAnalysisForm members={data.members} />
						) : tab === "monitoring" ? (
							<MonitoringRuleForm members={data.members} />
						) : tab === "verdacht" && detail ? (
							<SuspiciousReportForm members={data.members} />
						) : tab === "laender" ? (
							<span className="flex flex-wrap gap-2">
								<ApplyJurisdictionSeedButton />
								<JurisdictionCsvImport />
								<JurisdictionForm />
							</span>
						) : undefined
					) : undefined
				}
			/>
			<UrlTabs
				base="/aml"
				active={tab}
				tabs={[
					{ value: "risikoanalyse", label: t("tabAnalysis") },
					{ value: "sorgfalt", label: t("tabDueDiligence") },
					{ value: "monitoring", label: t("tabMonitoring") },
					{ value: "verdacht", label: t("tabReports") },
					{ value: "laender", label: t("tabCountries") },
					{ value: "travel-rule", label: t("tabTravelRule") },
					{ value: "schulung", label: t("tabTraining") },
				]}
			/>

			{tab === "risikoanalyse" && "analyses" in data && (
				<section className="flex flex-col gap-3">
					<p className="text-muted-foreground text-sm">{t("analysisLead")}</p>
					{(() => {
						const valid = data.analyses.find((a) => a.status === "approved");
						return (
							<p className="text-sm">
								{valid ? (
									<>
										<Badge variant="success">{t("validAnalysis")}</Badge>{" "}
										{valid.version} · {t("reviewDue")}:{" "}
										{valid.nextReviewAt
											? fmtDate.format(
													new Date(`${valid.nextReviewAt}T00:00:00Z`),
												)
											: "—"}
									</>
								) : (
									<Badge variant="destructive">{t("noValidAnalysis")}</Badge>
								)}
							</p>
						);
					})()}
					{data.analyses.length === 0 ? (
						<EmptyState
							title={t("analysisEmpty")}
							lead={t("analysisEmptyLead")}
							requiredBy={t("requiredByAnalysis")}
							actions={
								canEdit ? (
									<RiskAnalysisForm members={data.members} />
								) : undefined
							}
						/>
					) : (
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead className="w-20">{t("version")}</TableHead>
									<TableHead className="w-28">{t("status")}</TableHead>
									<TableHead className="w-28">{t("overall")}</TableHead>
									<TableHead>{t("dimensions")}</TableHead>
									<TableHead className="w-36">{t("owner")}</TableHead>
									<TableHead className="w-40">{t("approvedAt")}</TableHead>
									<TableHead className="w-56">{t("actions")}</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{data.analyses.map((a) => {
									const dims = a.dimensions as unknown as RiskDimensions;
									return (
										<TableRow key={a.id}>
											<TableCell className="font-mono text-xs">
												{a.version}
											</TableCell>
											<TableCell>
												<Badge
													variant={
														a.status === "approved"
															? "success"
															: a.status === "in_review"
																? "warning"
																: a.status === "superseded"
																	? "muted"
																	: "outline"
													}
												>
													{t(`astatus_${a.status}`)}
												</Badge>
											</TableCell>
											<TableCell>
												{a.overallRisk ? (
													<Badge
														variant={
															a.overallRisk === "high"
																? "destructive"
																: a.overallRisk === "medium"
																	? "warning"
																	: "success"
														}
													>
														{t(`risk_${a.overallRisk}`)}
													</Badge>
												) : (
													"—"
												)}
											</TableCell>
											<TableCell className="text-xs">
												{(
													["customer", "product", "country", "channel"] as const
												).map((k) => (
													<span key={k} className="mr-2 inline-block">
														{t(`dim_${k}`)}: {dims?.[k]?.score ?? "—"}
													</span>
												))}
												{a.summary && (
													<p className="mt-1 line-clamp-2 text-muted-foreground">
														{a.summary}
													</p>
												)}
											</TableCell>
											<TableCell>
												<UserChip name={a.ownerName} />
											</TableCell>
											<TableCell className="text-xs">
												{a.approvedAt ? (
													<>
														{fmtDate.format(a.approvedAt)}
														<br />
														<span className="text-muted-foreground">
															{a.approvedByName}
														</span>
													</>
												) : (
													"—"
												)}
											</TableCell>
											<TableCell>
												<div className="flex flex-wrap items-center gap-1">
													{canEdit && a.status === "draft" && (
														<>
															<RiskAnalysisForm
																members={data.members}
																initial={{
																	id: a.id,
																	version: a.version,
																	dimensions: dims,
																	summary: a.summary,
																	ownerUserId: a.ownerUserId,
																	nextReviewAt: a.nextReviewAt,
																}}
															/>
															<RiskAnalysisApproveButton
																id={a.id}
																soloHint={memberCount <= 1}
															/>
														</>
													)}
													{a.status === "in_review" && (
														<Link
															href="/heute/freigaben"
															className="text-primary text-xs hover:underline"
														>
															{ts("approvalPending")}
														</Link>
													)}
												</div>
											</TableCell>
										</TableRow>
									);
								})}
							</TableBody>
						</Table>
					)}
				</section>
			)}

			{tab === "sorgfalt" && "controls" in data && (
				<section className="grid gap-6 lg:grid-cols-2">
					<div className="flex flex-col gap-3">
						<p className="text-muted-foreground text-sm">{t("ddLead")}</p>
						<h2 className="font-medium text-sm">{t("controls")}</h2>
						<ControlList codes={DD_CONTROLS} />
						<h2 className="mt-2 font-medium text-sm">{t("documents")}</h2>
						<DocList codes={DD_DOCS} />
					</div>
					<div className="flex flex-col gap-3">
						<h2 className="font-medium text-sm">{t("legalChanges")}</h2>
						<div className="rounded-md border border-dashed p-3 text-sm">
							<p>{t("amlrHint")}</p>
							<ul className="mt-2 flex flex-col gap-1 text-muted-foreground text-xs">
								{legal.map((c) => (
									<li key={`${c.date}-${c.title}`}>
										<span className="font-medium text-foreground">
											{fmtDate.format(new Date(`${c.date}T00:00:00Z`))}
										</span>{" "}
										· {c.title}
									</li>
								))}
							</ul>
							<Link
								href="/kalender?tab=legal"
								className="mt-2 inline-block text-primary text-xs hover:underline"
							>
								{t("toCalendar")}
							</Link>
						</div>
						<h2 className="mt-2 font-medium text-sm">{t("providersTitle")}</h2>
						<p className="text-muted-foreground text-sm">
							{t("providersHint")}{" "}
							<Link
								href="/dienstleister?tab=werkzeuge"
								className="text-primary hover:underline"
							>
								{t("toTools")}
							</Link>
						</p>
					</div>
				</section>
			)}

			{tab === "monitoring" && "rules" in data && (
				<section className="flex flex-col gap-3">
					<p className="text-muted-foreground text-sm">{t("monitoringLead")}</p>
					<ControlList codes={MON_CONTROLS} />
					{data.rules.length === 0 ? (
						<EmptyState
							title={t("monitoringEmpty")}
							lead={t("monitoringEmptyLead")}
							requiredBy={t("requiredByMonitoring")}
							actions={
								canEdit ? (
									<MonitoringRuleForm members={data.members} />
								) : undefined
							}
						/>
					) : (
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead className="w-24">{t("code")}</TableHead>
									<TableHead>{t("description")}</TableHead>
									<TableHead className="w-40">{t("threshold")}</TableHead>
									<TableHead className="w-28">
										{t("falsePositiveRate")}
									</TableHead>
									<TableHead className="w-32">{t("lastTunedAt")}</TableHead>
									<TableHead className="w-36">{t("owner")}</TableHead>
									<TableHead className="w-32">{t("status")}</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{data.rules.map((r) => (
									<TableRow key={r.id}>
										<TableCell className="font-mono text-xs">
											{r.code}
										</TableCell>
										<TableCell>
											<p>{r.description}</p>
											{r.legalBasis && (
												<p className="text-muted-foreground text-xs">
													{r.legalBasis}
												</p>
											)}
											{r.rationale && (
												<p className="line-clamp-2 text-muted-foreground text-xs">
													{r.rationale}
												</p>
											)}
										</TableCell>
										<TableCell className="text-xs">
											{r.threshold ?? "—"}
										</TableCell>
										<TableCell className="text-xs">
											{r.falsePositiveRate ? `${r.falsePositiveRate} %` : "—"}
										</TableCell>
										<TableCell className="text-xs">
											{r.lastTunedAt
												? fmtDate.format(new Date(`${r.lastTunedAt}T00:00:00Z`))
												: "—"}
										</TableCell>
										<TableCell>
											<UserChip name={r.ownerName} />
										</TableCell>
										<TableCell>
											<div className="flex items-center gap-1">
												<Badge
													variant={
														r.status === "active"
															? "success"
															: r.status === "paused"
																? "warning"
																: "muted"
													}
												>
													{t(`rule_${r.status}`)}
												</Badge>
												{canEdit && (
													<MonitoringRuleForm
														members={data.members}
														initial={{
															id: r.id,
															code: r.code,
															description: r.description,
															threshold: r.threshold,
															rationale: r.rationale,
															legalBasis: r.legalBasis,
															ownerUserId: r.ownerUserId,
															lastTunedAt: r.lastTunedAt,
															falsePositiveRate: r.falsePositiveRate,
															status: r.status,
														}}
													/>
												)}
											</div>
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					)}
				</section>
			)}

			{tab === "verdacht" && "notes" in data && (
				<section className="flex flex-col gap-3">
					<p className="text-muted-foreground text-sm">{t("reportsLead")}</p>
					<div className="grid gap-3 text-sm sm:grid-cols-5">
						{(
							[
								["statsOpen", data.stats.open, data.stats.open > 0],
								["statsOnHold", data.stats.onHold, false],
								["statsReported", data.stats.reportedThisYear, false],
								["statsDismissed", data.stats.dismissedThisYear, false],
								["statsAvgDays", data.stats.avgDecisionDays ?? "—", false],
							] as const
						).map(([key, value, warn]) => (
							<div key={key} className="rounded-md border p-3">
								<p className="lv-eyebrow text-[0.52rem] text-muted-foreground">
									{t(key)}
								</p>
								<p
									className={`font-serif-display text-2xl ${warn ? "text-destructive" : "text-primary"}`}
								>
									{value}
								</p>
							</div>
						))}
					</div>
					{!detail ? (
						<p className="rounded-md border border-dashed p-3 text-sm">
							{t("aggregatedOnly")}
						</p>
					) : data.reports.length === 0 ? (
						<EmptyState
							title={t("reportsEmpty")}
							lead={t("reportsEmptyLead")}
							requiredBy={t("requiredByReports")}
							actions={
								canEdit ? (
									<SuspiciousReportForm members={data.members} />
								) : undefined
							}
						/>
					) : (
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead className="w-32">{t("ref")}</TableHead>
									<TableHead className="w-24">{t("kind")}</TableHead>
									<TableHead className="w-36">{t("detectedAt")}</TableHead>
									<TableHead>{t("category")}</TableHead>
									<TableHead className="w-36">{t("holdUntil")}</TableHead>
									<TableHead className="w-36">{t("owner")}</TableHead>
									<TableHead className="w-72">{t("status")}</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{data.reports.map((r, i) => (
									<TableRow key={r.id}>
										<TableCell className="font-mono text-xs">
											{r.internalRef}
											{r.externalRef && (
												<p className="text-muted-foreground">{r.externalRef}</p>
											)}
										</TableCell>
										<TableCell>
											<Badge variant="outline">{t(`kind_${r.kind}`)}</Badge>
										</TableCell>
										<TableCell className="text-xs">
											{fmtTs.format(r.detectedAt)}
										</TableCell>
										<TableCell>
											<p>{r.category ?? "—"}</p>
											{data.notes[i] && (
												<p className="line-clamp-2 text-muted-foreground text-xs">
													{data.notes[i]}
												</p>
											)}
										</TableCell>
										<TableCell className="text-xs">
											{r.holdUntil ? (
												<Badge
													variant={r.holdUntil > now ? "warning" : "muted"}
												>
													{fmtTs.format(r.holdUntil)}
												</Badge>
											) : (
												"—"
											)}
										</TableCell>
										<TableCell>
											<UserChip name={r.ownerName} />
										</TableCell>
										<TableCell>
											<div className="flex flex-wrap items-center gap-1">
												<Badge
													variant={
														r.status === "reported"
															? "success"
															: r.status === "review"
																? "destructive"
																: "muted"
													}
												>
													{t(`rstatus_${r.status}`)}
												</Badge>
												{canEdit && (
													<>
														<SuspiciousTransitionButtons
															id={r.id}
															status={r.status}
															kind={r.kind}
														/>
														<SuspiciousReportForm
															members={data.members}
															initial={{
																id: r.id,
																kind: r.kind,
																detectedAt: r.detectedAt
																	.toISOString()
																	.slice(0, 16),
																category: r.category,
																decisionNote: data.notes[i] ?? "",
																ownerUserId: r.ownerUserId,
															}}
														/>
													</>
												)}
											</div>
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					)}
				</section>
			)}

			{tab === "laender" && "jurisdictions" in data && (
				<section className="flex flex-col gap-4">
					<p className="text-muted-foreground text-sm">{t("countriesLead")}</p>
					{data.jurisdictions.length === 0 ? (
						<EmptyState
							title={t("countriesEmpty")}
							lead={t("countriesEmptyLead")}
							requiredBy={t("requiredByCountries")}
							actions={
								canEdit ? (
									<>
										<ApplyJurisdictionSeedButton />
										<JurisdictionCsvImport />
									</>
								) : undefined
							}
						/>
					) : (
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead className="w-12">ISO</TableHead>
									<TableHead>{t("name")}</TableHead>
									<TableHead className="w-56">{t("flags")}</TableHead>
									<TableHead className="w-32">{t("orgStance")}</TableHead>
									<TableHead className="w-32">{t("corridor")}</TableHead>
									<TableHead className="w-28">{t("reviewedAt")}</TableHead>
									<TableHead className="w-40">{t("actions")}</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{data.jurisdictions.map((j) => (
									<TableRow key={j.id}>
										<TableCell className="font-mono text-xs">
											{j.iso2}
										</TableCell>
										<TableCell>
											<p className="font-medium">{j.name}</p>
											{j.legalNotes && (
												<p className="line-clamp-2 text-muted-foreground text-xs">
													{j.legalNotes}
												</p>
											)}
										</TableCell>
										<TableCell>
											<div className="flex flex-wrap gap-1">
												{j.euHighRisk && (
													<Badge variant="destructive">
														{t("euHighRiskShort")}
													</Badge>
												)}
												{j.fatfStatus !== "none" && (
													<Badge
														variant={
															j.fatfStatus === "black"
																? "destructive"
																: "warning"
														}
													>
														FATF {t(`fatf_${j.fatfStatus}`)}
													</Badge>
												)}
												{j.euSanctions && (
													<Badge variant="destructive">EU</Badge>
												)}
												{j.usSanctions && <Badge variant="outline">OFAC</Badge>}
											</div>
										</TableCell>
										<TableCell>
											<Badge
												variant={
													j.orgStance === "blocked"
														? "destructive"
														: j.orgStance === "enhanced_dd"
															? "warning"
															: "success"
												}
											>
												{t(`stance_${j.orgStance}`)}
											</Badge>
										</TableCell>
										<TableCell>
											{j.corridorStatus === "none" ? (
												<span className="text-muted-foreground text-xs">—</span>
											) : (
												<Badge
													variant={
														j.corridorStatus === "active"
															? "success"
															: "outline"
													}
												>
													{t(`corridor_${j.corridorStatus}`)}
												</Badge>
											)}
										</TableCell>
										<TableCell className="text-xs">
											{j.reviewedAt
												? fmtDate.format(new Date(`${j.reviewedAt}T00:00:00Z`))
												: "—"}
										</TableCell>
										<TableCell>
											{canEdit && (
												<div className="flex items-center gap-1">
													<JurisdictionForm
														initial={{
															id: j.id,
															iso2: j.iso2,
															name: j.name,
															euHighRisk: j.euHighRisk,
															fatfStatus: j.fatfStatus,
															euSanctions: j.euSanctions,
															usSanctions: j.usSanctions,
															orgStance: j.orgStance,
															corridorStatus: j.corridorStatus,
															corridorNotes: j.corridorNotes,
															legalNotes: j.legalNotes,
															reviewedAt: j.reviewedAt,
														}}
													/>
													{j.orgStance !== "blocked" && j.iso2 !== "DE" && (
														<CorridorTemplateButton iso2={j.iso2} />
													)}
												</div>
											)}
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					)}
					<details className="rounded-md border p-3 text-sm">
						<summary className="cursor-pointer font-medium">
							{t("corridorStepsTitle")}
						</summary>
						<p className="mt-2 text-muted-foreground">
							{t("corridorStepsLead")}
						</p>
						<ol className="mt-2 list-decimal pl-5">
							{CORRIDOR_STEPS.map((s) => (
								<li key={s.order} className="py-0.5">
									<span className="font-medium">{s.title}</span>{" "}
									<span className="text-muted-foreground text-xs">
										· {tf(s.ownerFunction)} · +{s.offsetDays} d
									</span>
								</li>
							))}
						</ol>
						<p className="mt-3 font-medium">{t("dossierTitle")}</p>
						<ol className="mt-1 list-decimal pl-5 text-muted-foreground text-xs">
							{CORRIDOR_DOSSIER_QUESTIONS.map((q) => (
								<li key={q}>{q}</li>
							))}
						</ol>
					</details>
				</section>
			)}

			{tab === "travel-rule" && "assets" in data && (
				<section className="grid gap-6 lg:grid-cols-2">
					<div className="flex flex-col gap-3">
						<p className="text-muted-foreground text-sm">{t("travelLead")}</p>
						<h2 className="font-medium text-sm">{t("controls")}</h2>
						<ControlList codes={TR_CONTROLS} />
						<h2 className="mt-2 font-medium text-sm">{t("documents")}</h2>
						<DocList codes={TR_DOCS} />
						<p className="rounded-md border border-dashed p-3 text-muted-foreground text-xs">
							{t("selfHostedHint")}
						</p>
					</div>
					<div className="flex flex-col gap-3">
						<h2 className="font-medium text-sm">{t("acceptedAssets")}</h2>
						{data.assets.filter((a) => a.accepted).length === 0 ? (
							<p className="text-muted-foreground text-sm">
								{t("noAssets")}{" "}
								<Link
									href="/kryptowerte"
									className="text-primary hover:underline"
								>
									/kryptowerte
								</Link>
							</p>
						) : (
							<ul className="flex flex-col divide-y divide-border/60 rounded-md border text-sm">
								{data.assets
									.filter((a) => a.accepted)
									.map((a) => (
										<li
											key={a.id}
											className="flex items-center justify-between gap-3 p-2.5"
										>
											<span>
												<span className="font-mono text-xs">{a.symbol}</span>{" "}
												{a.name}
											</span>
											<span className="text-muted-foreground text-xs">
												{(a.networks ?? []).join(", ") || "—"}
											</span>
										</li>
									))}
							</ul>
						)}
						<h2 className="mt-2 font-medium text-sm">{t("corridorsActive")}</h2>
						<ul className="flex flex-wrap gap-1">
							{data.jurisdictions
								.filter((j) => j.corridorStatus !== "none")
								.map((j) => (
									<li key={j.id}>
										<Badge
											variant={
												j.corridorStatus === "active" ? "success" : "outline"
											}
										>
											{j.iso2} · {t(`corridor_${j.corridorStatus}`)}
										</Badge>
									</li>
								))}
							{data.jurisdictions.every((j) => j.corridorStatus === "none") && (
								<li className="text-muted-foreground text-sm">—</li>
							)}
						</ul>
					</div>
				</section>
			)}

			{tab === "schulung" && "runs" in data && (
				<section className="grid gap-6 lg:grid-cols-2">
					<div className="flex flex-col gap-3">
						<p className="text-muted-foreground text-sm">{t("trainingLead")}</p>
						<h2 className="font-medium text-sm">{t("gwgRequirements")}</h2>
						{data.requirements.length === 0 ? (
							<p className="text-muted-foreground text-sm">
								{t("noRequirements")}{" "}
								<Link
									href="/schulungen"
									className="text-primary hover:underline"
								>
									/schulungen
								</Link>
							</p>
						) : (
							<ul className="flex flex-col divide-y divide-border/60 rounded-md border text-sm">
								{data.requirements.map((r) => (
									<li
										key={r.id}
										className="flex items-center justify-between gap-3 p-2.5"
									>
										<span>
											<span className="font-mono text-xs">{r.code}</span>{" "}
											{r.title}
										</span>
										<span className="text-muted-foreground text-xs">
											{r.function ? tf(r.function) : "—"} · {r.frequencyMonths}{" "}
											M
										</span>
									</li>
								))}
							</ul>
						)}
						<h2 className="mt-2 font-medium text-sm">
							{t("trainingsLast12", {
								n: data.trainings.filter(
									(x) =>
										new Date(`${x.heldAt}T00:00:00Z`).getTime() >
										now.getTime() - 365 * 86_400_000,
								).length,
							})}
						</h2>
						<ul className="flex flex-col divide-y divide-border/60 rounded-md border text-sm">
							{data.trainings.slice(0, 8).map((x) => (
								<li
									key={x.id}
									className="flex items-center justify-between gap-3 p-2.5"
								>
									<span>{x.title}</span>
									<span className="text-muted-foreground text-xs">
										{fmtDate.format(new Date(`${x.heldAt}T00:00:00Z`))} ·{" "}
										{x.attendeeUserIds?.length ?? 0}
									</span>
								</li>
							))}
							{data.trainings.length === 0 && (
								<li className="p-2.5 text-muted-foreground">—</li>
							)}
						</ul>
					</div>
					<div className="flex flex-col gap-3">
						<h2 className="font-medium text-sm">{t("obligationsTitle")}</h2>
						{data.runs.length === 0 ? (
							<p className="text-muted-foreground text-sm">
								{t("noRuns")}{" "}
								<Link href="/kalender" className="text-primary hover:underline">
									/kalender
								</Link>
							</p>
						) : (
							<ul className="flex flex-col divide-y divide-border/60 rounded-md border text-sm">
								{data.runs.map((r) => (
									<li
										key={r.id}
										className="flex items-center justify-between gap-3 p-2.5"
									>
										<span>
											{r.title}
											<span className="block text-muted-foreground text-xs">
												{r.periodLabel} · {t("dueAt")}{" "}
												{fmtDate.format(new Date(`${r.dueAt}T00:00:00Z`))}
											</span>
										</span>
										<Badge
											variant={
												r.status === "done"
													? "success"
													: r.status === "overdue"
														? "destructive"
														: r.status === "due"
															? "warning"
															: "muted"
											}
										>
											{t(`run_${r.status}`)}
										</Badge>
									</li>
								))}
							</ul>
						)}
						<h2 className="mt-2 font-medium text-sm">{t("reportFigures")}</h2>
						<dl className="grid grid-cols-2 gap-2 rounded-md border p-3 text-sm">
							<dt className="text-muted-foreground">{t("figAnalysis")}</dt>
							<dd>
								{data.analyses.some((a) => a.status === "approved")
									? t("validAnalysis")
									: t("noValidAnalysis")}
							</dd>
							<dt className="text-muted-foreground">{t("figRules")}</dt>
							<dd>{data.rules.filter((r) => r.status === "active").length}</dd>
							<dt className="text-muted-foreground">{t("figReports")}</dt>
							<dd>
								{data.stats.reportedThisYear} / {data.stats.dismissedThisYear}
							</dd>
							<dt className="text-muted-foreground">{t("figTrainings")}</dt>
							<dd>{data.trainings.length}</dd>
							<dt className="text-muted-foreground">{t("figFrameworks")}</dt>
							<dd>
								{fws
									.filter((f) =>
										["gwg", "amlr", "tfr", "sanctions"].includes(f),
									)
									.join(", ") || "—"}
							</dd>
						</dl>
					</div>
				</section>
			)}
		</>
	);
}
