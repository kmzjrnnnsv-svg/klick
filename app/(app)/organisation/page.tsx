import { eq } from "drizzle-orm";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { deleteShareholder } from "@/app/actions/casp";
import {
	deleteCommunication,
	deleteContextIssue,
	deleteInterestedParty,
	deleteRoleAssignment,
} from "@/app/actions/organisation";
import { deleteInsurancePolicy } from "@/app/actions/privacy";
import { ApprovalBar } from "@/components/approvals/approval-bar";
import { ShareholderForm } from "@/components/casp/shareholder-form";
import { Sparkline } from "@/components/entity/sparkline";
import { UrlTabs } from "@/components/entity/url-tabs";
import { UserChip } from "@/components/entity/user-chip";
import { EntityEvidence } from "@/components/evidence-studio/entity-evidence";
import {
	ApplyGovernanceSeedButton,
	CommunicationForm,
	ConflictForm,
	ContextIssueForm,
	DeleteRowButton,
	PartyForm,
	RegulatorInteractionForm,
} from "@/components/organisation/governance-forms";
import { OrgChart } from "@/components/organisation/org-chart";
import {
	MeasurementForm,
	ObjectiveForm,
	RoleAssignmentForm,
	ScopeApproveButton,
	ScopeForm,
} from "@/components/organisation/roles-forms";
import { PageHeader } from "@/components/page-header";
import { InsuranceForm } from "@/components/privacy/privacy-forms";
import { SitesStep } from "@/components/setup/sites-step";
import { Badge } from "@/components/ui/badge";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { sites } from "@/db/schema";
import { ROLE_FUNCTIONS } from "@/db/schema/enums";
import { canDecideNow } from "@/lib/approvals/rules";
import {
	activeDelegations,
	latestRequestFor,
	loadCandidates,
} from "@/lib/approvals/service";
import { requireOrgPage } from "@/lib/auth/gates";
import { toOrgCtx } from "@/lib/auth/guards";
import { listOrgMembers } from "@/lib/auth/org";
import { allows } from "@/lib/auth/permissions";
import { appointable } from "@/lib/compliance/catalog/appointment-templates";
import { loadIndicatorData } from "@/lib/compliance/indicator-data";
import {
	objectiveTemplateKey,
	SOURCED_TEMPLATES,
	suggestMeasurement,
} from "@/lib/compliance/indicator-sources";
import {
	type IndicatorState,
	indicatorState,
} from "@/lib/compliance/indicators";
import { buildOrgChart } from "@/lib/compliance/org-chart";
import { fmtDate, shortFrameworkName } from "@/lib/compliance/page-data";
import { insuranceState } from "@/lib/compliance/privacy";
import {
	getOrgProfile,
	listMembersForPicker,
	userNames,
} from "@/lib/compliance/queries";
import { listAssets } from "@/lib/compliance/queries-p2";
import {
	governanceStatus,
	listCommunications,
	listConflicts,
	listContextIssues,
	listInterestedParties,
	listObjectives,
	listRegulatorInteractions,
	listScopes,
} from "@/lib/compliance/queries-p3";
import { listShareholders } from "@/lib/compliance/queries-p4";
import { listInsurancePolicies } from "@/lib/compliance/queries-p5";
import {
	inhaberkontrolleDeadline,
	shareholderGaps,
	totalSharePct,
} from "@/lib/compliance/shareholders";
import { decryptMany, fieldAad } from "@/lib/crypto/org-dek";
import { readOrg } from "@/lib/db/with-org";
import { listOrgFrameworks } from "@/lib/org/queries";
import type { FitProperChecklist } from "@/lib/validation/governance";

type Search = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const fmtNum = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 2 });
const INDICATOR_TONE: Record<
	IndicatorState,
	"success" | "warning" | "destructive" | "muted"
> = {
	ok: "success",
	warn: "warning",
	alert: "destructive",
	overdue_measurement: "warning",
	no_data: "muted",
};
const TABS = [
	"kontext",
	"geltungsbereich",
	"rollen",
	"ziele",
	"kommunikation",
	"aufsicht",
	"konflikte",
	"gesellschafter",
	"versicherungen",
	"standorte",
] as const;

export default async function OrganisationPage({
	searchParams,
}: {
	searchParams: Promise<Search>;
}) {
	const ctx = await requireOrgPage({ organisation: ["read"] });
	const sp = await searchParams;
	const tab = (TABS as readonly string[]).includes(one(sp.tab) ?? "")
		? (one(sp.tab) as (typeof TABS)[number])
		: "kontext";
	const t = await getTranslations("Organisation");
	const tf = await getTranslations("Functions");
	const canEdit = allows(ctx, { organisation: ["update"] });
	const canRoles = allows(ctx, { role_assignment: ["update"] });
	const canShareholders = allows(ctx, { shareholder: ["update"] });
	const tsh = await getTranslations("Shareholders");
	const tin = await getTranslations("Insurance");
	const orgMembers = await listOrgMembers(ctx.orgId);
	const memberCount = orgMembers.length;

	const data = await readOrg(toOrgCtx(ctx), async (tx) => {
		const profile = await getOrgProfile(tx, ctx.orgId);
		const fws = profile?.frameworks ?? [];
		const stage = profile?.profile.licenceStage ?? "0_vorbereitung";
		const members = await listMembersForPicker(tx, ctx.orgId);
		const orgFws = await listOrgFrameworks(tx, ctx.orgId);
		const gov = await governanceStatus(tx, ctx.orgId, fws, stage);
		const base = { fws, stage, members, orgFws, gov };
		switch (tab) {
			case "kontext":
				return {
					...base,
					issues: await listContextIssues(tx, ctx.orgId),
					parties: await listInterestedParties(tx, ctx.orgId),
				};
			case "geltungsbereich": {
				const scopes = await listScopes(tx, ctx.orgId);
				const requests = await Promise.all(
					scopes.map((s) => latestRequestFor(tx, ctx.orgId, "scope", s.id)),
				);
				const candidates = await loadCandidates(tx, ctx.orgId);
				const dels = await activeDelegations(tx, ctx.orgId);
				const names = await userNames(
					tx,
					requests.flatMap(
						(r) => r?.decisions.map((d) => d.approverUserId) ?? [],
					),
				);
				return { ...base, scopes, requests, candidates, dels, names };
			}
			case "rollen": {
				const checklists = await decryptMany<FitProperChecklist>(
					tx,
					ctx.orgId,
					gov.assignments.map((a) => ({
						stored: a.fitProperChecklist,
						aad: fieldAad("role_assignments", a.id, "fit_proper_checklist"),
					})),
				);
				const assetRows = await listAssets(tx, ctx.orgId);
				return { ...base, checklists, assetRows };
			}
			case "standorte":
				return {
					...base,
					siteRows: await tx
						.select()
						.from(sites)
						.where(eq(sites.organizationId, ctx.orgId))
						.orderBy(sites.createdAt),
				};
			case "ziele": {
				const objectives = await listObjectives(tx, ctx.orgId);
				const objRequests = await Promise.all(
					objectives.map((o) =>
						latestRequestFor(tx, ctx.orgId, "objective", o.id),
					),
				);
				const candidates = await loadCandidates(tx, ctx.orgId);
				const dels = await activeDelegations(tx, ctx.orgId);
				const names = await userNames(
					tx,
					objRequests.flatMap(
						(r) => r?.decisions.map((d) => d.approverUserId) ?? [],
					),
				);
				// Messvorschläge aus Klick (C2) für Ziele aus Vorlagen
				const sourced = objectives.some((o) =>
					(SOURCED_TEMPLATES as readonly string[]).includes(
						objectiveTemplateKey(o) ?? "",
					),
				);
				const indicatorData = sourced
					? await loadIndicatorData(tx, ctx.orgId, orgMembers)
					: null;
				return {
					...base,
					objectives,
					objRequests,
					candidates,
					dels,
					names,
					indicatorData,
				};
			}
			case "kommunikation":
				return {
					...base,
					comms: await listCommunications(tx, ctx.orgId),
					parties: await listInterestedParties(tx, ctx.orgId),
				};
			case "aufsicht":
				return {
					...base,
					interactions: await listRegulatorInteractions(tx, ctx.orgId),
				};
			case "konflikte":
				return { ...base, conflicts: await listConflicts(tx, ctx.orgId) };
			case "gesellschafter": {
				const shareholders = await listShareholders(tx, ctx.orgId);
				const ubo = canShareholders
					? await decryptMany<string>(
							tx,
							ctx.orgId,
							shareholders.map((x) => ({
								stored: x.uboChain,
								aad: fieldAad("shareholders", x.id, "ubo_chain"),
							})),
						)
					: shareholders.map(() => null);
				return { ...base, shareholders, ubo };
			}
			case "versicherungen":
				return {
					...base,
					policies: await listInsurancePolicies(tx, ctx.orgId),
				};
		}
	});
	const { members, orgFws, gov } = data;
	const functionLabels = Object.fromEntries(
		ROLE_FUNCTIONS.map((f) => [f, tf(f)]),
	) as Record<string, string>;
	const today = new Date().toISOString().slice(0, 10);
	const gapCount = gov.coverage.gaps.length;
	const blockSod = gov.sod.filter((v) => v.rule.severity === "block").length;

	return (
		<>
			<PageHeader
				title={t("title")}
				lead={t("lead")}
				actions={
					canEdit && tab === "kontext" ? (
						<ApplyGovernanceSeedButton />
					) : undefined
				}
			/>
			<UrlTabs
				base="/organisation"
				active={tab}
				tabs={[
					{ value: "kontext", label: t("tabContext") },
					{ value: "geltungsbereich", label: t("tabScope") },
					{
						value: "rollen",
						label: t("tabRoles"),
						count: gapCount + blockSod || undefined,
					},
					{ value: "ziele", label: t("tabObjectives") },
					{ value: "standorte", label: t("tabSites") },
					{ value: "kommunikation", label: t("tabCommunication") },
					{ value: "aufsicht", label: t("tabRegulators") },
					{ value: "konflikte", label: t("tabConflicts") },
					...(data.fws.some((f) => ["micar", "zag", "kwg"].includes(f))
						? [
								{ value: "gesellschafter", label: t("tabShareholders") },
								{ value: "versicherungen", label: t("tabInsurance") },
							]
						: []),
				]}
			/>

			{"issues" in data && (
				<div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
					<section className="flex flex-col gap-3">
						<div className="flex items-start justify-between gap-3">
							<div>
								<h2 className="font-medium text-footnote text-muted-foreground">
									{t("issues")}
								</h2>
								<p className="mt-1 text-muted-foreground text-footnote">
									{t("issuesLead")}
								</p>
							</div>
							{canEdit && <ContextIssueForm members={members} />}
						</div>
						{data.issues.length === 0 ? (
							<p className="text-muted-foreground text-subhead">
								{t("issuesEmpty")}
							</p>
						) : (
							<ul className="flex flex-col divide-y divide-border/60 overflow-hidden rounded-2xl bg-card text-subhead">
								{data.issues.map((i) => (
									<li key={i.id} className="flex items-start gap-3 px-3 py-2">
										<Badge variant="outline" className="mt-0.5 shrink-0">
											{t(`scope_${i.scope}`)}
										</Badge>
										<div className="min-w-0 flex-1">
											<p className="font-medium">{i.title}</p>
											{i.description && (
												<p className="text-muted-foreground text-footnote">
													{i.description}
												</p>
											)}
											{i.impact && (
												<p className="text-footnote">
													<span className="text-muted-foreground">
														{t("impact")}:{" "}
													</span>
													{i.impact}
												</p>
											)}
										</div>
										{canEdit && (
											<div className="flex shrink-0 items-center">
												<ContextIssueForm
													members={members}
													initial={{
														id: i.id,
														scope: i.scope,
														title: i.title,
														description: i.description,
														impact: i.impact,
														ownerUserId: i.ownerUserId,
														reviewAt: i.reviewAt,
													}}
												/>
												<DeleteRowButton
													id={i.id}
													action={deleteContextIssue}
													label={t("deleteIssue")}
												/>
											</div>
										)}
									</li>
								))}
							</ul>
						)}
					</section>
					<section className="flex flex-col gap-3">
						<div className="flex items-start justify-between gap-3">
							<div>
								<h2 className="font-medium text-footnote text-muted-foreground">
									{t("parties")}
								</h2>
								<p className="mt-1 text-muted-foreground text-footnote">
									{t("partiesLead")}
								</p>
							</div>
							{canEdit && <PartyForm members={members} />}
						</div>
						{data.parties.length === 0 ? (
							<p className="text-muted-foreground text-subhead">
								{t("partiesEmpty")}
							</p>
						) : (
							<ul className="flex flex-col divide-y divide-border/60 overflow-hidden rounded-2xl bg-card text-subhead">
								{data.parties.map((p) => (
									<li key={p.id} className="flex items-start gap-3 px-3 py-2">
										<Badge variant="outline" className="mt-0.5 shrink-0">
											{t(`party_${p.type}`)}
										</Badge>
										<div className="min-w-0 flex-1">
											<p className="font-medium">{p.name}</p>
											{p.expectations && (
												<p className="text-muted-foreground text-footnote">
													{p.expectations}
												</p>
											)}
											{p.howAddressed && (
												<p className="text-footnote">
													<span className="text-muted-foreground">
														{t("howAddressed")}:{" "}
													</span>
													{p.howAddressed}
												</p>
											)}
											{p.relevantFrameworks.length > 0 && (
												<p className="mt-1 flex flex-wrap gap-1">
													{p.relevantFrameworks.map((f) => (
														<Badge key={f} variant="muted" className="">
															{shortFrameworkName(f)}
														</Badge>
													))}
												</p>
											)}
										</div>
										{canEdit && (
											<div className="flex shrink-0 items-center">
												<PartyForm
													members={members}
													initial={{
														id: p.id,
														name: p.name,
														type: p.type,
														expectations: p.expectations,
														requirements: p.requirements,
														howAddressed: p.howAddressed,
														contact: p.contact,
														ownerUserId: p.ownerUserId,
														reviewAt: p.reviewAt,
													}}
												/>
												<DeleteRowButton
													id={p.id}
													action={deleteInterestedParty}
													label={t("deleteParty")}
												/>
											</div>
										)}
									</li>
								))}
							</ul>
						)}
					</section>
				</div>
			)}

			{"scopes" in data && (
				<section className="flex flex-col gap-4">
					<div className="flex items-start justify-between gap-3">
						<p className="text-muted-foreground text-subhead">
							{t("scopeLead")}
						</p>
						{canEdit && <ScopeForm members={members} frameworks={orgFws} />}
					</div>
					{data.scopes.length === 0 ? (
						<p className="text-subhead">{t("scopeEmpty")}</p>
					) : (
						data.scopes.map((s, idx) => {
							const req = data.requests[idx] ?? null;
							const me = data.candidates.find((c) => c.userId === ctx.userId);
							const step = req?.steps.find((x) => x.order === req.currentStep);
							const eligible = Boolean(
								req &&
									req.status === "pending" &&
									step &&
									me &&
									canDecideNow(
										step,
										me,
										{
											requesterUserId: req.requestedByUserId,
											entityOwnerUserId: s.ownerUserId,
											delegations: data.dels,
										},
										data.candidates,
										req.decisions.filter((d) => d.step === req.currentStep),
									),
							);
							return (
								<article
									key={s.id}
									className="flex flex-col gap-3 rounded-2xl bg-card p-4 text-subhead"
								>
									<div className="flex flex-wrap items-center gap-2">
										<Badge
											variant={
												s.status === "approved"
													? "success"
													: s.status === "superseded"
														? "muted"
														: "warning"
											}
										>
											{t(`scopeStatus_${s.status}`)}
										</Badge>
										<span className="font-medium">
											{s.frameworkName ?? t("allFrameworks")} · v{s.version}
										</span>
										<span className="ml-auto text-muted-foreground text-footnote">
											{s.approvedAt
												? `${t("approvedBy")} ${s.approvedByName ?? "—"} · ${fmtDate.format(s.approvedAt)}`
												: `${t("owner")}: ${s.ownerName ?? "—"}`}
										</span>
										{canEdit && (
											<ScopeForm
												members={members}
												frameworks={orgFws}
												initial={{
													id: s.id,
													frameworkSlug: s.frameworkSlug,
													statement: s.statement,
													boundaries: s.boundaries,
													locations: s.locations,
													services: s.services,
													exclusions: s.exclusions,
													version: s.version,
													ownerUserId: s.ownerUserId,
												}}
											/>
										)}
									</div>
									<p className="whitespace-pre-wrap">{s.statement}</p>
									{s.boundaries && (
										<p className="text-muted-foreground text-footnote">
											<span className="font-medium">{t("boundaries")}:</span>{" "}
											{s.boundaries}
										</p>
									)}
									<div className="flex flex-wrap gap-4 text-footnote">
										{s.locations.length > 0 && (
											<span>
												<span className="text-muted-foreground">
													{t("locations")}:
												</span>{" "}
												{s.locations.join(", ")}
											</span>
										)}
										{s.services.length > 0 && (
											<span>
												<span className="text-muted-foreground">
													{t("services")}:
												</span>{" "}
												{s.services.join(", ")}
											</span>
										)}
									</div>
									{s.exclusions.length > 0 && (
										<div>
											<p className="font-medium text-footnote text-muted-foreground">
												{t("exclusions")}
											</p>
											<ul className="mt-1 list-disc pl-5 text-footnote">
												{s.exclusions.map((e) => (
													<li key={e.what}>
														<span className="font-medium">{e.what}</span> —{" "}
														{e.justification}
													</li>
												))}
											</ul>
										</div>
									)}
									{req && (
										<ApprovalBar
											data={{
												...req,
												decisions: req.decisions.map((d) => ({
													step: d.step,
													approverUserId: d.approverUserId,
													decision: d.decision,
													note: d.note,
													decidedAt: d.decidedAt,
												})),
											}}
											names={data.names}
											eligible={eligible}
											currentUserId={ctx.userId}
										/>
									)}
									{canEdit &&
										s.status === "draft" &&
										(!req || req.status !== "pending") && (
											<ScopeApproveButton
												scopeId={s.id}
												soloHint={memberCount <= 1}
											/>
										)}
								</article>
							);
						})
					)}
				</section>
			)}

			{"checklists" in data && (
				<section className="flex flex-col gap-6">
					<section aria-labelledby="org-chart" className="flex flex-col gap-3">
						<div className="flex flex-wrap items-start justify-between gap-3">
							<div className="flex flex-col gap-1">
								<h2 id="org-chart" className="font-semibold text-headline">
									{t("orgChartTitle")}
								</h2>
								<p className="text-muted-foreground text-subhead">
									{t("orgChartLead")}
								</p>
							</div>
							<EntityEvidence
								ctx={ctx}
								code="NW-ORGANIGRAMM"
								generateLabel={t("orgChartGenerate")}
							/>
						</div>
						<OrgChart
							{...buildOrgChart(
								gov.assignments.map((a) => ({
									function: a.function,
									reportsToFunction: a.reportsToFunction,
									holder: a.holderName ?? a.pendingEmail,
									deputy: a.deputyName,
								})),
								gov.required.map((r) => r.function),
							)}
							functionLabels={functionLabels}
						/>
					</section>
					<div className="flex items-start justify-between gap-3">
						<p className="text-muted-foreground text-subhead">
							{t("rolesLead")}
						</p>
						{canRoles && (
							<RoleAssignmentForm
								members={members}
								functionLabels={functionLabels}
							/>
						)}
					</div>
					{gov.sod.length > 0 && (
						<div className="flex flex-col gap-1 rounded-xl bg-destructive/10 p-3 text-subhead">
							<p className="font-medium">{t("sodTitle")}</p>
							<ul className="list-disc pl-5 text-footnote">
								{gov.sod.map((v) => (
									<li key={`${v.rule.code}-${v.userId}`}>
										<Badge
											variant={
												v.rule.severity === "block" ? "destructive" : "warning"
											}
											className="mr-2"
										>
											{v.rule.code}
										</Badge>
										{v.userName}: {functionLabels[v.rule.a]} +{" "}
										{functionLabels[v.rule.b]} — {v.rule.text}{" "}
										<span className="text-muted-foreground">
											({v.rule.legalBasis})
										</span>
									</li>
								))}
							</ul>
						</div>
					)}
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>{t("function")}</TableHead>
								<TableHead>{t("holder")}</TableHead>
								<TableHead>{t("deputy")}</TableHead>
								<TableHead className="w-28">{t("fitProper")}</TableHead>
								<TableHead className="w-40">{t("legalBasis")}</TableHead>
								<TableHead className="w-28 text-right">{t("status")}</TableHead>
								<TableHead className="w-24" />
							</TableRow>
						</TableHeader>
						<TableBody>
							{gov.coverage.items.map((it) => {
								const a = gov.assignments.find(
									(x) => x.function === it.required.function,
								);
								const idx = a ? gov.assignments.indexOf(a) : -1;
								const cl = idx >= 0 ? data.checklists[idx] : null;
								const doneCount = cl
									? Object.values(cl).filter((v) => v === true).length
									: 0;
								return (
									<TableRow key={it.required.function}>
										<TableCell>
											<p className="font-medium">
												{functionLabels[it.required.function]}
											</p>
											{it.required.hint && (
												<p className="text-muted-foreground text-footnote">
													{it.required.hint}
												</p>
											)}
											{a && appointable(a.function) && (
												<div className="mt-2">
													<EntityEvidence
														ctx={ctx}
														code="NW-BESTELLUNG"
														entityId={a.id}
														generateLabel={t("appointmentGenerate")}
													/>
												</div>
											)}
										</TableCell>
										<TableCell>
											{it.filled ? (
												a?.userId ? (
													<UserChip name={a.holderName} />
												) : (
													<span>
														{a?.externalName}{" "}
														<Badge variant="muted">extern</Badge>
													</span>
												)
											) : (
												<span className="text-destructive">
													{t("unfilled")}
												</span>
											)}
										</TableCell>
										<TableCell>
											{a?.deputyName ? (
												<UserChip name={a.deputyName} />
											) : it.deputyMissing ? (
												<span className="text-warning text-footnote">
													{t("deputyMissing")}
												</span>
											) : (
												<span className="text-muted-foreground">—</span>
											)}
										</TableCell>
										<TableCell>
											{a ? (
												<div className="flex flex-col gap-0.5 text-footnote">
													<Badge
														variant={
															a.fitProperStatus === "confirmed"
																? "success"
																: a.fitProperStatus === "pending"
																	? "warning"
																	: a.fitProperStatus === "rejected"
																		? "destructive"
																		: "muted"
														}
													>
														{t(`fp_${a.fitProperStatus}`)}
													</Badge>
													{cl && (
														<span className="text-muted-foreground">
															{doneCount}/7
														</span>
													)}
													{it.documentsExpired && (
														<span className="text-destructive">
															{t("documentsExpired")}
														</span>
													)}
												</div>
											) : (
												"—"
											)}
										</TableCell>
										<TableCell className="text-muted-foreground text-footnote">
											{it.required.legalBasis}
										</TableCell>
										<TableCell className="text-right">
											{it.filled ? (
												<Badge variant="success">{t("filled")}</Badge>
											) : (
												<Badge variant="destructive">{t("gap")}</Badge>
											)}
										</TableCell>
										<TableCell className="text-right">
											{canRoles && (
												<div className="flex items-center justify-end">
													<RoleAssignmentForm
														members={members}
														functionLabels={functionLabels}
														presetFunction={it.required.function}
														triggerLabel={a ? undefined : t("assign")}
														initial={
															a
																? {
																		id: a.id,
																		function: a.function,
																		userId: a.userId,
																		externalName: a.externalName,
																		appointedAt: a.appointedAt,
																		deputyUserId: a.deputyUserId,
																		fitProperStatus: a.fitProperStatus,
																		fitProperChecklist: cl,
																		documentsValidUntil: a.documentsValidUntil,
																		reviewAt: a.reviewAt,
																		reportsToFunction: a.reportsToFunction,
																		appointmentNotes: a.appointmentNotes,
																	}
																: undefined
														}
													/>
													{a && (
														<DeleteRowButton
															id={a.id}
															action={deleteRoleAssignment}
															label={t("deleteAssignment")}
														/>
													)}
												</div>
											)}
										</TableCell>
									</TableRow>
								);
							})}
							{gov.assignments
								.filter(
									(a) => !gov.required.some((r) => r.function === a.function),
								)
								.map((a) => {
									const idx = gov.assignments.indexOf(a);
									const cl = data.checklists[idx];
									return (
										<TableRow key={a.id} className="text-muted-foreground">
											<TableCell>
												{functionLabels[a.function]}
												{appointable(a.function) && (
													<div className="mt-2">
														<EntityEvidence
															ctx={ctx}
															code="NW-BESTELLUNG"
															entityId={a.id}
															generateLabel={t("appointmentGenerate")}
														/>
													</div>
												)}
											</TableCell>
											<TableCell>
												{a.userId ? (
													<UserChip name={a.holderName} />
												) : (
													a.externalName
												)}
											</TableCell>
											<TableCell>
												{a.deputyName ? <UserChip name={a.deputyName} /> : "—"}
											</TableCell>
											<TableCell>
												<Badge variant="muted">
													{t(`fp_${a.fitProperStatus}`)}
												</Badge>
											</TableCell>
											<TableCell className="text-footnote">
												{t("optionalFunction")}
											</TableCell>
											<TableCell className="text-right">
												<Badge variant="outline">{t("filled")}</Badge>
											</TableCell>
											<TableCell className="text-right">
												{canRoles && (
													<div className="flex items-center justify-end">
														<RoleAssignmentForm
															members={members}
															functionLabels={functionLabels}
															initial={{
																id: a.id,
																function: a.function,
																userId: a.userId,
																externalName: a.externalName,
																appointedAt: a.appointedAt,
																deputyUserId: a.deputyUserId,
																fitProperStatus: a.fitProperStatus,
																fitProperChecklist: cl,
																documentsValidUntil: a.documentsValidUntil,
																reviewAt: a.reviewAt,
																reportsToFunction: a.reportsToFunction,
																appointmentNotes: a.appointmentNotes,
															}}
														/>
														<DeleteRowButton
															id={a.id}
															action={deleteRoleAssignment}
															label={t("deleteAssignment")}
														/>
													</div>
												)}
											</TableCell>
										</TableRow>
									);
								})}
						</TableBody>
					</Table>
					<p className="text-muted-foreground text-footnote">
						{t("rolesFootnote")}
					</p>
					<AssetOwners
						rows={data.assetRows.filter((a) => a.status !== "retired")}
						title={t("assetOwnersTitle")}
						lead={t("assetOwnersLead")}
						gapLabel={(n) => t("assetOwnersGap", { n })}
						countLabel={(n) => t("assetOwnersCount", { n })}
					/>
				</section>
			)}

			{"objectives" in data && (
				<section className="flex flex-col gap-4">
					<div className="flex items-start justify-between gap-3">
						<p className="text-muted-foreground text-subhead">
							{t("objectivesLead")}
						</p>
						{canEdit && (
							<ObjectiveForm
								members={members}
								frameworks={orgFws}
								soloHint={memberCount <= 1}
							/>
						)}
					</div>
					{data.objectives.length === 0 ? (
						<p className="text-subhead">{t("objectivesEmpty")}</p>
					) : (
						<ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
							{data.objectives.map((o, idx) => {
								const ind = indicatorState(
									{
										direction: o.direction,
										targetValue: o.targetValue,
										warnAt: o.warnAt,
										alertAt: o.alertAt,
										nextMeasureAt:
											o.approvalStatus === "approved" ? o.nextMeasureAt : null,
									},
									o.measurements,
									today,
								);
								const hasNumbers =
									o.targetValue !== null ||
									o.warnAt !== null ||
									o.alertAt !== null;
								const fmtN = (v: number | null) =>
									v === null
										? "—"
										: `${fmtNum.format(v)}${o.unit ? ` ${o.unit}` : ""}`;
								const req = data.objRequests[idx] ?? null;
								const me = data.candidates.find((c) => c.userId === ctx.userId);
								const step = req?.steps.find(
									(x) => x.order === req.currentStep,
								);
								const eligible = Boolean(
									req &&
										req.status === "pending" &&
										step &&
										me &&
										canDecideNow(
											step,
											me,
											{
												requesterUserId: req.requestedByUserId,
												entityOwnerUserId: o.ownerUserId,
												delegations: data.dels,
											},
											data.candidates,
											req.decisions.filter((d) => d.step === req.currentStep),
										),
								);
								return (
									<li
										key={o.id}
										className="flex flex-col gap-2 rounded-2xl bg-card p-3 text-subhead"
									>
										<div className="flex items-start justify-between gap-2">
											<div className="min-w-0">
												<p className="font-medium">{o.title}</p>
												<p className="text-muted-foreground text-footnote">
													{o.kpiName ?? "—"}
													{o.target ? ` · ${t("target")}: ${o.target}` : ""}
													{o.dueAt
														? ` · ${t("dueAt")}: ${fmtDate.format(new Date(o.dueAt))}`
														: ""}
												</p>
											</div>
											<div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
												{o.indicatorType && (
													<Badge variant="outline">
														{o.indicatorType.toUpperCase()}
													</Badge>
												)}
												{o.approvalStatus !== "approved" && (
													<Badge
														variant={
															o.approvalStatus === "rejected"
																? "destructive"
																: "warning"
														}
													>
														{t(`approval_${o.approvalStatus}`)}
													</Badge>
												)}
												<Badge
													variant={
														o.status === "achieved"
															? "success"
															: o.status === "at_risk"
																? "destructive"
																: o.status === "on_track"
																	? "default"
																	: "muted"
													}
												>
													{t(`obj_${o.status}`)}
												</Badge>
												{canEdit && (
													<ObjectiveForm
														members={members}
														frameworks={orgFws}
														soloHint={memberCount <= 1}
														initial={{
															id: o.id,
															title: o.title,
															frameworkIds: o.frameworkIds,
															kpiName: o.kpiName,
															unit: o.unit,
															target: o.target,
															dueAt: o.dueAt,
															ownerUserId: o.ownerUserId,
															status: o.status,
															indicatorType: o.indicatorType,
															direction: o.direction,
															targetValue: o.targetValue,
															warnAt: o.warnAt,
															alertAt: o.alertAt,
															measureEveryMonths: o.measureEveryMonths,
															nextMeasureAt: o.nextMeasureAt,
															templateKey: o.templateKey,
														}}
													/>
												)}
											</div>
										</div>
										{hasNumbers && (
											<div className="flex flex-wrap items-center gap-2">
												<Badge variant={INDICATOR_TONE[ind.state]}>
													{t(`ind_${ind.state}`)}
												</Badge>
												{ind.latest !== null && (
													<span className="font-medium tabular-nums">
														{fmtN(ind.latest)}
													</span>
												)}
												{ind.trend && (
													<span className="text-muted-foreground text-footnote">
														{t(`trend_${ind.trend}`)}
													</span>
												)}
												<Sparkline
													points={ind.series}
													max={Math.max(
														...ind.series,
														o.targetValue ?? 0,
														o.warnAt ?? 0,
														o.alertAt ?? 0,
														1,
													)}
													title={o.kpiName ?? o.title}
												/>
											</div>
										)}
										{hasNumbers && (
											<p className="text-muted-foreground text-footnote tabular-nums">
												{t("thresholds", {
													target: fmtN(o.targetValue),
													warn: fmtN(o.warnAt),
													alert: fmtN(o.alertAt),
												})}
												{o.measureEveryMonths
													? ` · ${t("measureEveryMonths", { n: o.measureEveryMonths })}`
													: ""}
											</p>
										)}
										{o.approvalStatus === "approved" && o.nextMeasureAt && (
											<p
												className={
													o.nextMeasureAt < today
														? "text-destructive text-footnote"
														: "text-muted-foreground text-footnote"
												}
											>
												{t(
													o.nextMeasureAt < today
														? "nextMeasureOverdue"
														: "nextMeasure",
													{ date: fmtDate.format(new Date(o.nextMeasureAt)) },
												)}
											</p>
										)}
										{o.approvalStatus !== "approved" && (
											<p className="text-muted-foreground text-footnote">
												{t("objectiveNotApproved")}
											</p>
										)}
										<div className="flex flex-wrap items-end gap-1">
											{o.measurements.slice(-8).map((m) => (
												<span
													key={m.id}
													className="rounded-sm border px-1.5 py-0.5 text-footnote"
													title={m.note ?? ""}
												>
													{fmtDate.format(new Date(m.measuredAt))}:{" "}
													<span className="font-medium">{m.value}</span>
												</span>
											))}
											{o.measurements.length === 0 && (
												<span className="text-muted-foreground text-footnote">
													{t("noMeasurements")}
												</span>
											)}
										</div>
										{req && (
											<ApprovalBar
												data={{
													...req,
													decisions: req.decisions.map((d) => ({
														step: d.step,
														approverUserId: d.approverUserId,
														decision: d.decision,
														note: d.note,
														decidedAt: d.decidedAt,
													})),
												}}
												names={data.names}
												eligible={eligible}
												currentUserId={ctx.userId}
											/>
										)}
										<div className="flex flex-wrap items-center justify-between gap-2">
											<UserChip name={o.ownerName} />
											{canEdit && (
												<MeasurementForm
													objectiveId={o.id}
													unit={o.unit}
													suggestion={
														data.indicatorData
															? suggestMeasurement(
																	objectiveTemplateKey(o),
																	data.indicatorData,
																)
															: null
													}
												/>
											)}
										</div>
									</li>
								);
							})}
						</ul>
					)}
				</section>
			)}

			{"comms" in data && (
				<section className="flex flex-col gap-4">
					<div className="flex flex-wrap items-start justify-between gap-3">
						<p className="text-muted-foreground text-subhead">
							{t("communicationLead")}
						</p>
						<div className="flex gap-2">
							<Link
								href="/organisation/krisenkontakte"
								className="inline-flex h-8 items-center rounded-full bg-muted px-3 font-medium text-footnote hover:bg-foreground/12"
							>
								{t("crisisSheet")}
							</Link>
							{canEdit && (
								<CommunicationForm
									members={members}
									parties={data.parties.map((p) => ({
										id: p.id,
										name: p.name,
									}))}
									functionLabels={functionLabels}
								/>
							)}
						</div>
					</div>
					{data.comms.length === 0 ? (
						<p className="text-subhead">{t("communicationEmpty")}</p>
					) : (
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead className="w-24">{t("trigger")}</TableHead>
									<TableHead>{t("topic")}</TableHead>
									<TableHead>{t("audience")}</TableHead>
									<TableHead>{t("channel")}</TableHead>
									<TableHead className="w-28">{t("frequency")}</TableHead>
									<TableHead className="w-40">{t("ownerFunction")}</TableHead>
									<TableHead className="w-20" />
								</TableRow>
							</TableHeader>
							<TableBody>
								{data.comms.map((c) => (
									<TableRow key={c.id}>
										<TableCell>
											<Badge
												variant={
													c.trigger === "crisis"
														? "destructive"
														: c.trigger === "incident"
															? "warning"
															: "outline"
												}
											>
												{t(`trigger_${c.trigger}`)}
											</Badge>
										</TableCell>
										<TableCell>
											<p className="font-medium">{c.topic}</p>
											{c.purpose && (
												<p className="text-muted-foreground text-footnote">
													{c.purpose}
												</p>
											)}
											{c.legalBasis && (
												<p className="text-muted-foreground text-footnote">
													{c.legalBasis}
												</p>
											)}
										</TableCell>
										<TableCell className="text-footnote">
											{c.partyName ?? c.audience ?? "—"}
										</TableCell>
										<TableCell className="text-footnote">
											{c.channel ?? "—"}
											{c.contact && (
												<p className="text-muted-foreground">{c.contact}</p>
											)}
										</TableCell>
										<TableCell className="text-footnote">
											{c.frequency ?? "—"}
										</TableCell>
										<TableCell className="text-footnote">
											{c.ownerFunction
												? functionLabels[c.ownerFunction]
												: (c.ownerName ?? "—")}
										</TableCell>
										<TableCell>
											{canEdit && (
												<div className="flex items-center justify-end">
													<CommunicationForm
														members={members}
														parties={data.parties.map((p) => ({
															id: p.id,
															name: p.name,
														}))}
														functionLabels={functionLabels}
														initial={{
															id: c.id,
															topic: c.topic,
															interestedPartyId: c.interestedPartyId,
															audience: c.audience,
															purpose: c.purpose,
															channel: c.channel,
															frequency: c.frequency,
															trigger: c.trigger,
															ownerFunction: c.ownerFunction,
															ownerUserId: c.ownerUserId,
															legalBasis: c.legalBasis,
															contact: c.contact,
														}}
													/>
													<DeleteRowButton
														id={c.id}
														action={deleteCommunication}
														label={t("deleteCommunication")}
													/>
												</div>
											)}
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					)}
				</section>
			)}

			{"interactions" in data && (
				<section className="flex flex-col gap-4">
					<div className="flex items-start justify-between gap-3">
						<p className="text-muted-foreground text-subhead">
							{t("regulatorLead")}
						</p>
						{canEdit && <RegulatorInteractionForm members={members} />}
					</div>
					{data.interactions.length === 0 ? (
						<p className="text-subhead">{t("regulatorEmpty")}</p>
					) : (
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead className="w-28">{t("date")}</TableHead>
									<TableHead className="w-32">{t("authority")}</TableHead>
									<TableHead>{t("subject")}</TableHead>
									<TableHead className="w-28">{t("deadline")}</TableHead>
									<TableHead className="w-36">{t("owner")}</TableHead>
									<TableHead className="w-28">{t("status")}</TableHead>
									<TableHead className="w-16" />
								</TableRow>
							</TableHeader>
							<TableBody>
								{data.interactions.map((r) => (
									<TableRow key={r.id}>
										<TableCell>{fmtDate.format(new Date(r.date))}</TableCell>
										<TableCell>
											<Badge variant="outline">
												{t(`authority_${r.authority}`)}
											</Badge>
											<p className="text-muted-foreground text-footnote">
												{t(`direction_${r.direction}`)}
											</p>
										</TableCell>
										<TableCell>
											<p className="font-medium">{r.subject}</p>
											{r.notes && (
												<p className="text-muted-foreground text-footnote">
													{r.notes}
												</p>
											)}
										</TableCell>
										<TableCell
											className={
												r.deadline && r.deadline < today && r.status === "open"
													? "text-destructive"
													: ""
											}
										>
											{r.deadline ? fmtDate.format(new Date(r.deadline)) : "—"}
										</TableCell>
										<TableCell>
											<UserChip name={r.ownerName} />
										</TableCell>
										<TableCell>
											<Badge
												variant={
													r.status === "open"
														? "warning"
														: r.status === "answered"
															? "default"
															: "muted"
												}
											>
												{t(`ristatus_${r.status}`)}
											</Badge>
										</TableCell>
										<TableCell>
											{canEdit && (
												<RegulatorInteractionForm
													members={members}
													initial={{
														id: r.id,
														authority: r.authority,
														date: r.date,
														subject: r.subject,
														direction: r.direction,
														deadline: r.deadline,
														responseAt: r.responseAt,
														ownerUserId: r.ownerUserId,
														notes: r.notes,
														status: r.status,
													}}
												/>
											)}
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					)}
				</section>
			)}

			{"conflicts" in data && (
				<section className="flex flex-col gap-4">
					<div className="flex items-start justify-between gap-3">
						<p className="text-muted-foreground text-subhead">
							{t("conflictsLead")}
						</p>
						{canEdit && <ConflictForm members={members} />}
					</div>
					{data.conflicts.length === 0 ? (
						<p className="text-subhead">{t("conflictsEmpty")}</p>
					) : (
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>{t("titleField")}</TableHead>
									<TableHead>{t("partiesInvolved")}</TableHead>
									<TableHead>{t("mitigation")}</TableHead>
									<TableHead className="w-28">{t("disclosedAt")}</TableHead>
									<TableHead className="w-28">{t("status")}</TableHead>
									<TableHead className="w-16" />
								</TableRow>
							</TableHeader>
							<TableBody>
								{data.conflicts.map((c) => (
									<TableRow key={c.id}>
										<TableCell>
											<p className="font-medium">{c.title}</p>
											{c.type && (
												<p className="text-muted-foreground text-footnote">
													{c.type}
												</p>
											)}
										</TableCell>
										<TableCell className="text-footnote">
											{c.partiesInvolved ?? "—"}
										</TableCell>
										<TableCell className="text-footnote">
											{c.mitigation ?? "—"}
										</TableCell>
										<TableCell>
											{c.disclosedAt
												? fmtDate.format(new Date(c.disclosedAt))
												: "—"}
										</TableCell>
										<TableCell>
											<Badge
												variant={
													c.status === "open"
														? "warning"
														: c.status === "mitigated"
															? "success"
															: "muted"
												}
											>
												{t(`coistatus_${c.status}`)}
											</Badge>
										</TableCell>
										<TableCell>
											{canEdit && (
												<ConflictForm
													members={members}
													initial={{
														id: c.id,
														title: c.title,
														type: c.type,
														partiesInvolved: c.partiesInvolved,
														description: c.description,
														mitigation: c.mitigation,
														disclosedAt: c.disclosedAt,
														ownerUserId: c.ownerUserId,
														reviewAt: c.reviewAt,
														status: c.status,
													}}
												/>
											)}
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					)}
				</section>
			)}

			{"shareholders" in data && (
				<section className="flex flex-col gap-4">
					<div className="flex items-start justify-between gap-3">
						<p className="text-muted-foreground text-subhead">{tsh("lead")}</p>
						{canShareholders && <ShareholderForm />}
					</div>
					{(() => {
						const rows = data.shareholders.map((x) => ({
							...x,
							sharePctN: x.sharePct === null ? null : Number(x.sharePct),
							votingPctN: x.votingPct === null ? null : Number(x.votingPct),
						}));
						const gaps = shareholderGaps(
							rows.map((x) => ({
								name: x.name,
								sharePct: x.sharePctN,
								votingPct: x.votingPctN,
								inhaberkontrolleStatus: x.inhaberkontrolleStatus,
								notifiedAt: x.notifiedAt,
								approvedAt: x.approvedAt,
								sanctionsCheckedAt: x.sanctionsCheckedAt,
							})),
						);
						const total = totalSharePct(
							rows.map((x) => ({ sharePct: x.sharePctN })),
						);
						return (
							<>
								<div className="flex flex-wrap gap-2 text-subhead">
									<Badge variant={total > 100 ? "destructive" : "outline"}>
										{tsh("total", { pct: total })}
									</Badge>
									<Badge variant={gaps.length > 0 ? "warning" : "success"}>
										{tsh("gaps", { n: gaps.length })}
									</Badge>
								</div>
								{gaps.length > 0 && (
									<ul className="list-disc rounded-2xl bg-card p-3 pl-7 text-subhead">
										{gaps.map((g) => (
											<li key={`${g.name}-${g.kind}`}>
												<span className="font-medium">{g.name}</span>:{" "}
												{g.detail}
											</li>
										))}
									</ul>
								)}
								{rows.length === 0 ? (
									<p className="text-subhead">{tsh("empty")}</p>
								) : (
									<Table>
										<TableHeader>
											<TableRow>
												<TableHead>{tsh("name")}</TableHead>
												<TableHead className="w-24 text-right">
													{tsh("sharePct")}
												</TableHead>
												<TableHead className="w-24 text-right">
													{tsh("votingPct")}
												</TableHead>
												<TableHead className="w-24">
													{tsh("threshold")}
												</TableHead>
												<TableHead className="w-44">{tsh("status")}</TableHead>
												<TableHead className="w-32">
													{tsh("deadline")}
												</TableHead>
												<TableHead className="w-28">
													{tsh("sanctionsCheckedAt")}
												</TableHead>
												<TableHead className="w-24">{tsh("actions")}</TableHead>
											</TableRow>
										</TableHeader>
										<TableBody>
											{rows.map((x, i) => {
												const due =
													x.inhaberkontrolleStatus === "pending" && x.notifiedAt
														? inhaberkontrolleDeadline(
																new Date(`${x.notifiedAt}T00:00:00Z`),
															)
														: null;
												return (
													<TableRow key={x.id}>
														<TableCell>
															<p className="font-medium">
																{x.name}{" "}
																{x.isLegalPerson && (
																	<Badge variant="outline">
																		{tsh("legalPerson")}
																	</Badge>
																)}
															</p>
															{data.ubo[i] && (
																<p className="line-clamp-2 text-muted-foreground text-footnote">
																	{tsh("uboChain")}: {data.ubo[i]}
																</p>
															)}
														</TableCell>
														<TableCell className="text-right">
															{x.sharePctN === null ? "—" : `${x.sharePctN} %`}
														</TableCell>
														<TableCell className="text-right">
															{x.votingPctN === null
																? "—"
																: `${x.votingPctN} %`}
														</TableCell>
														<TableCell>
															{x.thresholdCrossed ? (
																<Badge variant="warning">
																	≥ {x.thresholdCrossed} %
																</Badge>
															) : (
																<span className="text-muted-foreground text-footnote">
																	—
																</span>
															)}
														</TableCell>
														<TableCell>
															<Badge
																variant={
																	x.inhaberkontrolleStatus === "approved"
																		? "success"
																		: x.inhaberkontrolleStatus === "pending"
																			? "warning"
																			: x.inhaberkontrolleStatus === "rejected"
																				? "destructive"
																				: "muted"
																}
															>
																{tsh(`status_${x.inhaberkontrolleStatus}`)}
															</Badge>
														</TableCell>
														<TableCell className="text-footnote">
															{due ? (
																<Badge
																	variant={
																		due < new Date() ? "destructive" : "outline"
																	}
																>
																	{fmtDate.format(due)}
																</Badge>
															) : (
																"—"
															)}
														</TableCell>
														<TableCell className="text-footnote">
															{x.sanctionsCheckedAt
																? fmtDate.format(
																		new Date(
																			`${x.sanctionsCheckedAt}T00:00:00Z`,
																		),
																	)
																: "—"}
														</TableCell>
														<TableCell>
															{canShareholders && (
																<div className="flex items-center gap-1">
																	<ShareholderForm
																		initial={{
																			id: x.id,
																			name: x.name,
																			isLegalPerson: x.isLegalPerson,
																			sharePct: x.sharePct ?? "",
																			votingPct: x.votingPct ?? "",
																			uboChain: data.ubo[i] ?? "",
																			inhaberkontrolleStatus:
																				x.inhaberkontrolleStatus,
																			notifiedAt: x.notifiedAt,
																			approvedAt: x.approvedAt,
																			sanctionsCheckedAt: x.sanctionsCheckedAt,
																		}}
																	/>
																	<DeleteRowButton
																		id={x.id}
																		action={deleteShareholder}
																		label={tsh("delete")}
																	/>
																</div>
															)}
														</TableCell>
													</TableRow>
												);
											})}
										</TableBody>
									</Table>
								)}
								<p className="text-muted-foreground text-footnote">
									{tsh("hint")}
								</p>
							</>
						);
					})()}
				</section>
			)}

			{"siteRows" in data && (
				<section className="flex flex-col gap-4">
					<p className="text-muted-foreground text-subhead">{t("sitesLead")}</p>
					<SitesStep
						sites={data.siteRows.map((x) => ({
							id: x.id,
							name: x.name,
							kind: x.kind,
							country: x.country,
							city: x.city,
							employees: x.employees,
							critical: x.critical,
						}))}
						defaultCountry="DE"
						canEdit={allows(ctx, { asset: ["create", "delete"] })}
						canRisk={allows(ctx, { risk: ["create"] })}
					/>
				</section>
			)}

			{"policies" in data && (
				<section className="flex flex-col gap-4">
					<div className="flex items-start justify-between gap-3">
						<p className="text-muted-foreground text-subhead">{tin("lead")}</p>
						{canEdit && <InsuranceForm members={members} />}
					</div>
					{data.policies.length === 0 ? (
						<p className="text-subhead">{tin("empty")}</p>
					) : (
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead className="w-36">{tin("type")}</TableHead>
									<TableHead>{tin("insurer")}</TableHead>
									<TableHead className="w-36 text-right">
										{tin("coverageLimit")}
									</TableHead>
									<TableHead className="w-56">{tin("subLimits")}</TableHead>
									<TableHead className="w-40">{tin("validity")}</TableHead>
									<TableHead className="w-36">{tin("owner")}</TableHead>
									<TableHead className="w-24">{tin("actions")}</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{data.policies.map((p) => {
									const state = insuranceState(p.validUntil, new Date());
									return (
										<TableRow key={p.id}>
											<TableCell>
												<Badge variant="outline">{tin(`type_${p.type}`)}</Badge>
											</TableCell>
											<TableCell>
												<p className="font-medium">{p.insurer}</p>
												{p.policyRef && (
													<p className="font-mono text-muted-foreground text-footnote">
														{p.policyRef}
													</p>
												)}
												{p.exclusions && (
													<p className="line-clamp-2 text-muted-foreground text-footnote">
														{tin("exclusions")}: {p.exclusions}
													</p>
												)}
											</TableCell>
											<TableCell className="text-right">
												{p.coverageLimit
													? new Intl.NumberFormat("de-DE", {
															style: "currency",
															currency: "EUR",
															maximumFractionDigits: 0,
														}).format(Number(p.coverageLimit))
													: "—"}
											</TableCell>
											<TableCell className="text-footnote">
												{Object.entries(p.subLimits ?? {})
													.map(
														([k, v]) =>
															`${k}: ${new Intl.NumberFormat("de-DE").format(v)} €`,
													)
													.join(" · ") || "—"}
											</TableCell>
											<TableCell>
												<Badge
													variant={
														state === "expired"
															? "destructive"
															: state === "expiring"
																? "warning"
																: state === "active"
																	? "success"
																	: "muted"
													}
												>
													{tin(`state_${state}`)}
												</Badge>
												{p.validUntil && (
													<p className="text-footnote text-muted-foreground">
														{tin("until")}{" "}
														{fmtDate.format(
															new Date(`${p.validUntil}T00:00:00Z`),
														)}
													</p>
												)}
											</TableCell>
											<TableCell>
												<UserChip name={p.ownerName} />
											</TableCell>
											<TableCell>
												{canEdit && (
													<div className="flex items-center gap-1">
														<InsuranceForm
															members={members}
															initial={{
																id: p.id,
																type: p.type,
																insurer: p.insurer,
																policyRef: p.policyRef,
																coverageLimit: p.coverageLimit ?? "",
																subLimits: Object.entries(p.subLimits ?? {})
																	.map(([k, v]) => `${k}=${v}`)
																	.join("; "),
																exclusions: p.exclusions,
																validFrom: p.validFrom,
																validUntil: p.validUntil,
																premium: p.premium ?? "",
																ownerUserId: p.ownerUserId,
															}}
														/>
														<DeleteRowButton
															id={p.id}
															action={deleteInsurancePolicy}
															label={tin("delete")}
														/>
													</div>
												)}
											</TableCell>
										</TableRow>
									);
								})}
							</TableBody>
						</Table>
					)}
					<p className="text-muted-foreground text-footnote">{tin("hint")}</p>
				</section>
			)}
		</>
	);
}

// Asset-Verantwortliche (ISO 27001 A.5.9): wer für wie viele Assets
// verantwortlich ist, und welche Assets noch niemandem gehören.
function AssetOwners({
	rows,
	title,
	lead,
	gapLabel,
	countLabel,
}: {
	rows: { id: string; ownerUserId: string | null; ownerName: string | null }[];
	title: string;
	lead: string;
	gapLabel: (n: number) => string;
	countLabel: (n: number) => string;
}) {
	const byOwner = new Map<string, { name: string; n: number }>();
	for (const a of rows) {
		if (!a.ownerUserId) continue;
		const e = byOwner.get(a.ownerUserId) ?? { name: a.ownerName ?? "—", n: 0 };
		e.n += 1;
		byOwner.set(a.ownerUserId, e);
	}
	const unowned = rows.filter((a) => !a.ownerUserId).length;
	return (
		<div className="flex flex-col gap-2 rounded-2xl bg-card p-3 text-subhead">
			<h3 className="font-medium">{title}</h3>
			<p className="text-muted-foreground text-footnote">{lead}</p>
			{unowned > 0 && (
				<Link
					href="/assets?unowned=1"
					className="w-fit rounded-xl bg-warning/12 px-2 py-1 text-warning text-footnote hover:underline"
				>
					{gapLabel(unowned)}
				</Link>
			)}
			<ul className="flex flex-wrap gap-2">
				{[...byOwner.entries()]
					.sort((a, b) => b[1].n - a[1].n)
					.map(([userId, e]) => (
						<li key={userId}>
							<Link
								href={`/team/${userId}`}
								className="inline-flex items-center gap-1 rounded-xl bg-card px-2 py-1 text-footnote hover:bg-muted"
							>
								{e.name}
								<span className="text-muted-foreground">
									· {countLabel(e.n)}
								</span>
							</Link>
						</li>
					))}
			</ul>
		</div>
	);
}
