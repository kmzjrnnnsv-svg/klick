import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
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
import {
	EffectivenessForm,
	NonconformityForm,
} from "@/components/nonconformities/nc-forms";
import { Badge } from "@/components/ui/badge";
import { historyFor } from "@/lib/audit";
import { requireOrgPage } from "@/lib/auth/gates";
import { toOrgCtx } from "@/lib/auth/guards";
import { roleAllows } from "@/lib/auth/permissions";
import { capaState } from "@/lib/compliance/nonconformity";
import { fmtDate } from "@/lib/compliance/page-data";
import {
	listComments,
	listMembersForPicker,
	listTasks,
	listWatcherIds,
	userNames,
} from "@/lib/compliance/queries";
import { getNonconformity } from "@/lib/compliance/queries-p3";
import { readOrg } from "@/lib/db/with-org";
import { entityHref } from "@/lib/entities/links";
import { TASK_STATUS } from "@/lib/entities/task";
import {
	type ActivityEntry,
	mergeActivity,
	toHistoryItems,
} from "@/lib/history";

const SOURCE_KIND = {
	audit: "audit_finding",
	incident: "incident",
	control_test: "control",
	complaint: "complaint",
	management_review: "management_review",
	self_identified: null,
} as const;

export default async function NonconformityDetailPage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const { id } = await params;
	if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
	const ctx = await requireOrgPage({ nonconformity: ["read"] });
	const t = await getTranslations("Nonconformities");
	const te = await getTranslations("Entity");
	const ts = await getTranslations("Status");
	const canEdit = roleAllows(ctx.orgRole, { nonconformity: ["update"] });

	const data = await readOrg(toOrgCtx(ctx), async (tx) => {
		const r = await getNonconformity(tx, ctx.orgId, id);
		if (!r) return null;
		const [comments, history, watcherIds, members, tasks] = await Promise.all([
			listComments(tx, ctx.orgId, "nonconformity", id),
			historyFor(tx, `nonconformity:${id}`),
			listWatcherIds(tx, ctx.orgId, "nonconformity", id),
			listMembersForPicker(tx, ctx.orgId),
			listTasks(tx, ctx.orgId, { entityType: "nonconformity", entityId: id }),
		]);
		const names = await userNames(tx, [
			...history.map((h) => h.actorUserId),
			...comments.map((c) => c.authorUserId),
		]);
		for (const [k, v] of r.names) names.set(k, v);
		return { ...r, comments, history, watcherIds, members, tasks, names };
	});
	if (!data) notFound();
	const { nc, comments, history, watcherIds, members, tasks, names } = data;
	const state = capaState(nc);
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
	const sourceKind = SOURCE_KIND[nc.source];
	const sourceHref =
		nc.sourceRefId && sourceKind && sourceKind !== "audit_finding"
			? entityHref(sourceKind, nc.sourceRefId)
			: nc.source === "audit"
				? "/audits?tab=findings"
				: null;

	return (
		<EntityLayout
			eyebrow={`${nc.code} · ${t(`source_${nc.source}`)}`}
			title={nc.title}
			subtitle={nc.description ?? undefined}
			status={
				<StatusButton
					target={{
						kind: "nonconformity",
						nonconformityId: nc.id,
						status: nc.status,
					}}
					disabled={!canEdit}
				/>
			}
			actions={
				<>
					<WatchButton
						entityType="nonconformity"
						entityId={nc.id}
						watching={watcherIds.includes(ctx.userId)}
					/>
					{canEdit && (
						<NonconformityForm
							members={members}
							initial={{
								id: nc.id,
								source: nc.source,
								title: nc.title,
								description: nc.description,
								rootCause: nc.rootCause,
								correction: nc.correction,
								correctiveAction: nc.correctiveAction,
								ownerUserId: nc.ownerUserId,
								assigneeUserId: nc.assigneeUserId,
								dueAt: nc.dueAt,
								effectivenessCheckAt: nc.effectivenessCheckAt,
							}}
						/>
					)}
				</>
			}
			meta={
				<>
					<MetaItem label={t("owner")}>
						<UserChip name={names.get(nc.ownerUserId ?? "")} />
					</MetaItem>
					<MetaItem label={t("assignee")}>
						<UserChip name={names.get(nc.assigneeUserId ?? "")} />
					</MetaItem>
					<MetaItem label={t("dueAt")}>
						<span className={state.overdue ? "text-destructive" : ""}>
							{nc.dueAt ? fmtDate.format(new Date(nc.dueAt)) : "—"}
						</span>
					</MetaItem>
					<MetaItem label={t("effectivenessCheckAt")}>
						<span className={state.effectivenessDue ? "text-warning" : ""}>
							{nc.effectivenessCheckAt
								? fmtDate.format(new Date(nc.effectivenessCheckAt))
								: "—"}
						</span>
					</MetaItem>
				</>
			}
			aside={
				<>
					<Section title={te("activity")}>
						<CommentForm
							entityType="nonconformity"
							entityId={nc.id}
							link={`/abweichungen/${nc.id}`}
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
									entityType="nonconformity"
									entityId={nc.id}
									members={members}
									sourceKind="remediation"
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
			<Section title={t("capa")}>
				<dl className="grid gap-4 text-sm sm:grid-cols-2">
					<div className="sm:col-span-2">
						<dt className="lv-eyebrow text-[0.52rem] text-muted-foreground">
							{t("rootCause")}
						</dt>
						<dd className={nc.rootCause ? "" : "text-destructive"}>
							{nc.rootCause ?? t("rootCauseMissing")}
						</dd>
					</div>
					<div>
						<dt className="lv-eyebrow text-[0.52rem] text-muted-foreground">
							{t("correction")}
						</dt>
						<dd>{nc.correction ?? "—"}</dd>
					</div>
					<div>
						<dt className="lv-eyebrow text-[0.52rem] text-muted-foreground">
							{t("correctiveAction")}
						</dt>
						<dd className={nc.correctiveAction ? "" : "text-warning"}>
							{nc.correctiveAction ?? t("correctiveActionMissing")}
						</dd>
					</div>
				</dl>
				{sourceHref && (
					<p className="mt-3 text-xs">
						<span className="text-muted-foreground">{t("sourceLink")}: </span>
						<Link href={sourceHref} className="text-primary hover:underline">
							{t(`source_${nc.source}`)}
						</Link>
					</p>
				)}
			</Section>
			<Section title={t("effectiveness")}>
				<div className="flex flex-wrap items-center gap-3 text-sm">
					{nc.effectivenessResult ? (
						<Badge
							variant={
								nc.effectivenessResult === "effective"
									? "success"
									: nc.effectivenessResult === "partially"
										? "warning"
										: "destructive"
							}
						>
							{t(`eff_${nc.effectivenessResult}`)}
						</Badge>
					) : (
						<span className="text-muted-foreground">
							{t("effectivenessPending")}
						</span>
					)}
					{state.canClose && nc.status !== "closed" && (
						<span className="text-muted-foreground text-xs">
							{t("canClose")}
						</span>
					)}
				</div>
				<p className="mt-2 text-muted-foreground text-xs">
					{t("effectivenessLead")}
				</p>
				{canEdit && nc.status !== "closed" && (
					<div className="mt-3">
						<EffectivenessForm nonconformityId={nc.id} />
					</div>
				)}
			</Section>
		</EntityLayout>
	);
}
