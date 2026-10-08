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
import { RiskEditForm, TreatmentForm } from "@/components/risks/risk-forms";
import { Badge } from "@/components/ui/badge";
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
import { fmtDate } from "@/lib/compliance/page-data";
import {
	listComments,
	listMembersForPicker,
	listTasks,
	listWatcherIds,
	userNames,
} from "@/lib/compliance/queries";
import { getRisk, listAssets } from "@/lib/compliance/queries-p2";
import {
	assessRisk,
	DEFAULT_RISK_APPETITE,
	DEFAULT_RISK_SCALES,
} from "@/lib/compliance/risk";
import { readOrg } from "@/lib/db/with-org";
import { TASK_STATUS } from "@/lib/entities/task";
import {
	type ActivityEntry,
	mergeActivity,
	toHistoryItems,
} from "@/lib/history";
import { getOrgSettings } from "@/lib/org/queries";

const BAND_TONE = {
	low: "muted",
	medium: "outline",
	high: "warning",
	critical: "destructive",
} as const;

export default async function RiskDetailPage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const { id } = await params;
	if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
	const ctx = await requireOrgPage({ risk: ["read"] });
	const t = await getTranslations("Risks");
	const te = await getTranslations("Entity");
	const ts = await getTranslations("Status");
	const ta = await getTranslations("Approvals");
	const data = await readOrg(toOrgCtx(ctx), async (tx) => {
		const r = await getRisk(tx, ctx.orgId, id);
		if (!r) return null;
		const [
			settings,
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
			getOrgSettings(tx, ctx.orgId),
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
		const names = await userNames(tx, [
			...history.map((h) => h.actorUserId),
			...comments.map((c) => c.authorUserId),
			...(approval?.decisions.map((d) => d.approverUserId) ?? []),
		]);
		for (const [k, v] of r.names) names.set(k, v);
		return {
			...r,
			settings,
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
		settings,
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
	const appetite = settings?.riskAppetite ?? DEFAULT_RISK_APPETITE;
	const scales = settings?.riskScales ?? DEFAULT_RISK_SCALES;
	const a = assessRisk(risk, appetite);
	const canEdit = roleAllows(ctx.orgRole, { risk: ["update"] });
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
				<WatchButton
					entityType="risk"
					entityId={risk.id}
					watching={watcherIds.includes(ctx.userId)}
				/>
			}
			meta={
				<>
					<MetaItem label={t("inherent")}>
						<Badge variant={BAND_TONE[a.inherent.band]}>
							{a.inherent.score}
						</Badge>{" "}
						{t(`band_${a.inherent.band}`)} · {t(`zone_${a.inherent.zone}`)}
					</MetaItem>
					<MetaItem label={t("residual")}>
						{a.residual ? (
							<>
								<Badge variant={BAND_TONE[a.residual.band]}>
									{a.residual.score}
								</Badge>{" "}
								{t(`band_${a.residual.band}`)} · {t(`zone_${a.residual.zone}`)}
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
				</>
			}
			aside={
				<>
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
				labels={{
					title: ta("bar"),
					step: (n) => ta("step", { n }),
					dueAt: ta("dueAt"),
					overdue: ta("overdue"),
					selfApproved: ta("selfApproved"),
					history: ta("history"),
					status: (s) => s,
				}}
			/>

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
								<Badge
									variant={
										tr.status === "done"
											? "success"
											: tr.status === "in_progress"
												? "warning"
												: "muted"
									}
								>
									{tr.status}
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
				<Section title={t("save")}>
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
					/>
				</Section>
			)}
		</EntityLayout>
	);
}
