import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { EmptyState } from "@/components/entity/empty-state";
import { QuickCreateTask } from "@/components/entity/quick-create-task";
import { RegisterFilters } from "@/components/entity/register-filters";
import { StatusButton } from "@/components/entity/status-button";
import { UserChip } from "@/components/entity/user-chip";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { requireOrg, toOrgCtx } from "@/lib/auth/guards";
import { roleAllows } from "@/lib/auth/permissions";
import { fmtDate } from "@/lib/compliance/page-data";
import { listMembersForPicker, listTasks } from "@/lib/compliance/queries";
import { readOrg } from "@/lib/db/with-org";
import { TASK_STATUSES } from "@/lib/entities/task";

type Search = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function TasksPage({
	searchParams,
}: {
	searchParams: Promise<Search>;
}) {
	const ctx = await requireOrg({ task: ["read"] });
	const sp = await searchParams;
	const t = await getTranslations("Tasks");
	const te = await getTranslations("Entity");
	const ts = await getTranslations("Status");
	const all = one(sp.all) === "1";
	const showDone = one(sp.done) === "1";
	const status = one(sp.status);
	const q = one(sp.q)?.toLowerCase();
	const today = new Date().toISOString().slice(0, 10);
	const canEdit = roleAllows(ctx.orgRole, { task: ["update"] });

	const { tasks, members } = await readOrg(toOrgCtx(ctx), async (tx) => ({
		tasks: await listTasks(tx, ctx.orgId, {
			assigneeUserId: all ? undefined : ctx.userId,
			openOnly: !showDone && !status,
		}),
		members: await listMembersForPicker(tx, ctx.orgId),
	}));
	const rows = tasks
		.filter((x) => !status || x.status === status)
		.filter((x) => !q || x.title.toLowerCase().includes(q))
		.sort((a, b) => {
			const ao = a.dueAt && a.dueAt < today ? 0 : 1;
			const bo = b.dueAt && b.dueAt < today ? 0 : 1;
			return ao - bo || (a.dueAt ?? "9999").localeCompare(b.dueAt ?? "9999");
		});

	return (
		<>
			<PageHeader
				title={t("title")}
				lead={t("lead")}
				actions={
					canEdit ? (
						<QuickCreateTask members={members} variant="brown" />
					) : undefined
				}
			/>
			<div className="mb-4">
				<RegisterFilters
					filters={[
						{
							key: "status",
							label: te("status"),
							options: TASK_STATUSES.map((s) => ({ value: s, label: ts(s) })),
						},
					]}
					chips={[
						{ key: "all", label: t("allTasks") },
						{ key: "done", label: t("showDone") },
					]}
				/>
			</div>
			{rows.length === 0 ? (
				<EmptyState
					title={t("empty")}
					actions={canEdit ? <QuickCreateTask members={members} /> : undefined}
				/>
			) : (
				<ul className="flex flex-col divide-y divide-border/60 rounded-md border text-sm">
					{rows.map((task) => {
						const overdue =
							task.dueAt !== null &&
							task.dueAt < today &&
							task.status !== "done";
						return (
							<li
								key={task.id}
								className="flex flex-col gap-2 px-3 py-3 sm:flex-row sm:items-center sm:gap-4"
							>
								<div className="min-w-0 flex-1">
									<p className="font-medium">{task.title}</p>
									<p className="flex flex-wrap items-center gap-x-2 text-muted-foreground text-xs">
										<UserChip name={task.assigneeName} />
										{task.dueAt ? (
											<span
												className={overdue ? "text-destructive" : undefined}
											>
												{overdue
													? t("overdue")
													: fmtDate.format(new Date(task.dueAt))}
											</span>
										) : (
											<span>{t("noDue")}</span>
										)}
										<Badge variant="muted">
											{t(`priority_${task.priority}`)}
										</Badge>
										<Badge variant="outline">
											{t(
												(
													[
														"manual",
														"remediation",
														"review",
														"evidence_request",
														"system",
													] as const
												).includes(task.sourceKind as "manual")
													? (`source_${task.sourceKind}` as "source_manual")
													: "source_other",
											)}
										</Badge>
										{task.entityType === "control" && task.entityId && (
											<Link
												href={`/controls?q=${task.entityId}`}
												className="hover:underline"
											>
												{t("linked", { entity: "Control" })}
											</Link>
										)}
									</p>
								</div>
								<StatusButton
									target={{
										kind: "task",
										taskId: task.id,
										status: task.status,
									}}
									disabled={!canEdit}
								/>
							</li>
						);
					})}
				</ul>
			)}
		</>
	);
}
