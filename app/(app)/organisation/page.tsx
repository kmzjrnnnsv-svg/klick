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
import { UrlTabs } from "@/components/entity/url-tabs";
import { UserChip } from "@/components/entity/user-chip";
import {
	ApplyGovernanceSeedButton,
	CommunicationForm,
	ConflictForm,
	ContextIssueForm,
	DeleteRowButton,
	PartyForm,
	RegulatorInteractionForm,
} from "@/components/organisation/governance-forms";
import {
	MeasurementForm,
	ObjectiveForm,
	RoleAssignmentForm,
	ScopeApproveButton,
	ScopeForm,
} from "@/components/organisation/roles-forms";
import { PageHeader } from "@/components/page-header";
import { InsuranceForm } from "@/components/privacy/privacy-forms";
import { Badge } from "@/components/ui/badge";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { ROLE_FUNCTIONS } from "@/db/schema/enums";
import { approverEligibility } from "@/lib/approvals/rules";
import {
	activeDelegations,
	latestRequestFor,
	loadCandidates,
} from "@/lib/approvals/service";
import { requireOrg, toOrgCtx } from "@/lib/auth/guards";
import { listOrgMembers } from "@/lib/auth/org";
import { roleAllows } from "@/lib/auth/permissions";
import { fmtDate, shortFrameworkName } from "@/lib/compliance/page-data";
import { insuranceState } from "@/lib/compliance/privacy";
import {
	getOrgProfile,
	listMembersForPicker,
	userNames,
} from "@/lib/compliance/queries";
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
] as const;

export default async function OrganisationPage({
	searchParams,
}: {
	searchParams: Promise<Search>;
}) {
	const ctx = await requireOrg({ organisation: ["read"] });
	const sp = await searchParams;
	const tab = (TABS as readonly string[]).includes(one(sp.tab) ?? "")
		? (one(sp.tab) as (typeof TABS)[number])
		: "kontext";
	const t = await getTranslations("Organisation");
	const tf = await getTranslations("Functions");
	const ta = await getTranslations("Approvals");
	const canEdit = roleAllows(ctx.orgRole, { organisation: ["update"] });
	const canRoles = roleAllows(ctx.orgRole, { role_assignment: ["update"] });
	const canShareholders = roleAllows(ctx.orgRole, { shareholder: ["update"] });
	const tsh = await getTranslations("Shareholders");
	const tin = await getTranslations("Insurance");
	const memberCount = (await listOrgMembers(ctx.orgId)).length;

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
				return { ...base, checklists };
			}
			case "ziele":
				return { ...base, objectives: await listObjectives(tx, ctx.orgId) };
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
				<div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
					<section className="flex flex-col gap-3">
						<div className="flex items-start justify-between gap-3">
							<div>
								<h2 className="lv-eyebrow text-[0.6rem] text-muted-foreground">
									{t("issues")}
								</h2>
								<p className="mt-1 text-muted-foreground text-xs">
									{t("issuesLead")}
								</p>
							</div>
							{canEdit && <ContextIssueForm members={members} />}
						</div>
						{data.issues.length === 0 ? (
							<p className="text-muted-foreground text-sm">
								{t("issuesEmpty")}
							</p>
						) : (
							<ul className="flex flex-col divide-y divide-border/60 rounded-md border text-sm">
								{data.issues.map((i) => (
									<li key={i.id} className="flex items-start gap-3 px-3 py-2">
										<Badge variant="outline" className="mt-0.5 shrink-0">
											{t(`scope_${i.scope}`)}
										</Badge>
										<div className="min-w-0 flex-1">
											<p className="font-medium">{i.title}</p>
											{i.description && (
												<p className="text-muted-foreground text-xs">
													{i.description}
												</p>
											)}
											{i.impact && (
												<p className="text-xs">
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
								<h2 className="lv-eyebrow text-[0.6rem] text-muted-foreground">
									{t("parties")}
								</h2>
								<p className="mt-1 text-muted-foreground text-xs">
									{t("partiesLead")}
								</p>
							</div>
							{canEdit && <PartyForm members={members} />}
						</div>
						{data.parties.length === 0 ? (
							<p className="text-muted-foreground text-sm">
								{t("partiesEmpty")}
							</p>
						) : (
							<ul className="flex flex-col divide-y divide-border/60 rounded-md border text-sm">
								{data.parties.map((p) => (
									<li key={p.id} className="flex items-start gap-3 px-3 py-2">
										<Badge
											variant="outline"
											className="mt-0.5 shrink-0 normal-case tracking-normal"
										>
											{t(`party_${p.type}`)}
										</Badge>
										<div className="min-w-0 flex-1">
											<p className="font-medium">{p.name}</p>
											{p.expectations && (
												<p className="text-muted-foreground text-xs">
													{p.expectations}
												</p>
											)}
											{p.howAddressed && (
												<p className="text-xs">
													<span className="text-muted-foreground">
														{t("howAddressed")}:{" "}
													</span>
													{p.howAddressed}
												</p>
											)}
											{p.relevantFrameworks.length > 0 && (
												<p className="mt-1 flex flex-wrap gap-1">
													{p.relevantFrameworks.map((f) => (
														<Badge
															key={f}
															variant="muted"
															className="normal-case tracking-normal"
														>
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
						<p className="text-muted-foreground text-sm">{t("scopeLead")}</p>
						{canEdit && <ScopeForm members={members} frameworks={orgFws} />}
					</div>
					{data.scopes.length === 0 ? (
						<p className="text-sm">{t("scopeEmpty")}</p>
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
									approverEligibility(
										step,
										me,
										{
											requesterUserId: req.requestedByUserId,
											entityOwnerUserId: s.ownerUserId,
											delegations: data.dels,
										},
										data.candidates,
									).eligible,
							);
							return (
								<article
									key={s.id}
									className="flex flex-col gap-3 rounded-md border p-4 text-sm"
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
										<span className="ml-auto text-muted-foreground text-xs">
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
										<p className="text-muted-foreground text-xs">
											<span className="font-medium">{t("boundaries")}:</span>{" "}
											{s.boundaries}
										</p>
									)}
									<div className="flex flex-wrap gap-4 text-xs">
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
											<p className="lv-eyebrow text-[0.52rem] text-muted-foreground">
												{t("exclusions")}
											</p>
											<ul className="mt-1 list-disc pl-5 text-xs">
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
											labels={{
												title: ta("bar"),
												step: (n) => ta("step", { n }),
												dueAt: ta("dueAt"),
												overdue: ta("overdue"),
												selfApproved: ta("selfApproved"),
												history: ta("history"),
												status: (x) => x,
											}}
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
					<div className="flex items-start justify-between gap-3">
						<p className="text-muted-foreground text-sm">{t("rolesLead")}</p>
						{canRoles && (
							<RoleAssignmentForm
								members={members}
								functionLabels={functionLabels}
							/>
						)}
					</div>
					{gov.sod.length > 0 && (
						<div className="flex flex-col gap-1 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
							<p className="font-medium">{t("sodTitle")}</p>
							<ul className="list-disc pl-5 text-xs">
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
												<p className="text-muted-foreground text-xs">
													{it.required.hint}
												</p>
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
												<span className="text-warning text-xs">
													{t("deputyMissing")}
												</span>
											) : (
												<span className="text-muted-foreground">—</span>
											)}
										</TableCell>
										<TableCell>
											{a ? (
												<div className="flex flex-col gap-0.5 text-xs">
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
										<TableCell className="text-muted-foreground text-xs">
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
											<TableCell>{functionLabels[a.function]}</TableCell>
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
											<TableCell className="text-xs">
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
					<p className="text-muted-foreground text-xs">{t("rolesFootnote")}</p>
				</section>
			)}

			{"objectives" in data && (
				<section className="flex flex-col gap-4">
					<div className="flex items-start justify-between gap-3">
						<p className="text-muted-foreground text-sm">
							{t("objectivesLead")}
						</p>
						{canEdit && <ObjectiveForm members={members} frameworks={orgFws} />}
					</div>
					{data.objectives.length === 0 ? (
						<p className="text-sm">{t("objectivesEmpty")}</p>
					) : (
						<ul className="grid gap-3 md:grid-cols-2">
							{data.objectives.map((o) => (
								<li
									key={o.id}
									className="flex flex-col gap-2 rounded-md border p-3 text-sm"
								>
									<div className="flex items-start justify-between gap-2">
										<div className="min-w-0">
											<p className="font-medium">{o.title}</p>
											<p className="text-muted-foreground text-xs">
												{o.kpiName ?? "—"}
												{o.target
													? ` · ${t("target")}: ${o.target}${o.unit ? ` ${o.unit}` : ""}`
													: ""}
												{o.dueAt
													? ` · ${t("dueAt")}: ${fmtDate.format(new Date(o.dueAt))}`
													: ""}
											</p>
										</div>
										<div className="flex shrink-0 items-center gap-1">
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
													}}
												/>
											)}
										</div>
									</div>
									<div className="flex flex-wrap items-end gap-1">
										{o.measurements.slice(-8).map((m) => (
											<span
												key={m.id}
												className="rounded-sm border px-1.5 py-0.5 text-xs"
												title={m.note ?? ""}
											>
												{fmtDate.format(new Date(m.measuredAt))}:{" "}
												<span className="font-medium">{m.value}</span>
											</span>
										))}
										{o.measurements.length === 0 && (
											<span className="text-muted-foreground text-xs">
												{t("noMeasurements")}
											</span>
										)}
									</div>
									<div className="flex items-center justify-between gap-2">
										<UserChip name={o.ownerName} />
										{canEdit && (
											<MeasurementForm objectiveId={o.id} unit={o.unit} />
										)}
									</div>
								</li>
							))}
						</ul>
					)}
				</section>
			)}

			{"comms" in data && (
				<section className="flex flex-col gap-4">
					<div className="flex flex-wrap items-start justify-between gap-3">
						<p className="text-muted-foreground text-sm">
							{t("communicationLead")}
						</p>
						<div className="flex gap-2">
							<Link
								href="/organisation/krisenkontakte"
								className="inline-flex h-8 items-center rounded-md border px-3 text-xs hover:bg-muted"
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
						<p className="text-sm">{t("communicationEmpty")}</p>
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
												<p className="text-muted-foreground text-xs">
													{c.purpose}
												</p>
											)}
											{c.legalBasis && (
												<p className="text-muted-foreground text-[0.65rem]">
													{c.legalBasis}
												</p>
											)}
										</TableCell>
										<TableCell className="text-xs">
											{c.partyName ?? c.audience ?? "—"}
										</TableCell>
										<TableCell className="text-xs">
											{c.channel ?? "—"}
											{c.contact && (
												<p className="text-muted-foreground">{c.contact}</p>
											)}
										</TableCell>
										<TableCell className="text-xs">
											{c.frequency ?? "—"}
										</TableCell>
										<TableCell className="text-xs">
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
						<p className="text-muted-foreground text-sm">
							{t("regulatorLead")}
						</p>
						{canEdit && <RegulatorInteractionForm members={members} />}
					</div>
					{data.interactions.length === 0 ? (
						<p className="text-sm">{t("regulatorEmpty")}</p>
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
											<p className="text-muted-foreground text-[0.65rem]">
												{t(`direction_${r.direction}`)}
											</p>
										</TableCell>
										<TableCell>
											<p className="font-medium">{r.subject}</p>
											{r.notes && (
												<p className="text-muted-foreground text-xs">
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
						<p className="text-muted-foreground text-sm">
							{t("conflictsLead")}
						</p>
						{canEdit && <ConflictForm members={members} />}
					</div>
					{data.conflicts.length === 0 ? (
						<p className="text-sm">{t("conflictsEmpty")}</p>
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
												<p className="text-muted-foreground text-xs">
													{c.type}
												</p>
											)}
										</TableCell>
										<TableCell className="text-xs">
											{c.partiesInvolved ?? "—"}
										</TableCell>
										<TableCell className="text-xs">
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
						<p className="text-muted-foreground text-sm">{tsh("lead")}</p>
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
								<div className="flex flex-wrap gap-2 text-sm">
									<Badge variant={total > 100 ? "destructive" : "outline"}>
										{tsh("total", { pct: total })}
									</Badge>
									<Badge variant={gaps.length > 0 ? "warning" : "success"}>
										{tsh("gaps", { n: gaps.length })}
									</Badge>
								</div>
								{gaps.length > 0 && (
									<ul className="list-disc rounded-md border border-dashed p-3 pl-7 text-sm">
										{gaps.map((g) => (
											<li key={`${g.name}-${g.kind}`}>
												<span className="font-medium">{g.name}</span>:{" "}
												{g.detail}
											</li>
										))}
									</ul>
								)}
								{rows.length === 0 ? (
									<p className="text-sm">{tsh("empty")}</p>
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
																<p className="line-clamp-2 text-muted-foreground text-xs">
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
																<span className="text-muted-foreground text-xs">
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
														<TableCell className="text-xs">
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
														<TableCell className="text-xs">
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
								<p className="text-muted-foreground text-xs">{tsh("hint")}</p>
							</>
						);
					})()}
				</section>
			)}

			{"policies" in data && (
				<section className="flex flex-col gap-4">
					<div className="flex items-start justify-between gap-3">
						<p className="text-muted-foreground text-sm">{tin("lead")}</p>
						{canEdit && <InsuranceForm members={members} />}
					</div>
					{data.policies.length === 0 ? (
						<p className="text-sm">{tin("empty")}</p>
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
													<p className="font-mono text-muted-foreground text-xs">
														{p.policyRef}
													</p>
												)}
												{p.exclusions && (
													<p className="line-clamp-2 text-muted-foreground text-xs">
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
											<TableCell className="text-xs">
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
													<p className="text-[0.65rem] text-muted-foreground">
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
					<p className="text-muted-foreground text-xs">{tin("hint")}</p>
				</section>
			)}
		</>
	);
}
