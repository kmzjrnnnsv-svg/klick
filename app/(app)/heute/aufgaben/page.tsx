import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ApplyBundle } from "@/components/entity/apply-bundle";
import { EmptyState } from "@/components/entity/empty-state";
import { LinkedText } from "@/components/entity/linked-text";
import { QuickCreateTask } from "@/components/entity/quick-create-task";
import { RegisterFilters } from "@/components/entity/register-filters";
import { StatusButton } from "@/components/entity/status-button";
import { UserChip } from "@/components/entity/user-chip";
import { withMessages } from "@/components/i18n/with-messages";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { requireOrgPage } from "@/lib/auth/gates";
import { toOrgCtx } from "@/lib/auth/guards";
import { allows } from "@/lib/auth/permissions";
import { TASK_BUNDLES } from "@/lib/compliance/catalog/task-bundles";
import { fmtDate } from "@/lib/compliance/page-data";
import { listMembersForPicker, listTasks } from "@/lib/compliance/queries";
import { listTaskBundles } from "@/lib/compliance/queries-p2";
import { readOrg } from "@/lib/db/with-org";
import { entityLinks, linkKey } from "@/lib/entities/links";
import { TASK_STATUSES } from "@/lib/entities/task";

type Search = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

async function TasksPage({ searchParams }: { searchParams: Promise<Search> }) {
	const ctx = await requireOrgPage({ task: ["read"] });
	const sp = await searchParams;
	const t = await getTranslations("Tasks");
	const tNav = await getTranslations("Nav");
	const te = await getTranslations("Entity");
	const ts = await getTranslations("Status");
	const all = one(sp.all) === "1";
	const showDone = one(sp.done) === "1";
	const status = one(sp.status);
	const q = one(sp.q)?.toLowerCase();
	const today = new Date().toISOString().slice(0, 10);
	const canEdit = allows(ctx, { task: ["update"] });

	const canAuthor = allows(ctx, { evidence: ["create"] });
	const { tasks, members, links, custom } = await readOrg(
		toOrgCtx(ctx),
		async (tx) => {
			const tasks = await listTasks(tx, ctx.orgId, {
				assigneeUserId: all ? undefined : ctx.userId,
				openOnly: !showDone && !status,
			});
			return {
				tasks,
				custom: await listTaskBundles(tx, ctx.orgId),
				members: await listMembersForPicker(tx, ctx.orgId),
				// Titel führt zum Gegenstand (Control, Anfrage, Vorfall …)
				links: await entityLinks(tx, ctx.orgId, tasks),
			};
		},
	);
	// Pakete ohne festen Bezug (Eintritt, Austritt …); Pakete für Vorfälle,
	// Audits usw. setzt Klick am jeweiligen Gegenstand
	const canCreate = allows(ctx, { task: ["create"] });
	const customCodes = new Set(custom.map((b) => b.code));
	const bundles = [
		...custom.map((b) => ({
			code: b.code,
			name: b.name,
			description: b.description ?? "",
			items: b.items.length,
			trigger: b.triggerEntityType,
		})),
		...TASK_BUNDLES.filter((b) => !customCodes.has(b.code)).map((b) => ({
			code: b.code,
			name: b.name,
			description: b.description,
			items: b.items.length,
			trigger: b.triggerEntityType,
		})),
	]
		.filter((b) => !b.trigger)
		.map(({ trigger: _t, ...b }) => b);
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
				back={{ href: "/heute", label: tNav("today") }}
				title={t("title")}
				lead={t("lead")}
				actions={
					canEdit || canCreate ? (
						<div className="flex flex-wrap gap-2">
							{canCreate && <ApplyBundle bundles={bundles} />}
							{canEdit && <QuickCreateTask members={members} />}
						</div>
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
					actions={
						canEdit || canCreate ? (
							<div className="flex flex-wrap gap-2">
								{canCreate && <ApplyBundle bundles={bundles} />}
								{canEdit && <QuickCreateTask members={members} />}
							</div>
						) : undefined
					}
				/>
			) : (
				<ul className="flex flex-col list-inset overflow-hidden rounded-2xl bg-card text-subhead">
					{rows.map((task) => {
						const overdue =
							task.dueAt !== null &&
							task.dueAt < today &&
							task.status !== "done";
						const key = linkKey(task);
						const link = key ? links.get(key) : undefined;
						// Maßnahme an einem Control: Nachweis direkt verfassen
						const controlCode =
							task.entityType === "control"
								? link?.title?.split(" ")[0]
								: undefined;
						return (
							<li
								key={task.id}
								className="flex flex-col gap-2 px-3 py-3 sm:flex-row sm:items-center sm:gap-4"
							>
								<div className="min-w-0 flex-1">
									{link ? (
										<Link
											href={link.href}
											className="font-medium underline-offset-4 hover:underline"
										>
											{task.title}
										</Link>
									) : (
										<p className="font-medium">{task.title}</p>
									)}
									{task.description && (
										<p className="mt-0.5 whitespace-pre-line break-words text-footnote text-muted-foreground">
											<LinkedText text={task.description} />
										</p>
									)}
									<p className="flex flex-wrap items-center gap-x-2 text-muted-foreground text-footnote">
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
										{link?.title && (
											<Link
												href={link.href}
												className="hit-area hover:underline"
											>
												{t("linked", { entity: link.title })}
											</Link>
										)}
										{controlCode?.startsWith("CC-") &&
											canAuthor &&
											task.status !== "done" && (
												<Link
													href={`/nachweise/verfassen?control=${encodeURIComponent(controlCode)}&titel=${encodeURIComponent(task.title)}`}
													className="hit-area text-primary hover:underline"
												>
													{t("authorEvidence")}
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

export default withMessages(TasksPage, [
	"Bundles",
	"Common",
	"Entity",
	"Status",
	"Tasks",
]);
