import { PenLine } from "lucide-react";
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
import { SheetView } from "@/components/evidence-studio/sheet-view";
import {
	ControlExplainerCard,
	ControlRelationsSection,
} from "@/components/relations/control-relations";
import { SourceRisksBlock } from "@/components/risks/source-risks";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { historyFor } from "@/lib/audit";
import { requireOrgPage } from "@/lib/auth/gates";
import { toOrgCtx } from "@/lib/auth/guards";
import { allows } from "@/lib/auth/permissions";
import { maskSecret } from "@/lib/auth/visibility";
import { CONTROL_BY_CODE } from "@/lib/compliance/catalog";
import { responsibleOptions } from "@/lib/compliance/function-holders-service";
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
import { kindHashesFor } from "@/lib/evidence-studio/generate/service";
import { loadSheetData, sheetFor } from "@/lib/evidence-studio/queries";
import {
	type ActivityEntry,
	mergeActivity,
	toHistoryItems,
} from "@/lib/history";

export default async function ControlDetailPage({
	params,
	searchParams,
}: {
	params: Promise<{ code: string }>;
	searchParams: Promise<{ alle?: string }>;
}) {
	const { code } = await params;
	const showAll = (await searchParams).alle === "1";
	const ctx = await requireOrgPage();
	const control = CONTROL_BY_CODE.get(code);
	if (!control) notFound();
	const t = await getTranslations("Controls");
	const tNav = await getTranslations("Nav");
	const ta = await getTranslations("Authoring");
	const te = await getTranslations("Entity");
	const ts = await getTranslations("Status");
	const tt = await getTranslations("Tests");

	const data = await readOrg(toOrgCtx(ctx), async (tx) => {
		const row = await getControlRowByCode(tx, ctx.orgId, code);
		if (!row) return null;
		const [
			evidence,
			tasks,
			comments,
			history,
			watcherIds,
			members,
			tests,
			functions,
		] = await Promise.all([
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
			responsibleOptions(tx, ctx.orgId),
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
			functions,
		};
	});
	if (!data) notFound();
	const tev = await getTranslations("Evidence");
	// streng geheime Nachweise ohne Grant: ohne Titel (Prüfer-Sicht)
	const evidence = maskSecret(ctx, data.evidence, tev("secretTitle"));
	const {
		row,
		tasks,
		comments,
		history,
		watcherIds,
		members,
		tests,
		functions,
		names,
	} = data;
	const cov = await getOrgCoverageCached(ctx);
	const fwNames = frameworkNameMap(cov?.catalog);
	const canEdit = allows(ctx, { control: ["update"] });

	const orgFrameworks = new Set(cov?.frameworks ?? []);
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
	const tes = await getTranslations("EvidenceStudio");
	const sheet = cov
		? sheetFor(
				await readOrg(toOrgCtx(ctx), (tx) => loadSheetData(tx, ctx.orgId, cov)),
				control.code,
			)
		: null;
	const kindHashes = sheet
		? await readOrg(toOrgCtx(ctx), (tx) =>
				kindHashesFor(tx, ctx.orgId, [sheet]),
			)
		: undefined;

	return (
		<EntityLayout
			back={{ href: "/controls", label: tNav("controls") }}
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
						Object.keys(fwNames).map((s) => [
							s,
							shortFrameworkName(s, cov?.catalog),
						]),
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
						ownerFunction={row.ownerFunction}
						assigneeUserId={row.assigneeUserId}
						members={members}
						functions={functions}
						canAssign={allows(ctx, { control: ["assign"] })}
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
					<SourceRisksBlock
						ctx={ctx}
						kind="control"
						catalogKey={{ controlCode: code }}
					/>
					<Section title={te("activity")}>
						{canEdit || allows(ctx, { comment: ["create"] }) ? (
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
			<ControlExplainerCard code={code} />
			<ControlRelationsSection
				code={code}
				orgFrameworks={[...orgFrameworks]}
				statusByRequirement={cov?.result.byRequirement}
				showAll={showAll}
				allHref={`/controls/${encodeURIComponent(code)}?alle=1#wer-verlangt-das`}
				mineHref={`/controls/${encodeURIComponent(code)}#wer-verlangt-das`}
				catalog={cov?.catalog}
			/>

			{row.note && (
				<Section title={t("note")}>
					<p className="whitespace-pre-wrap text-subhead">{row.note}</p>
				</Section>
			)}

			{moduleEv && (
				<Section title={t("moduleEvidence")}>
					<p className="mb-2 text-muted-foreground text-footnote">
						{t("moduleEvidenceLead")}
					</p>
					<ul className="flex flex-col list-inset overflow-hidden rounded-2xl bg-card text-subhead">
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
									className=""
								>
									{f.value}
								</Badge>
							</li>
						))}
					</ul>
					<Link
						href={moduleEv.href}
						className="mt-2 inline-block text-primary text-footnote hover:underline"
					>
						{t("moduleOpen")}: {moduleEv.module}
					</Link>
				</Section>
			)}
			{sheet && (
				<Section id="nachweisbogen" title={tes("title")}>
					<SheetView
						sheet={sheet}
						canEdit={canEdit}
						canCreateEvidence={allows(ctx, { evidence: ["create"] })}
						currentHashes={kindHashes}
						evidenceOptions={evidence.map((e) => ({
							id: e.id,
							title: e.title,
						}))}
					/>
				</Section>
			)}

			<Section
				title={t("evidence")}
				actions={
					canEdit ? (
						<div className="flex flex-wrap items-center gap-1">
							<RequestEvidence
								implementationId={row.implementationId}
								code={code}
								members={members}
							/>
							<EvidenceForm
								implementationId={row.implementationId}
								label={t("addEvidence")}
							/>
							<Button asChild variant="outline" size="sm">
								<Link href={`/nachweise/verfassen?control=${code}`}>
									<PenLine aria-hidden="true" />
									{ta("galleryLink")}
								</Link>
							</Button>
						</div>
					) : null
				}
			>
				{evidence.length === 0 ? (
					<p className="text-muted-foreground text-subhead">
						{t("evidenceEmpty")}
					</p>
				) : (
					<ul className="flex flex-col list-inset overflow-hidden rounded-2xl bg-card text-subhead">
						{evidence.map((ev) => (
							<li
								key={ev.id}
								className="flex flex-wrap items-center gap-2 px-3 py-2"
							>
								<span className="min-w-0 flex-1 truncate font-medium">
									{ev.title}
								</span>
								<span className="text-muted-foreground text-footnote">
									{fmtDate.format(ev.createdAt)}
								</span>
								{ev.storageKey ? (
									<a
										href={`/api/nachweise/${ev.id}`}
										className="text-primary text-footnote hover:underline"
									>
										{ev.fileName}
									</a>
								) : ev.url ? (
									<a
										href={ev.url}
										rel="noopener noreferrer nofollow"
										target="_blank"
										className="text-primary text-footnote hover:underline"
									>
										{ev.url}
									</a>
								) : null}
							</li>
						))}
					</ul>
				)}
				{control.evidenceHints && control.evidenceHints.length > 0 && (
					<p className="text-muted-foreground text-footnote">
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
					<p className="text-muted-foreground text-subhead">{tt("empty")}</p>
				) : (
					<ul className="flex flex-col list-inset overflow-hidden rounded-2xl bg-card text-subhead">
						{tests.map((x) => (
							<li
								key={x.id}
								className="flex flex-wrap items-center gap-2 px-3 py-2"
							>
								<Badge variant="outline" className="">
									{tt(`method_${x.method}`)}
								</Badge>
								<span className="min-w-0 flex-1 truncate">
									{x.scope ?? x.notes ?? ""}
								</span>
								<span className="text-muted-foreground text-footnote">
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
					<p className="text-subhead">{control.implementationGuidance}</p>
				</Section>
			)}

			{control.recommendations && control.recommendations.length > 0 && (
				<Section title={t("recommendations")}>
					<ul className="flex flex-col gap-2 text-subhead">
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
					<ul className="list-disc pl-5 text-subhead">
						{control.auditQuestions.map((q) => (
							<li key={q}>{q}</li>
						))}
					</ul>
				</Section>
			)}
		</EntityLayout>
	);
}
