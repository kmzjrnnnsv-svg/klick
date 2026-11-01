import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ApprovalBar } from "@/components/approvals/approval-bar";
import { ActivityStream } from "@/components/entity/activity-stream";
import { CommentForm } from "@/components/entity/comment-form";
import {
	EntityLayout,
	MetaItem,
	Section,
} from "@/components/entity/entity-layout";
import { QuickCreateTask } from "@/components/entity/quick-create-task";
import { StatusBadge } from "@/components/entity/status-badge";
import { StatusButton } from "@/components/entity/status-button";
import { UserChip } from "@/components/entity/user-chip";
import { WatchButton } from "@/components/entity/watch-button";
import { withMessages } from "@/components/i18n/with-messages";
import { IncidentClocks } from "@/components/incidents/incident-clocks";
import {
	ClassifyForm,
	IncidentUpdateForm,
	MitigationButton,
} from "@/components/incidents/incident-forms";
import { ManagementAckButton } from "@/components/incidents/management-ack";
import { DecisionRequestsBlock } from "@/components/resolutions/decision-requests-block";
import { SourceRisksBlock } from "@/components/risks/source-risks";
import { Badge } from "@/components/ui/badge";
import type { IncidentRegime } from "@/db/schema/enums";
import { canDecideNow } from "@/lib/approvals/rules";
import {
	activeDelegations,
	latestRequestFor,
	loadCandidates,
} from "@/lib/approvals/service";
import { historyFor } from "@/lib/audit";
import { requireOrgPage } from "@/lib/auth/gates";
import { toOrgCtx } from "@/lib/auth/guards";
import { allows } from "@/lib/auth/permissions";
import {
	computeIncidentDeadlines,
	leadRegime,
} from "@/lib/compliance/incident";
import { managementAckState } from "@/lib/compliance/incident-management";
import { getOrgCoverageCached } from "@/lib/compliance/page-data";
import {
	listComments,
	listMembersForPicker,
	listTasks,
	listWatcherIds,
	userNames,
} from "@/lib/compliance/queries";
import { getIncident } from "@/lib/compliance/queries-p2";
import { listProductOptions } from "@/lib/compliance/queries-products";
import { topManagementOf } from "@/lib/compliance/top-management";
import { readOrg } from "@/lib/db/with-org";
import { TASK_STATUS } from "@/lib/entities/task";
import {
	type ActivityEntry,
	mergeActivity,
	toHistoryItems,
} from "@/lib/history";

const fmt = new Intl.DateTimeFormat("de-DE", {
	dateStyle: "medium",
	timeStyle: "short",
	timeZone: "Europe/Berlin",
});

async function IncidentDetailPage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const { id } = await params;
	if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
	const ctx = await requireOrgPage({ incident: ["read"] });
	const t = await getTranslations("Incidents");
	const tNav = await getTranslations("Nav");
	const te = await getTranslations("Entity");
	const ts = await getTranslations("Status");
	const data = await readOrg(toOrgCtx(ctx), async (tx) => {
		const r = await getIncident(tx, ctx.orgId, id);
		if (!r) return null;
		const [
			comments,
			history,
			watcherIds,
			members,
			tasks,
			approval,
			candidates,
			dels,
		] = await Promise.all([
			listComments(tx, ctx.orgId, "incident", id),
			historyFor(tx, `incident:${id}`),
			listWatcherIds(tx, ctx.orgId, "incident", id),
			listMembersForPicker(tx, ctx.orgId),
			listTasks(tx, ctx.orgId, { entityType: "incident", entityId: id }),
			latestRequestFor(tx, ctx.orgId, "incident", id),
			loadCandidates(tx, ctx.orgId),
			activeDelegations(tx, ctx.orgId),
		]);
		const tm = await topManagementOf(tx, ctx.orgId, ctx.userId);
		const names = await userNames(tx, [
			r.incident.managementAcknowledgedBy,
			...history.map((h) => h.actorUserId),
			...comments.map((c) => c.authorUserId),
			...(approval?.decisions.map((x) => x.approverUserId) ?? []),
		]);
		for (const [k, v] of r.names) names.set(k, v);
		return {
			...r,
			comments,
			history,
			watcherIds,
			members,
			tasks,
			approval,
			candidates,
			dels,
			names,
			isTopManagement: tm.isTopManagement,
		};
	});
	if (!data) notFound();
	const {
		incident,
		updates,
		comments,
		history,
		watcherIds,
		members,
		tasks,
		approval,
		candidates,
		dels,
		names,
	} = data;
	const canEdit = allows(ctx, { incident: ["update"] });
	// Geschäftsleitung informiert, Kenntnisnahme offen/erledigt
	const ackState = managementAckState(incident, new Date());
	const regimes = incident.regimes as IncidentRegime[];
	const lead = leadRegime(regimes) ?? "dora";
	const dl = computeIncidentDeadlines(lead, {
		awareAt: incident.awareAt,
		classifiedAt: incident.classifiedAt,
		initialReportedAt: incident.initialReportedAt,
		intermediateReportedAt: incident.intermediateReportedAt,
		mitigationAvailableAt: incident.mitigationAvailableAt,
	});
	// CRA-Regime nur mit aktivem CRA (oder wenn schon gesetzt)
	const cov = await getOrgCoverageCached(ctx);
	const craActive =
		Boolean(cov?.frameworks.includes("cra")) ||
		regimes.some((r) => r.startsWith("cra_"));
	const available: IncidentRegime[] = [
		"dora",
		"nis2",
		...(craActive ? (["cra_vuln", "cra_incident"] as const) : []),
		"dsgvo",
		"gwg_sar",
	];
	const products = craActive
		? await readOrg(toOrgCtx(ctx), (tx) => listProductOptions(tx, ctx.orgId))
		: [];
	const product = products.find((p) => p.id === incident.productId) ?? null;
	const me = candidates.find((c) => c.userId === ctx.userId);
	const step = approval?.steps.find((s) => s.order === approval.currentStep);
	const eligible = Boolean(
		approval &&
			approval.status === "pending" &&
			step &&
			me &&
			canDecideNow(
				step,
				me,
				{
					requesterUserId: approval.requestedByUserId,
					entityOwnerUserId: incident.ownerUserId,
					delegations: dels,
				},
				candidates,
				approval.decisions.filter((d) => d.step === approval.currentStep),
			),
	);

	const entries: ActivityEntry[] = mergeActivity(
		[
			...toHistoryItems(history),
			...updates.map((u) => ({
				id: `u-${u.id}`,
				at: u.createdAt,
				actorUserId: u.authorUserId,
				action: u.body,
				changes: [],
			})),
		],
		comments.map((c) => ({
			type: "comment" as const,
			at: c.createdAt,
			comment: {
				id: c.id,
				authorUserId: c.authorUserId,
				bodyMarkdown: c.bodyMarkdown,
				parentId: c.parentId,
				editedAt: c.editedAt,
			},
		})),
	);

	return (
		<EntityLayout
			back={{ href: "/vorfaelle", label: tNav("incidents") }}
			eyebrow={`${incident.code} · ${regimes.map((r) => t(`regime_${r}`)).join(" · ")}`}
			title={incident.title}
			subtitle={incident.description ?? undefined}
			status={
				<StatusButton
					target={{
						kind: "incident",
						incidentId: incident.id,
						status: incident.status,
					}}
					disabled={!canEdit}
					hideTo={allows(ctx, { incident: ["close"] }) ? [] : ["closed"]}
				/>
			}
			actions={
				<WatchButton
					entityType="incident"
					entityId={incident.id}
					watching={watcherIds.includes(ctx.userId)}
				/>
			}
			meta={
				<>
					<MetaItem label={t("classification")}>
						<Badge
							variant={
								incident.classification === "major"
									? "destructive"
									: incident.classification === "significant"
										? "warning"
										: "muted"
							}
						>
							{t(`class_${incident.classification}`)}
						</Badge>
					</MetaItem>
					{ackState !== "none" && (
						<MetaItem label={t("management")}>
							{ackState === "done" ? (
								<span>
									{t("ackBy", {
										name:
											names.get(incident.managementAcknowledgedBy ?? "") ?? "—",
										date: fmt.format(incident.managementAcknowledgedAt as Date),
									})}
								</span>
							) : (
								<span className="flex flex-wrap items-center gap-2">
									<Badge
										variant={ackState === "overdue" ? "destructive" : "warning"}
										className="h-auto whitespace-normal text-left"
									>
										{t("ackOpen")}
									</Badge>
									{data.isTopManagement && (
										<ManagementAckButton incidentId={incident.id} />
									)}
								</span>
							)}
						</MetaItem>
					)}
					<MetaItem label={t("aware")}>{fmt.format(incident.awareAt)}</MetaItem>
					<MetaItem label={t("owner")}>
						<UserChip name={names.get(incident.ownerUserId ?? "")} />
					</MetaItem>
					<MetaItem label={t("affectsPayments")}>
						{incident.affectsPayments ? "ja" : "nein"}
					</MetaItem>
					{product && (
						<MetaItem label={t("product")}>
							<Link
								href={`/produkte/${product.id}`}
								className="hover:underline"
							>
								{product.code} {product.name}
							</Link>
						</MetaItem>
					)}
				</>
			}
			aside={
				<>
					<SourceRisksBlock ctx={ctx} kind="incident" id={id} />
					<DecisionRequestsBlock ctx={ctx} kind="incident" id={id} />
					<Section title={te("activity")}>
						<CommentForm
							entityType="incident"
							entityId={incident.id}
							link={`/vorfaelle/${incident.id}`}
						/>
						<ActivityStream
							entries={entries}
							names={names}
							labels={{
								empty: te("activityEmpty"),
								changed: te("changed"),
								commented: te("commented"),
								system: te("system"),
							}}
						/>
					</Section>
					<Section
						title={t("actionItems")}
						actions={
							canEdit ? (
								<QuickCreateTask
									entityType="incident"
									entityId={incident.id}
									members={members}
									sourceKind="incident_action"
								/>
							) : null
						}
					>
						{tasks.length === 0 ? (
							<p className="text-muted-foreground text-subhead">
								{te("tasksEmpty")}
							</p>
						) : (
							<ul className="flex flex-col gap-2 text-subhead">
								{tasks.map((task) => (
									<li
										key={task.id}
										className="flex items-start justify-between gap-2 rounded-2xl bg-card p-2"
									>
										<div className="min-w-0">
											<p className="truncate">{task.title}</p>
											<p className="text-muted-foreground text-footnote">
												{task.assigneeName ?? "—"}
												{task.dueAt ? ` · ${task.dueAt}` : ""}
											</p>
										</div>
										<StatusBadge
											machine={TASK_STATUS}
											status={task.status}
											label={ts(TASK_STATUS.labelKey[task.status] as "todo")}
										/>
									</li>
								))}
							</ul>
						)}
					</Section>
				</>
			}
		>
			<Section title={t("clocks")}>
				<IncidentClocks
					incidentId={incident.id}
					regimes={regimes.map((r) => t(`regime_${r}`))}
					clocks={[
						{
							key: "initial",
							label: dl.labels.initial,
							dueAt: incident.initialDueAt ?? dl.initialDueAt,
							reportedAt: incident.initialReportedAt,
						},
						{
							key: "intermediate",
							label: dl.labels.intermediate ?? "",
							dueAt: incident.intermediateDueAt ?? dl.intermediateDueAt,
							reportedAt: incident.intermediateReportedAt,
						},
						{
							key: "final",
							label: dl.labels.final ?? "",
							dueAt: incident.finalDueAt ?? dl.finalDueAt,
							reportedAt: incident.finalReportedAt,
						},
					]}
					labels={{
						done: t("clockDone"),
						overdue: t("clockOverdue"),
						soon: t("clockSoon"),
						due: t("clockDue"),
						markReported: t("markReported"),
						projected: t("projected"),
					}}
					canEdit={canEdit}
					projected={dl.projected}
				/>
				{regimes.includes("cra_vuln") && (
					<div className="mt-3 flex flex-wrap items-center gap-3 text-subhead">
						{incident.mitigationAvailableAt ? (
							<span className="text-muted-foreground">
								{t("mitigationSince", {
									at: fmt.format(incident.mitigationAvailableAt),
								})}
							</span>
						) : (
							<>
								<span className="text-muted-foreground">
									{t("mitigationHint")}
								</span>
								{canEdit && <MitigationButton incidentId={incident.id} />}
							</>
						)}
					</div>
				)}
			</Section>

			{approval && (
				<ApprovalBar
					data={{
						...approval,
						decisions: approval.decisions.map((d) => ({
							step: d.step,
							approverUserId: d.approverUserId,
							decision: d.decision,
							note: d.note,
							decidedAt: d.decidedAt,
						})),
					}}
					names={names}
					eligible={eligible}
					currentUserId={ctx.userId}
				/>
			)}

			{canEdit && (
				<Section title={t("classify")}>
					<ClassifyForm
						incidentId={incident.id}
						regimes={regimes}
						available={available}
						affectsPayments={incident.affectsPayments}
						initialDora={incident.doraCriteria}
						initialNis2={incident.nis2Criteria}
						initialCra={incident.craCriteria}
						productId={incident.productId}
						products={products}
					/>
				</Section>
			)}

			<Section title={t("updates")}>
				{incident.rootCause && (
					<p className="text-subhead">
						<span className="font-medium text-footnote mr-2 text-muted-foreground">
							{t("rootCause")}
						</span>
						{incident.rootCause}
					</p>
				)}
				{canEdit && (
					<IncidentUpdateForm
						incidentId={incident.id}
						rootCause={incident.rootCause}
					/>
				)}
			</Section>
		</EntityLayout>
	);
}

export default withMessages(IncidentDetailPage, [
	"Approvals",
	"Auth",
	"Common",
	"Decisions",
	"Dlp",
	"Entity",
	"Incidents",
	"Resolutions",
	"Settings",
	"Status",
	"Tasks",
]);
