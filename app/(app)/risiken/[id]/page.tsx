import { eq } from "drizzle-orm";
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
import { DecisionRequestsBlock } from "@/components/resolutions/decision-requests-block";
import { RiskEditForm, TreatmentForm } from "@/components/risks/risk-forms";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { providers } from "@/db/schema";
import { approverEligibility } from "@/lib/approvals/rules";
import {
	activeDelegations,
	latestRequestFor,
	loadCandidates,
} from "@/lib/approvals/service";
import { historyFor } from "@/lib/audit";
import { requireOrgPage } from "@/lib/auth/gates";
import { toOrgCtx } from "@/lib/auth/guards";
import { roleAllows } from "@/lib/auth/permissions";
import { CONTROLS } from "@/lib/compliance/catalog";
import { SCENARIO_BY_CODE } from "@/lib/compliance/catalog/risk-scenarios";
import { fmtDate } from "@/lib/compliance/page-data";
import {
	listComments,
	listMembersForPicker,
	listTasks,
	listWatcherIds,
	userNames,
} from "@/lib/compliance/queries";
import { getRisk, listAssets } from "@/lib/compliance/queries-p2";
import { loadRiskSource } from "@/lib/compliance/queries-risk-sources";
import { assessRisk } from "@/lib/compliance/risk";
import { scaleLabels, ZONE_TONE } from "@/lib/compliance/risk-method";
import { isRiskSourceKind } from "@/lib/compliance/risk-sources";
import { readOrg } from "@/lib/db/with-org";
import { TASK_STATUS } from "@/lib/entities/task";
import {
	type ActivityEntry,
	mergeActivity,
	toHistoryItems,
} from "@/lib/history";
import { orgRiskMethod } from "@/lib/org/queries";

export default async function RiskDetailPage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const { id } = await params;
	if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
	const ctx = await requireOrgPage({ risk: ["read"] });
	const t = await getTranslations("Risks");
	const tw = await getTranslations("RiskWizard");
	const te = await getTranslations("Entity");
	const ts = await getTranslations("Status");
	const trs = await getTranslations("RiskSources");
	const data = await readOrg(toOrgCtx(ctx), async (tx) => {
		const r = await getRisk(tx, ctx.orgId, id);
		if (!r) return null;
		const [
			method,
			comments,
			history,
			watcherIds,
			members,
			tasks,
			assets,
			approval,
			candidates,
			dels,
		] = await Promise.all([
			orgRiskMethod(tx, ctx.orgId),
			listComments(tx, ctx.orgId, "risk", id),
			historyFor(tx, `risk:${id}`),
			listWatcherIds(tx, ctx.orgId, "risk", id),
			listMembersForPicker(tx, ctx.orgId),
			listTasks(tx, ctx.orgId, { entityType: "risk", entityId: id }),
			listAssets(tx, ctx.orgId),
			latestRequestFor(tx, ctx.orgId, "risk", id),
			loadCandidates(tx, ctx.orgId),
			activeDelegations(tx, ctx.orgId),
		]);
		const [prov] = r.risk.providerId
			? await tx
					.select({ name: providers.name })
					.from(providers)
					.where(eq(providers.id, r.risk.providerId))
					.limit(1)
			: [];
		const source =
			r.risk.sourceEntityType &&
			r.risk.sourceEntityId &&
			isRiskSourceKind(r.risk.sourceEntityType)
				? await loadRiskSource(
						tx,
						ctx.orgId,
						r.risk.sourceEntityType,
						r.risk.sourceEntityId,
					)
				: null;
		const names = await userNames(tx, [
			...history.map((h) => h.actorUserId),
			...comments.map((c) => c.authorUserId),
			...(approval?.decisions.map((d) => d.approverUserId) ?? []),
		]);
		for (const [k, v] of r.names) names.set(k, v);
		return {
			...r,
			providerName: prov?.name ?? null,
			source,
			method,
			comments,
			history,
			watcherIds,
			members,
			tasks,
			assets,
			approval,
			candidates,
			dels,
			names,
		};
	});
	if (!data) notFound();
	const {
		risk,
		treatments,
		controls: linkedControls,
		assets: linkedAssets,
		providerName,
		method,
		comments,
		history,
		watcherIds,
		members,
		tasks,
		assets,
		approval,
		candidates,
		dels,
		names,
	} = data;
	const scales = scaleLabels(method);
	const a = assessRisk(risk, method);
	const canEdit = roleAllows(ctx.orgRole, { risk: ["update"] });
	// Status einer Maßnahme folgt ihrer Aufgabe
	const taskStatus = new Map(tasks.map((x) => [x.id, x.status]));
	const treatmentStatus = (tr: {
		taskId: string | null;
		status: "planned" | "in_progress" | "done" | "dropped";
	}): "planned" | "in_progress" | "done" | "dropped" => {
		const s = tr.taskId ? taskStatus.get(tr.taskId) : undefined;
		if (s === "done") return "done";
		if (s === "doing" || s === "blocked") return "in_progress";
		if (s === "todo") return "planned";
		return tr.status;
	};
	const me = candidates.find((c) => c.userId === ctx.userId);
	const step = approval?.steps.find((s) => s.order === approval.currentStep);
	const eligible = Boolean(
		approval &&
			approval.status === "pending" &&
			step &&
			me &&
			approverEligibility(
				step,
				me,
				{
					requesterUserId: approval.requestedByUserId,
					entityOwnerUserId: risk.ownerUserId,
					delegations: dels,
				},
				candidates,
			).eligible,
	);

	const entries: ActivityEntry[] = mergeActivity(
		toHistoryItems(history),
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
			eyebrow={`${risk.code} · ${t(`category_${risk.category}`)}`}
			title={risk.title}
			subtitle={risk.description ?? undefined}
			status={
				<StatusButton
					target={{
						kind: "risk",
						riskId: risk.id,
						status: risk.status,
						aboveAppetite: a.aboveAppetite,
					}}
					disabled={!canEdit}
				/>
			}
			actions={
				<span className="flex flex-wrap items-center gap-2">
					{canEdit && (
						<Button asChild size="sm" variant="outline">
							<Link href={`/risiken/${risk.id}/bewerten`}>{t("reassess")}</Link>
						</Button>
					)}
					<WatchButton
						entityType="risk"
						entityId={risk.id}
						watching={watcherIds.includes(ctx.userId)}
					/>
				</span>
			}
			meta={
				<>
					<MetaItem label={t("inherent")}>
						<Badge variant={ZONE_TONE[a.inherent.zone]}>
							{a.inherent.score}
						</Badge>{" "}
						{a.inherent.cls.label} · {t(`zone_${a.inherent.zone}`)}
					</MetaItem>
					<MetaItem label={t("residual")}>
						{a.residual ? (
							<>
								<Badge variant={ZONE_TONE[a.residual.zone]}>
									{a.residual.score}
								</Badge>{" "}
								{a.residual.cls.label} · {t(`zone_${a.residual.zone}`)}
							</>
						) : (
							"—"
						)}
					</MetaItem>
					<MetaItem label={te("owner")}>
						<UserChip name={names.get(risk.ownerUserId ?? "")} />
					</MetaItem>
					<MetaItem label={t("reviewAt")}>
						{risk.reviewAt ? fmtDate.format(new Date(risk.reviewAt)) : "—"}
					</MetaItem>
					{data.source && (
						<MetaItem label={trs("origin")}>
							<Link href={data.source.href} className="hover:underline">
								{data.source.label}
							</Link>
						</MetaItem>
					)}
				</>
			}
			aside={
				<>
					<DecisionRequestsBlock
						ctx={ctx}
						kind="risk"
						id={id}
						title={`${risk.code} ${risk.title}`}
					/>
					<Section title={te("activity")}>
						<CommentForm
							entityType="risk"
							entityId={risk.id}
							link={`/risiken/${risk.id}`}
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
						title={te("tasks")}
						actions={
							canEdit ? (
								<QuickCreateTask
									entityType="risk"
									entityId={risk.id}
									members={members}
									sourceKind="treatment"
								/>
							) : null
						}
					>
						{tasks.length === 0 ? (
							<p className="text-muted-foreground text-sm">
								{te("tasksEmpty")}
							</p>
						) : (
							<ul className="flex flex-col gap-2 text-sm">
								{tasks.map((task) => (
									<li
										key={task.id}
										className="flex items-start justify-between gap-2 rounded-md border p-2"
									>
										<div className="min-w-0">
											<p className="truncate">{task.title}</p>
											<p className="text-muted-foreground text-xs">
												{task.assigneeName ?? "—"}
												{task.dueAt
													? ` · ${fmtDate.format(new Date(task.dueAt))}`
													: ""}
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
			{a.aboveAppetite && risk.status !== "accepted" && (
				<p className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
					<span className="font-medium">{t("aboveAppetite")}</span> —{" "}
					{t("aboveAppetiteLead")} {t("acceptNeedsApproval")}
				</p>
			)}
			<ApprovalBar
				data={
					approval
						? {
								...approval,
								decisions: approval.decisions.map((d) => ({
									step: d.step,
									approverUserId: d.approverUserId,
									decision: d.decision,
									note: d.note,
									decidedAt: d.decidedAt,
								})),
							}
						: null
				}
				names={names}
				eligible={eligible}
				currentUserId={ctx.userId}
			/>

			<Section title={t("assessment")}>
				{risk.impactDetail && Object.keys(risk.impactDetail).length > 0 ? (
					<div className="flex flex-col gap-4 text-sm">
						<p className="text-muted-foreground text-xs">
							{t("assessmentLead")}
							{risk.assessedAt
								? ` · ${t("assessedAt")} ${fmtDate.format(risk.assessedAt)}`
								: ""}
						</p>
						<ul className="flex flex-col divide-y divide-border/60 rounded-md border">
							{method.dimensions
								.filter((dim) => dim.key in (risk.impactDetail ?? {}))
								.map((dim) => {
									const v = risk.impactDetail?.[dim.key] ?? 1;
									return (
										<li
											key={dim.key}
											className="grid grid-cols-1 gap-1 px-3 py-2 sm:grid-cols-[14rem_8rem_1fr]"
										>
											<span className="font-medium">{dim.label}</span>
											<span>
												{v} · {method.impact[v - 1]}
											</span>
											<span className="text-muted-foreground text-xs">
												{dim.anchors[v - 1]}
											</span>
										</li>
									);
								})}
						</ul>
						<dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-[12rem_1fr]">
							{risk.scenarioCode && (
								<>
									<dt className="text-muted-foreground">{t("scenario")}</dt>
									<dd>
										{SCENARIO_BY_CODE.get(risk.scenarioCode)?.title ??
											risk.scenarioCode}
									</dd>
								</>
							)}
							{risk.impactDescription && (
								<>
									<dt className="text-muted-foreground">
										{t("impactDescription")}
									</dt>
									<dd className="whitespace-pre-line">
										{risk.impactDescription}
									</dd>
								</>
							)}
							{risk.existingMeasures && (
								<>
									<dt className="text-muted-foreground">
										{t("existingMeasures")}
									</dt>
									<dd className="whitespace-pre-line">
										{risk.existingMeasures}
									</dd>
								</>
							)}
							{(risk.protectionGoals ?? []).length > 0 && (
								<>
									<dt className="text-muted-foreground">
										{t("protectionGoals")}
									</dt>
									<dd>
										{(risk.protectionGoals ?? [])
											.map((g) => tw(`goal_${g}` as "goal_integrity"))
											.join(", ")}
									</dd>
								</>
							)}
							{providerName && risk.providerId && (
								<>
									<dt className="text-muted-foreground">{t("provider")}</dt>
									<dd>
										<Link
											href={`/dienstleister/${risk.providerId}`}
											className="hover:underline"
										>
											{providerName}
										</Link>
									</dd>
								</>
							)}
							{risk.treatmentNote && (
								<>
									<dt className="text-muted-foreground">
										{t("treatmentNote")}
									</dt>
									<dd className="whitespace-pre-line">{risk.treatmentNote}</dd>
								</>
							)}
							{risk.residualNote && (
								<>
									<dt className="text-muted-foreground">{t("residualNote")}</dt>
									<dd className="whitespace-pre-line">{risk.residualNote}</dd>
								</>
							)}
						</dl>
					</div>
				) : (
					<p className="text-muted-foreground text-sm">{t("notAssessed")}</p>
				)}
			</Section>

			<Section
				title={t("treatments")}
				actions={
					canEdit ? <TreatmentForm riskId={risk.id} members={members} /> : null
				}
			>
				{treatments.length === 0 ? (
					<p className="text-muted-foreground text-sm">
						{t("treatmentsEmpty")}
					</p>
				) : (
					<ul className="flex flex-col divide-y divide-border/60 rounded-md border text-sm">
						{treatments.map((tr) => (
							<li
								key={tr.id}
								className="flex flex-wrap items-center gap-2 px-3 py-2"
							>
								<span className="min-w-0 flex-1 truncate font-medium">
									{tr.title}
								</span>
								<UserChip name={names.get(tr.ownerUserId ?? "")} />
								{tr.dueAt && (
									<span className="text-muted-foreground text-xs">
										{fmtDate.format(new Date(tr.dueAt))}
									</span>
								)}
								{tr.costEur != null && (
									<span className="text-muted-foreground text-xs tabular-nums">
										{tr.costEur.toLocaleString("de-DE")} €
									</span>
								)}
								<Badge
									variant={
										treatmentStatus(tr) === "done"
											? "success"
											: treatmentStatus(tr) === "in_progress"
												? "warning"
												: "muted"
									}
								>
									{t(`treatmentStatus_${treatmentStatus(tr)}`)}
								</Badge>
							</li>
						))}
					</ul>
				)}
			</Section>

			<Section title={t("controls")}>
				{linkedControls.length === 0 ? (
					<p className="text-muted-foreground text-sm">—</p>
				) : (
					<ul className="flex flex-wrap gap-1.5">
						{linkedControls.map((c) => (
							<Link key={c.code} href={`/controls/${c.code}`}>
								<Badge
									variant="outline"
									className="font-mono normal-case tracking-normal"
								>
									{c.code}
								</Badge>
							</Link>
						))}
					</ul>
				)}
			</Section>

			{canEdit && (
				<Section title={t("editTitle")}>
					<RiskEditForm
						risk={{
							id: risk.id,
							likelihood: risk.likelihood,
							impact: risk.impact,
							treatment: risk.treatment,
							residualLikelihood: risk.residualLikelihood,
							residualImpact: risk.residualImpact,
							ownerUserId: risk.ownerUserId,
							assigneeUserId: risk.assigneeUserId,
							reviewAt: risk.reviewAt,
							description: risk.description,
						}}
						scales={scales}
						members={members}
						controlOptions={CONTROLS.map((c) => ({
							code: c.code,
							title: c.title,
						}))}
						assetOptions={assets.map((x) => ({ id: x.id, name: x.name }))}
						linkedControls={linkedControls.map((c) => c.code)}
						linkedAssets={linkedAssets.map((x) => x.id)}
						canEdit={canEdit}
						guided={Boolean(
							risk.impactDetail && Object.keys(risk.impactDetail).length > 0,
						)}
					/>
				</Section>
			)}
		</EntityLayout>
	);
}
