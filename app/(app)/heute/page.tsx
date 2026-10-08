import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ApprovalActions } from "@/components/approvals/approval-actions";
import { AckButton } from "@/components/documents/ack-button";
import { QuickCreateTask } from "@/components/entity/quick-create-task";
import { StatusBadge } from "@/components/entity/status-badge";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { listRequestsForUser } from "@/lib/approvals/service";
import { requireOrgPage } from "@/lib/auth/gates";
import { toOrgCtx } from "@/lib/auth/guards";
import { fmtDate } from "@/lib/compliance/page-data";
import {
	listControlRows,
	listMembersForPicker,
	listTasks,
} from "@/lib/compliance/queries";
import { pendingAcknowledgements } from "@/lib/compliance/queries-p2";
import {
	listNonconformities,
	listObligationRuns,
} from "@/lib/compliance/queries-p3";
import { readOrg } from "@/lib/db/with-org";
import { entityHref, resolveEntityTitles } from "@/lib/entities/links";
import { TASK_STATUS } from "@/lib/entities/task";
import { listNotifications } from "@/lib/notifications/query";

// Startseite nach Login: gestapelte Abschnitte, je max. fünf Einträge —
// Freigaben, Aufgaben, Fälliges, Kenntnisnahmen, Erwähnungen.
export default async function TodayPage() {
	const ctx = await requireOrgPage();
	const t = await getTranslations("Today");
	const ts = await getTranslations("Status");
	const today = new Date().toISOString().slice(0, 10);
	const weekAhead = new Date(Date.now() + 7 * 86_400_000)
		.toISOString()
		.slice(0, 10);

	const {
		tasks,
		controls,
		mentions,
		members,
		approvals,
		approvalTitles,
		acks,
		runs,
		ncs,
	} = await readOrg(toOrgCtx(ctx), async (tx) => {
		const requests = (
			await listRequestsForUser(tx, ctx.orgId, ctx.userId)
		).filter((r) => r.eligible);
		return {
			tasks: await listTasks(tx, ctx.orgId, {
				assigneeUserId: ctx.userId,
				openOnly: true,
			}),
			controls: await listControlRows(tx, ctx.orgId),
			mentions: (await listNotifications(tx, ctx.userId, 20)).filter(
				(n) => n.kind === "mentioned" && !n.readAt,
			),
			members: await listMembersForPicker(tx, ctx.orgId),
			approvals: requests,
			approvalTitles: await resolveEntityTitles(
				tx,
				ctx.orgId,
				requests.map((r) => ({
					entityType: r.entityType,
					entityId: r.entityId,
				})),
			),
			acks: await pendingAcknowledgements(
				tx,
				ctx.orgId,
				ctx.userId,
				ctx.orgRole,
			),
			runs: (await listObligationRuns(tx, ctx.orgId, { to: weekAhead })).filter(
				(r) =>
					r.status !== "done" &&
					r.status !== "waived" &&
					(r.ownerUserId === ctx.userId ||
						(!r.ownerUserId && ctx.orgRole === "owner")),
			),
			ncs: (await listNonconformities(tx, ctx.orgId)).filter(
				(n) =>
					n.status !== "closed" &&
					(n.ownerUserId === ctx.userId || n.assigneeUserId === ctx.userId) &&
					n.dueAt !== null &&
					n.dueAt <= weekAhead,
			),
		};
	});

	const dueTasks = tasks.filter((x) => x.dueAt && x.dueAt <= weekAhead);
	const dueReviews = controls.filter(
		(c) =>
			(c.ownerUserId === ctx.userId || c.assigneeUserId === ctx.userId) &&
			c.nextReviewAt &&
			c.nextReviewAt <= weekAhead,
	);

	return (
		<>
			<PageHeader
				eyebrow={new Intl.DateTimeFormat("de-DE", {
					dateStyle: "full",
					timeZone: "Europe/Berlin",
				}).format(new Date())}
				title={t("greeting", { name: ctx.name.split(" ")[0] ?? ctx.name })}
				actions={
					<QuickCreateTask
						members={members}
						label={t("newTask")}
						variant="brown"
					/>
				}
			/>
			<div className="grid gap-4 md:grid-cols-2">
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center justify-between text-base">
							{t("approvals")}
							<Link
								href="/heute/freigaben"
								className="text-primary text-xs font-normal normal-case hover:underline"
							>
								{t("showAll")}
							</Link>
						</CardTitle>
					</CardHeader>
					<CardContent>
						{approvals.length === 0 ? (
							<p className="text-muted-foreground text-sm">
								{t("approvalsEmpty")}
							</p>
						) : (
							<ul className="flex flex-col divide-y divide-border/60 text-sm">
								{approvals.slice(0, 5).map((r) => {
									const title =
										approvalTitles.get(`${r.entityType}:${r.entityId}`) ??
										r.workflowName;
									return (
										<li key={r.id} className="flex flex-col gap-2 py-2">
											<Link
												href={entityHref(r.entityType, r.entityId, title)}
												className="min-w-0 truncate hover:underline"
											>
												<span className="text-muted-foreground">
													{r.workflowName} ·{" "}
												</span>
												{title}
											</Link>
											<ApprovalActions
												requestId={r.id}
												eligible={r.eligible}
												mine={false}
												compact
											/>
										</li>
									);
								})}
							</ul>
						)}
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle className="flex items-center justify-between text-base">
							{t("tasks")}
							<Link
								href="/heute/aufgaben"
								className="text-primary text-xs font-normal normal-case hover:underline"
							>
								{t("showAll")}
							</Link>
						</CardTitle>
					</CardHeader>
					<CardContent>
						{tasks.length === 0 ? (
							<p className="text-muted-foreground text-sm">{t("tasksEmpty")}</p>
						) : (
							<ul className="flex flex-col divide-y divide-border/60 text-sm">
								{tasks.slice(0, 5).map((task) => {
									const overdue = task.dueAt !== null && task.dueAt < today;
									return (
										<li
											key={task.id}
											className="flex items-center justify-between gap-2 py-2"
										>
											<span className="min-w-0 truncate">{task.title}</span>
											<span className="flex shrink-0 items-center gap-2">
												{task.dueAt && (
													<span
														className={
															overdue
																? "text-destructive text-xs"
																: "text-muted-foreground text-xs"
														}
													>
														{overdue
															? t("overdue")
															: fmtDate.format(new Date(task.dueAt))}
													</span>
												)}
												<StatusBadge
													machine={TASK_STATUS}
													status={task.status}
													label={ts(
														TASK_STATUS.labelKey[task.status] as "todo",
													)}
												/>
											</span>
										</li>
									);
								})}
							</ul>
						)}
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle className="flex items-center justify-between text-base">
							{t("due")}
							<Link
								href="/heute/verantwortung"
								className="text-primary text-xs font-normal normal-case hover:underline"
							>
								{t("accountability")}
							</Link>
						</CardTitle>
					</CardHeader>
					<CardContent>
						{dueTasks.length === 0 &&
						dueReviews.length === 0 &&
						runs.length === 0 &&
						ncs.length === 0 ? (
							<p className="text-muted-foreground text-sm">{t("dueEmpty")}</p>
						) : (
							<ul className="flex flex-col divide-y divide-border/60 text-sm">
								{dueReviews.slice(0, 5).map((c) => (
									<li
										key={c.implementationId}
										className="flex items-center justify-between gap-2 py-2"
									>
										<Link
											href={`/controls/${c.code}`}
											className="min-w-0 truncate hover:underline"
										>
											{t("reviewDue", { code: c.code })} · {c.title}
										</Link>
										<Badge
											variant={
												c.nextReviewAt && c.nextReviewAt < today
													? "destructive"
													: "outline"
											}
										>
											{c.nextReviewAt
												? fmtDate.format(new Date(c.nextReviewAt))
												: ""}
										</Badge>
									</li>
								))}
								{runs.slice(0, 5).map((r) => (
									<li
										key={r.id}
										className="flex items-center justify-between gap-2 py-2"
									>
										<Link
											href="/kalender"
											className="min-w-0 truncate hover:underline"
										>
											{t("obligationDue")} · {r.title}
										</Link>
										<Badge
											variant={r.dueAt < today ? "destructive" : "outline"}
										>
											{fmtDate.format(new Date(r.dueAt))}
										</Badge>
									</li>
								))}
								{ncs.slice(0, 5).map((n) => (
									<li
										key={n.id}
										className="flex items-center justify-between gap-2 py-2"
									>
										<Link
											href={`/abweichungen/${n.id}`}
											className="min-w-0 truncate hover:underline"
										>
											{n.code} · {n.title}
										</Link>
										<Badge
											variant={
												n.dueAt && n.dueAt < today ? "destructive" : "outline"
											}
										>
											{n.dueAt ? fmtDate.format(new Date(n.dueAt)) : ""}
										</Badge>
									</li>
								))}
								{dueTasks.slice(0, 5).map((task) => (
									<li
										key={task.id}
										className="flex items-center justify-between gap-2 py-2"
									>
										<span className="min-w-0 truncate">{task.title}</span>
										<Badge
											variant={
												task.dueAt && task.dueAt < today
													? "destructive"
													: "outline"
											}
										>
											{task.dueAt ? fmtDate.format(new Date(task.dueAt)) : ""}
										</Badge>
									</li>
								))}
							</ul>
						)}
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle className="text-base">{t("acknowledgements")}</CardTitle>
					</CardHeader>
					<CardContent>
						{acks.length === 0 ? (
							<p className="text-muted-foreground text-sm">
								{t("acknowledgementsEmpty")}
							</p>
						) : (
							<ul className="flex flex-col divide-y divide-border/60 text-sm">
								{acks.slice(0, 5).map((d) => (
									<li
										key={d.id}
										className="flex items-center justify-between gap-2 py-2"
									>
										<Link
											href={`/dokumente/${encodeURIComponent(d.docNumber)}`}
											className="min-w-0 truncate hover:underline"
										>
											<span className="font-mono text-xs">{d.docNumber}</span>{" "}
											{d.title}{" "}
											<span className="text-muted-foreground">
												v{d.version}
											</span>
										</Link>
										<AckButton documentId={d.id} label={t("ackNow")} />
									</li>
								))}
							</ul>
						)}
					</CardContent>
				</Card>

				<Card className="md:col-span-2">
					<CardHeader>
						<CardTitle className="text-base">{t("mentions")}</CardTitle>
					</CardHeader>
					<CardContent>
						{mentions.length === 0 ? (
							<p className="text-muted-foreground text-sm">
								{t("mentionsEmpty")}
							</p>
						) : (
							<ul className="flex flex-col divide-y divide-border/60 text-sm">
								{mentions.slice(0, 5).map((n) => (
									<li
										key={n.id}
										className="flex items-center justify-between gap-2 py-2"
									>
										<Link
											href={n.link ?? "/heute"}
											className="min-w-0 truncate hover:underline"
										>
											{n.title}
											{n.body ? (
												<span className="text-muted-foreground">
													{" "}
													— {n.body}
												</span>
											) : null}
										</Link>
										<span className="shrink-0 text-muted-foreground text-xs">
											{fmtDate.format(n.createdAt)}
										</span>
									</li>
								))}
							</ul>
						)}
					</CardContent>
				</Card>
			</div>
		</>
	);
}
