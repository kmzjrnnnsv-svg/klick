import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ActivityStream } from "@/components/entity/activity-stream";
import { CommentForm } from "@/components/entity/comment-form";
import { ControlTestForm } from "@/components/entity/control-test-form";
import {
	EntityLayout,
	MetaItem,
	Section,
} from "@/components/entity/entity-layout";
import { EvidenceForm } from "@/components/entity/evidence-form";
import { OwnerAssignee } from "@/components/entity/owner-assignee";
import { QuickCreateTask } from "@/components/entity/quick-create-task";
import { RequestEvidence } from "@/components/entity/request-evidence";
import { StatusBadge } from "@/components/entity/status-badge";
import { StatusButton } from "@/components/entity/status-button";
import { WatchButton } from "@/components/entity/watch-button";
import { Badge } from "@/components/ui/badge";
import { historyFor } from "@/lib/audit";
import { requireOrgPage } from "@/lib/auth/gates";
import { toOrgCtx } from "@/lib/auth/guards";
import { roleAllows } from "@/lib/auth/permissions";
import {
	CONTROL_BY_CODE,
	EDGES_BY_CONTROL,
	REQUIREMENT_BY_KEY,
} from "@/lib/compliance/catalog";
import { moduleEvidenceFor } from "@/lib/compliance/module-evidence";
import {
	fmtDate,
	frameworkNameMap,
	getOrgCoverageCached,
	shortFrameworkName,
} from "@/lib/compliance/page-data";
import {
	getControlRowByCode,
	listComments,
	listEvidenceForImplementation,
	listMembersForPicker,
	listTasks,
	listWatcherIds,
	userNames,
} from "@/lib/compliance/queries";
import { listControlTests } from "@/lib/compliance/queries-p2";
import { readOrg } from "@/lib/db/with-org";
import { TASK_STATUS } from "@/lib/entities/task";
import { env } from "@/lib/env";
import {
	type ActivityEntry,
	mergeActivity,
	toHistoryItems,
} from "@/lib/history";

export default async function ControlDetailPage({
	params,
}: {
	params: Promise<{ code: string }>;
}) {
	const { code } = await params;
	const ctx = await requireOrgPage();
	const control = CONTROL_BY_CODE.get(code);
	if (!control) notFound();
	const t = await getTranslations("Controls");
	const te = await getTranslations("Entity");
	const ts = await getTranslations("Status");
	const tf = await getTranslations("Frameworks");
	const tt = await getTranslations("Tests");

	const data = await readOrg(toOrgCtx(ctx), async (tx) => {
		const row = await getControlRowByCode(tx, ctx.orgId, code);
		if (!row) return null;
		const [evidence, tasks, comments, history, watcherIds, members, tests] =
			await Promise.all([
				listEvidenceForImplementation(tx, ctx.orgId, row.implementationId),
				listTasks(tx, ctx.orgId, {
					entityType: "control",
					entityId: row.implementationId,
				}),
				listComments(tx, ctx.orgId, "control", row.implementationId),
				historyFor(tx, `control:${row.implementationId}`),
				listWatcherIds(tx, ctx.orgId, "control", row.implementationId),
				listMembersForPicker(tx, ctx.orgId),
				listControlTests(tx, ctx.orgId, row.implementationId),
			]);
		const names = await userNames(tx, [
			...history.map((h) => h.actorUserId),
			...comments.map((c) => c.authorUserId),
		]);
		return {
			row,
			evidence,
			tasks,
			comments,
			history,
			watcherIds,
			members,
			tests,
			names,
		};
	});
	if (!data) notFound();
	const {
		row,
		evidence,
		tasks,
		comments,
		history,
		watcherIds,
		members,
		tests,
		names,
	} = data;
	const cov = await getOrgCoverageCached(ctx);
	const fwNames = frameworkNameMap();
	const canEdit = roleAllows(ctx.orgRole, { control: ["update"] });
	const e = env();
	const storageAvailable = Boolean(
		e.S3_ENDPOINT && e.S3_ACCESS_KEY_ID && e.S3_SECRET_ACCESS_KEY,
	);

	const orgFrameworks = new Set(cov?.frameworks ?? []);
	const edges = (EDGES_BY_CONTROL.get(code) ?? [])
		.map((edge) => {
			const req = REQUIREMENT_BY_KEY.get(edge.requirement);
			const status = cov?.result.byRequirement.get(edge.requirement);
			return {
				edge,
				req,
				status,
				active: req ? orgFrameworks.has(req.framework) : false,
			};
		})
		.filter((x) => x.req)
		.sort(
			(a, b) =>
				Number(b.active) - Number(a.active) ||
				a.edge.requirement.localeCompare(b.edge.requirement),
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

	const moduleEv = await readOrg(toOrgCtx(ctx), (tx) =>
		moduleEvidenceFor(tx, ctx.orgId, control.code),
	);

	return (
		<EntityLayout
			eyebrow={`${control.code} · ${t(`domain_${control.domain}`)}`}
			title={control.title}
			subtitle={control.description}
			status={
				<StatusButton
					target={{
						kind: "control",
						implementationId: row.implementationId,
						status: row.status,
					}}
					frameworkNames={Object.fromEntries(
						Object.keys(fwNames).map((s) => [s, shortFrameworkName(s)]),
					)}
					disabled={!canEdit}
				/>
			}
			actions={
				<WatchButton
					entityType="control"
					entityId={row.implementationId}
					watching={watcherIds.includes(ctx.userId)}
				/>
			}
			meta={
				<>
					<OwnerAssignee
						implementationId={row.implementationId}
						ownerUserId={row.ownerUserId}
						assigneeUserId={row.assigneeUserId}
						members={members}
						canAssign={roleAllows(ctx.orgRole, { control: ["assign"] })}
					/>
					<MetaItem label={t("effort")}>
						{t(`effort_${control.effort}`)} · {t(`kind_${control.kind}`)}
					</MetaItem>
					<MetaItem label={t("nextReview")}>
						{row.nextReviewAt
							? fmtDate.format(new Date(row.nextReviewAt))
							: "—"}
					</MetaItem>
				</>
			}
			aside={
				<>
					<Section title={te("activity")}>
						{canEdit || roleAllows(ctx.orgRole, { comment: ["create"] }) ? (
							<CommentForm
								entityType="control"
								entityId={row.implementationId}
								link={`/controls/${code}`}
							/>
						) : null}
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
									entityType="control"
									entityId={row.implementationId}
									members={members}
									defaultAssignee={row.assigneeUserId ?? undefined}
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
			{row.note && (
				<Section title={t("note")}>
					<p className="whitespace-pre-wrap text-sm">{row.note}</p>
				</Section>
			)}

			{moduleEv && (
				<Section title={t("moduleEvidence")}>
					<p className="mb-2 text-muted-foreground text-xs">
						{t("moduleEvidenceLead")}
					</p>
					<ul className="flex flex-col divide-y divide-border/60 rounded-md border text-sm">
						{moduleEv.facts.map((f) => (
							<li
								key={f.label}
								className="flex items-center justify-between gap-3 px-3 py-2"
							>
								<span>{f.label}</span>
								<Badge
									variant={
										f.ok === null ? "outline" : f.ok ? "success" : "warning"
									}
									className="normal-case tracking-normal"
								>
									{f.value}
								</Badge>
							</li>
						))}
					</ul>
					<Link
						href={moduleEv.href}
						className="mt-2 inline-block text-primary text-xs hover:underline"
					>
						{t("moduleOpen")}: {moduleEv.module} →
					</Link>
				</Section>
			)}
			<Section title={t("satisfies")}>
				<p className="text-muted-foreground text-sm">{t("satisfiesLead")}</p>
				<ul className="flex flex-col divide-y divide-border/60 rounded-md border text-sm">
					{edges.map(({ edge, req, status, active }) => (
						<li
							key={edge.requirement}
							className={`flex flex-wrap items-center gap-2 px-3 py-2 ${active ? "" : "opacity-60"}`}
						>
							<Badge
								variant="outline"
								className="font-mono normal-case tracking-normal"
							>
								{shortFrameworkName(req?.framework ?? "")} {req?.code}
							</Badge>
							<Link
								href={`/rahmenwerke/${req?.framework}/${encodeURIComponent(req?.code ?? "")}`}
								className="min-w-0 flex-1 truncate hover:underline underline-offset-4"
							>
								{req?.title}
							</Link>
							<span className="text-muted-foreground text-xs">
								{edge.coverage === "full" ? t("full") : t("partial")}
							</span>
							{active && status && (
								<Badge
									variant={
										status === "covered"
											? "success"
											: status === "partial"
												? "warning"
												: status === "not_applicable"
													? "muted"
													: "outline"
									}
								>
									{tf(
										status === "covered"
											? "covered"
											: status === "partial"
												? "partial"
												: status === "not_applicable"
													? "notApplicableShort"
													: "open",
									)}
								</Badge>
							)}
						</li>
					))}
				</ul>
			</Section>

			<Section
				title={t("evidence")}
				actions={
					canEdit ? (
						<div className="flex items-center gap-1">
							<RequestEvidence
								implementationId={row.implementationId}
								code={code}
								members={members}
							/>
							<EvidenceForm
								implementationId={row.implementationId}
								storageAvailable={storageAvailable}
								label={t("addEvidence")}
							/>
						</div>
					) : null
				}
			>
				{evidence.length === 0 ? (
					<p className="text-muted-foreground text-sm">{t("evidenceEmpty")}</p>
				) : (
					<ul className="flex flex-col divide-y divide-border/60 rounded-md border text-sm">
						{evidence.map((ev) => (
							<li
								key={ev.id}
								className="flex flex-wrap items-center gap-2 px-3 py-2"
							>
								<span className="min-w-0 flex-1 truncate font-medium">
									{ev.title}
								</span>
								<span className="text-muted-foreground text-xs">
									{fmtDate.format(ev.createdAt)}
								</span>
								{ev.storageKey ? (
									<a
										href={`/api/nachweise/${ev.id}`}
										className="text-primary text-xs hover:underline"
									>
										{ev.fileName}
									</a>
								) : ev.url ? (
									<a
										href={ev.url}
										rel="noopener nofollow"
										target="_blank"
										className="text-primary text-xs hover:underline"
									>
										{ev.url}
									</a>
								) : null}
							</li>
						))}
					</ul>
				)}
				{control.evidenceHints && control.evidenceHints.length > 0 && (
					<p className="text-muted-foreground text-xs">
						{t("evidenceHints")}: {control.evidenceHints.join(" · ")}
					</p>
				)}
			</Section>

			<Section
				title={tt("title")}
				actions={
					canEdit ? (
						<ControlTestForm
							implementationId={row.implementationId}
							defaultMethod={control.testMethodHint ?? null}
						/>
					) : null
				}
			>
				{tests.length === 0 ? (
					<p className="text-muted-foreground text-sm">{tt("empty")}</p>
				) : (
					<ul className="flex flex-col divide-y divide-border/60 rounded-md border text-sm">
						{tests.map((x) => (
							<li
								key={x.id}
								className="flex flex-wrap items-center gap-2 px-3 py-2"
							>
								<Badge
									variant="outline"
									className="normal-case tracking-normal"
								>
									{tt(`method_${x.method}`)}
								</Badge>
								<span className="min-w-0 flex-1 truncate">
									{x.scope ?? x.notes ?? ""}
								</span>
								<span className="text-muted-foreground text-xs">
									{x.testedAt ? fmtDate.format(x.testedAt) : ""} ·{" "}
									{x.names.testerUserId ?? "—"}
								</span>
								{x.result && (
									<Badge
										variant={
											x.result === "pass"
												? "success"
												: x.result === "partial"
													? "warning"
													: "destructive"
										}
									>
										{tt(`result_${x.result}`)}
									</Badge>
								)}
							</li>
						))}
					</ul>
				)}
			</Section>

			{control.implementationGuidance && (
				<Section title={t("guidance")}>
					<p className="text-sm">{control.implementationGuidance}</p>
				</Section>
			)}

			{control.recommendations && control.recommendations.length > 0 && (
				<Section title={t("recommendations")}>
					<ul className="flex flex-col gap-2 text-sm">
						{control.recommendations.map((r) => (
							<li key={r.text} className="flex gap-2">
								<Badge
									variant={
										r.level === "must"
											? "default"
											: r.level === "should"
												? "secondary"
												: "muted"
									}
								>
									{t(`level_${r.level}`)}
								</Badge>
								<span>
									{r.text}
									{r.source && (
										<span className="text-muted-foreground">
											{" "}
											— {r.source}
											{r.ref ? ` ${r.ref}` : ""}
										</span>
									)}
								</span>
							</li>
						))}
					</ul>
				</Section>
			)}

			{control.auditQuestions && control.auditQuestions.length > 0 && (
				<Section title={t("auditQuestions")}>
					<ul className="list-disc pl-5 text-sm">
						{control.auditQuestions.map((q) => (
							<li key={q}>{q}</li>
						))}
					</ul>
				</Section>
			)}
		</EntityLayout>
	);
}
