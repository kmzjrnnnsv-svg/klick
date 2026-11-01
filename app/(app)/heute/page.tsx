import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ApprovalActions } from "@/components/approvals/approval-actions";
import { AckButton } from "@/components/documents/ack-button";
import { QuickCreateTask } from "@/components/entity/quick-create-task";
import { StatusBadge } from "@/components/entity/status-badge";
import { withMessages } from "@/components/i18n/with-messages";
import { PageHeader } from "@/components/page-header";
import {
	CompleteTrainingButton,
	CourseLink,
} from "@/components/registers/training-plan-forms";
import { NextStepsList } from "@/components/today/next-steps";
import {
	DueBadge,
	TodayCard,
	TodayEmpty,
	TodayList,
	TodayMeta,
	TodayRow,
} from "@/components/today/today-list";
import { orgSettings } from "@/db/schema";
import { listRequestsForUser } from "@/lib/approvals/service";
import { signDocumentOf } from "@/lib/approvals/signature";
import { requireOrgPage } from "@/lib/auth/gates";
import { toOrgCtx } from "@/lib/auth/guards";
import { allows } from "@/lib/auth/permissions";
import { nextSteps } from "@/lib/compliance/next-steps";
import { fmtDate, getOrgCoverageCached } from "@/lib/compliance/page-data";
import {
	listControlRows,
	listMembersForPicker,
	listTasks,
} from "@/lib/compliance/queries";
import { listAssessments } from "@/lib/compliance/queries-assessments";
import {
	loadOrgNextStepFacts,
	personalStepFacts,
} from "@/lib/compliance/queries-next-steps";
import {
	listTrainingAssignments,
	listTrainingRequirements,
	pendingAcknowledgements,
} from "@/lib/compliance/queries-p2";
import {
	listNonconformities,
	listObligationRuns,
} from "@/lib/compliance/queries-p3";
import { readOrg } from "@/lib/db/with-org";
import { entityHref, resolveEntityTitles } from "@/lib/entities/links";
import { TASK_STATUS } from "@/lib/entities/task";
import { termsAccepted } from "@/lib/legal/terms";
import { listNotifications } from "@/lib/notifications/query";
import { safeInternalPath } from "@/lib/safe-path";
import {
	setupState,
	shouldRedirectToSetup,
	stepHref,
} from "@/lib/setup/steps";
import { currentTrainings } from "@/lib/trainings/assignments";

// Startseite nach Login: gestapelte Abschnitte, je max. fünf Einträge —
// Freigaben, Aufgaben, Fälliges, Kenntnisnahmen, Erwähnungen.
async function TodayPage() {
	const ctx = await requireOrgPage(undefined, { employees: true });
	// Mitarbeitende: ihre Startseite sind die Richtlinien
	if (ctx.orgRole === "employee") redirect("/richtlinien");
	const t = await getTranslations("Today");
	const tt = await getTranslations("Trainings");
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
		trainingRows,
		trainingReqs,
		gapAnalyses,
		setupFlags,
		orgFacts,
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
			trainingRows: (await listTrainingAssignments(tx, ctx.orgId)).filter(
				(a) => a.userId === ctx.userId,
			),
			trainingReqs: await listTrainingRequirements(tx, ctx.orgId),
			gapAnalyses: await listAssessments(tx, ctx.orgId, "self"),
			// gilt für die ganze Org, zwischengespeichert bis zur nächsten Änderung
			orgFacts: await loadOrgNextStepFacts(tx, ctx.orgId),
			setupFlags:
				(
					await tx
						.select({ flags: orgSettings.setupFlags })
						.from(orgSettings)
						.where(eq(orgSettings.organizationId, ctx.orgId))
						.limit(1)
				)[0]?.flags ?? {},
			ncs: (await listNonconformities(tx, ctx.orgId)).filter(
				(n) =>
					n.status !== "closed" &&
					(n.ownerUserId === ctx.userId || n.assigneeUserId === ctx.userId) &&
					n.dueAt !== null &&
					n.dueAt <= weekAhead,
			),
		};
	});

	// Geführte Einrichtung (D0): neue Orgs landen dort, bis die Rahmenwerke
	// stehen; danach (und für Bestands-Orgs) eine Karte, bis alles erledigt ist.
	const canSetup = allows(ctx, { settings: ["update"] });
	// Vom Klick-Betrieb angelegte Organisation: Inhaber:in bestätigt zuerst
	// die Nutzungsbedingungen
	if (ctx.orgRole === "owner" && !termsAccepted(setupFlags))
		redirect("/zustimmung");
	const setup = setupState(setupFlags);
	if (canSetup && shouldRedirectToSetup(setup))
		redirect(stepHref(setup.next ?? "rollen"));

	// „Als Nächstes“: Einrichtung und Gap-Analyse für diese Person, der Rest
	// gilt für die Org (S2)
	const steps = nextSteps({
		...orgFacts,
		...(await personalStepFacts({
			setup,
			canSetup,
			canCreateGap: allows(ctx, { assessment: ["create"] }),
			gapAnalyses,
			coverage: () => getOrgCoverageCached(ctx),
		})),
	});

	const dueTasks = tasks.filter((x) => x.dueAt && x.dueAt <= weekAhead);
	const reqById = new Map(trainingReqs.map((r) => [r.id, r]));
	const myTrainings = [...currentTrainings(trainingRows, today).values()]
		.filter((x) => x.open && (x.state === "due" || x.state === "overdue"))
		.map((x) => ({
			...x,
			req: x.open ? reqById.get(x.open.requirementId) : undefined,
		}))
		.sort((a, b) => (a.open?.dueAt ?? "").localeCompare(b.open?.dueAt ?? ""));
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
				actions={<QuickCreateTask members={members} label={t("newTask")} />}
			/>
			<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
				<NextStepsList steps={steps} className="md:col-span-2" />
				{myTrainings.length > 0 && (
					<TodayCard
						title={tt("heuteTitle")}
						link={{ href: "/schulungen?tab=meine", label: t("showAll") }}
						className="md:col-span-2"
					>
						<TodayList>
							{myTrainings.slice(0, 5).map((x) => (
								<TodayRow
									key={x.open?.id}
									title={x.req?.title}
									sub={<CourseLink url={x.req?.courseUrl} />}
									date={
										x.open && (
											<DueBadge
												date={x.open.dueAt}
												today={today}
												soonDays={30}
												overdueLabel={t("overdue")}
											/>
										)
									}
									action={
										x.open && (
											<CompleteTrainingButton
												assignmentId={x.open.id}
												title={x.req?.title ?? ""}
											/>
										)
									}
								/>
							))}
						</TodayList>
					</TodayCard>
				)}
				<TodayCard
					title={t("approvals")}
					link={{ href: "/heute/freigaben", label: t("showAll") }}
				>
					{approvals.length === 0 ? (
						<TodayEmpty>{t("approvalsEmpty")}</TodayEmpty>
					) : (
						<TodayList>
							{approvals.slice(0, 5).map((r) => {
								const title =
									approvalTitles.get(`${r.entityType}:${r.entityId}`) ??
									r.workflowName;
								return (
									<TodayRow
										key={r.id}
										href={entityHref(r.entityType, r.entityId, title)}
										title={
											<>
												<span className="text-muted-foreground">
													{r.workflowName} ·{" "}
												</span>
												{title}
											</>
										}
										below={
											<ApprovalActions
												requestId={r.id}
												eligible={r.eligible}
												mine={false}
												compact
												signDocumentId={signDocumentOf(r)}
											/>
										}
									/>
								);
							})}
						</TodayList>
					)}
				</TodayCard>

				<TodayCard
					title={t("tasks")}
					link={{ href: "/heute/aufgaben", label: t("showAll") }}
				>
					{tasks.length === 0 ? (
						<TodayEmpty>{t("tasksEmpty")}</TodayEmpty>
					) : (
						<TodayList>
							{tasks.slice(0, 5).map((task) => (
								<TodayRow
									key={task.id}
									title={task.title}
									date={
										task.dueAt && (
											<DueBadge
												date={task.dueAt}
												today={today}
												overdueLabel={t("overdue")}
											/>
										)
									}
									action={
										<StatusBadge
											machine={TASK_STATUS}
											status={task.status}
											label={ts(TASK_STATUS.labelKey[task.status] as "todo")}
											className="min-w-20"
										/>
									}
								/>
							))}
						</TodayList>
					)}
				</TodayCard>

				<TodayCard
					title={t("due")}
					link={{ href: "/heute/verantwortung", label: t("accountability") }}
				>
					{dueTasks.length === 0 &&
					dueReviews.length === 0 &&
					runs.length === 0 &&
					ncs.length === 0 ? (
						<TodayEmpty>{t("dueEmpty")}</TodayEmpty>
					) : (
						<TodayList>
							{dueReviews.slice(0, 5).map((c) => (
								<TodayRow
									key={c.implementationId}
									href={`/controls/${c.code}`}
									title={`${t("reviewDue", { code: c.code })} · ${c.title}`}
									date={
										c.nextReviewAt && (
											<DueBadge
												date={c.nextReviewAt}
												today={today}
												overdueLabel={t("overdue")}
											/>
										)
									}
								/>
							))}
							{runs.slice(0, 5).map((r) => (
								<TodayRow
									key={r.id}
									href="/kalender"
									title={`${t("obligationDue")} · ${r.title}`}
									date={
										<DueBadge
											date={r.dueAt}
											today={today}
											overdueLabel={t("overdue")}
										/>
									}
								/>
							))}
							{ncs.slice(0, 5).map((n) => (
								<TodayRow
									key={n.id}
									href={`/abweichungen/${n.id}`}
									title={`${n.code} · ${n.title}`}
									date={
										n.dueAt && (
											<DueBadge
												date={n.dueAt}
												today={today}
												overdueLabel={t("overdue")}
											/>
										)
									}
								/>
							))}
							{dueTasks.slice(0, 5).map((task) => (
								<TodayRow
									key={task.id}
									href="/heute/aufgaben"
									title={task.title}
									date={
										task.dueAt && (
											<DueBadge
												date={task.dueAt}
												today={today}
												overdueLabel={t("overdue")}
											/>
										)
									}
								/>
							))}
						</TodayList>
					)}
				</TodayCard>

				<TodayCard title={t("acknowledgements")}>
					{acks.length === 0 ? (
						<TodayEmpty>{t("acknowledgementsEmpty")}</TodayEmpty>
					) : (
						<TodayList>
							{acks.slice(0, 5).map((d) => (
								<TodayRow
									key={d.id}
									href={`/dokumente/${encodeURIComponent(d.docNumber)}`}
									title={
										<>
											<span className="font-mono text-footnote" translate="no">
												{d.docNumber}
											</span>{" "}
											{d.title}{" "}
											<span className="text-muted-foreground">
												v{d.version}
											</span>
										</>
									}
									action={<AckButton documentId={d.id} label={t("ackNow")} />}
								/>
							))}
						</TodayList>
					)}
				</TodayCard>

				<TodayCard title={t("mentions")} className="md:col-span-2">
					{mentions.length === 0 ? (
						<TodayEmpty>{t("mentionsEmpty")}</TodayEmpty>
					) : (
						<TodayList>
							{mentions.slice(0, 5).map((n) => (
								<TodayRow
									key={n.id}
									href={safeInternalPath(n.link)}
									title={
										<>
											{n.title}
											{n.body ? (
												<span className="text-muted-foreground">
													{" "}
													— {n.body}
												</span>
											) : null}
										</>
									}
									date={<TodayMeta>{fmtDate.format(n.createdAt)}</TodayMeta>}
								/>
							))}
						</TodayList>
					)}
				</TodayCard>
			</div>
		</>
	);
}

export default withMessages(TodayPage, [
	"Approvals",
	"Auth",
	"Common",
	"Documents",
	"Entity",
	"Functions",
	"Organisation",
	"Settings",
	"Tasks",
	"Trainings",
]);
