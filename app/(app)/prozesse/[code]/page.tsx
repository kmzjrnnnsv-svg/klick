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
import { OwnerChip } from "@/components/entity/owner-chip";
import { QuickCreateTask } from "@/components/entity/quick-create-task";
import { StatusBadge } from "@/components/entity/status-badge";
import { StatusButton } from "@/components/entity/status-button";
import { UserChip } from "@/components/entity/user-chip";
import { WatchButton } from "@/components/entity/watch-button";
import {
	ProcessForm,
	ProcessLinksEditor,
	RaciEditor,
} from "@/components/processes/process-forms";
import { SourceRisks } from "@/components/risks/source-risks";
import { Badge } from "@/components/ui/badge";
import { ROLE_FUNCTIONS } from "@/db/schema/enums";
import { approvalBarFor } from "@/lib/approvals/bar";
import { historyFor } from "@/lib/audit";
import { requireOrgPage } from "@/lib/auth/gates";
import { toOrgCtx } from "@/lib/auth/guards";
import { allows } from "@/lib/auth/permissions";
import { CONTROLS } from "@/lib/compliance/catalog";
import { fmtDate } from "@/lib/compliance/page-data";
import {
	listComments,
	listMembersForPicker,
	listTasks,
	listWatcherIds,
	userNames,
} from "@/lib/compliance/queries";
import {
	listAssets,
	listDocuments,
	listProviders,
	listRisks,
} from "@/lib/compliance/queries-p2";
import { getProcessByCode } from "@/lib/compliance/queries-p3";
import { readOrg } from "@/lib/db/with-org";
import { TASK_STATUS } from "@/lib/entities/task";
import {
	type ActivityEntry,
	mergeActivity,
	toHistoryItems,
} from "@/lib/history";
import { responsibleValue } from "@/lib/validation/responsible";

const IMPL_KEY = {
	not_started: "notStarted",
	planned: "planned",
	in_progress: "inProgress",
	implemented: "implemented",
	not_applicable: "notApplicable",
} as const;
const IMPL_TONE = {
	not_started: "outline",
	planned: "outline",
	in_progress: "warning",
	implemented: "success",
	not_applicable: "muted",
} as const;
const CRIT_TONE = {
	critical: "destructive",
	important: "warning",
	standard: "outline",
} as const;

export default async function ProcessDetailPage({
	params,
}: {
	params: Promise<{ code: string }>;
}) {
	const { code: raw } = await params;
	const code = decodeURIComponent(raw);
	if (!/^P-\d{2,3}$/.test(code)) notFound();
	const ctx = await requireOrgPage({ process: ["read"] });
	const t = await getTranslations("Processes");
	const tNav = await getTranslations("Nav");
	const te = await getTranslations("Entity");
	const ts = await getTranslations("Status");
	const tf = await getTranslations("Functions");
	const canEdit = allows(ctx, { process: ["update"] });

	const data = await readOrg(toOrgCtx(ctx), async (tx) => {
		const p = await getProcessByCode(tx, ctx.orgId, code);
		if (!p) return null;
		const id = p.process.id;
		const [
			comments,
			history,
			watcherIds,
			members,
			tasks,
			assets,
			providers,
			risks,
			documents,
		] = await Promise.all([
			listComments(tx, ctx.orgId, "process", id),
			historyFor(tx, `process:${id}`),
			listWatcherIds(tx, ctx.orgId, "process", id),
			listMembersForPicker(tx, ctx.orgId),
			listTasks(tx, ctx.orgId, { entityType: "process", entityId: id }),
			canEdit ? listAssets(tx, ctx.orgId) : [],
			canEdit ? listProviders(tx, ctx.orgId) : [],
			canEdit ? listRisks(tx, ctx.orgId) : [],
			canEdit ? listDocuments(tx, ctx.orgId) : [],
		]);
		const names = await userNames(tx, [
			...history.map((h) => h.actorUserId),
			...comments.map((c) => c.authorUserId),
		]);
		for (const [k, v] of p.names) names.set(k, v);
		const bar = await approvalBarFor(tx, ctx.orgId, ctx.userId, {
			type: "process",
			id,
			ownerUserId: p.process.ownerUserId,
		});
		return {
			...p,
			bar,
			comments,
			history,
			watcherIds,
			members,
			tasks,
			assets,
			providers,
			risks,
			documents,
			names,
		};
	});
	if (!data) notFound();
	const {
		process: p,
		raci,
		controls,
		assets: linkedAssets,
		providers: linkedProviders,
		risks: linkedRisks,
		documents: linkedDocs,
		comments,
		history,
		watcherIds,
		members,
		tasks,
		names,
	} = data;

	const functionLabels = Object.fromEntries(
		ROLE_FUNCTIONS.map((f) => [f, tf(f)]),
	) as Record<string, string>;
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
	const accountable = raci.find((r) => r.raci === "A");

	return (
		<EntityLayout
			back={{ href: "/prozesse", label: tNav("processes") }}
			eyebrow={`${p.code} · ${t(`category_${p.category}`)}`}
			title={p.name}
			subtitle={p.description ?? undefined}
			status={
				<StatusButton
					target={{ kind: "process", processId: p.id, status: p.status }}
					disabled={!canEdit}
				/>
			}
			actions={
				<>
					<WatchButton
						entityType="process"
						entityId={p.id}
						watching={watcherIds.includes(ctx.userId)}
					/>
					{canEdit && (
						<ProcessForm
							trigger="link"
							members={members}
							initial={{
								processId: p.id,
								name: p.name,
								description: p.description,
								category: p.category,
								criticality: p.criticality,
								ownerUserId: responsibleValue(p),
								deputyUserId: p.deputyUserId,
								rtoHours: p.rtoHours,
								rpoHours: p.rpoHours,
								mtpdHours: p.mtpdHours,
								impactNotes: p.impactNotes,
								inputs: p.inputs,
								outputs: p.outputs,
								reviewAt: p.reviewAt,
							}}
						/>
					)}
				</>
			}
			meta={
				<>
					<MetaItem label={t("criticality")}>
						<Badge variant={CRIT_TONE[p.criticality]}>
							{t(`crit_${p.criticality}`)}
						</Badge>
					</MetaItem>
					<MetaItem label={t("raciA")}>
						{accountable ? (
							accountable.userId ? (
								<UserChip name={names.get(accountable.userId)} />
							) : (
								<span>
									{functionLabels[accountable.function ?? ""] ??
										accountable.function}
								</span>
							)
						) : (
							<span className="text-destructive">{t("noAccountable")}</span>
						)}
					</MetaItem>
					<MetaItem label={t("owner")}>
						<OwnerChip
							ownerFunction={p.ownerFunction}
							name={names.get(p.ownerUserId ?? "")}
						/>
					</MetaItem>
					<MetaItem label={t("deputy")}>
						<UserChip name={names.get(p.deputyUserId ?? "")} />
					</MetaItem>
				</>
			}
			aside={
				<>
					<Section title={te("activity")}>
						<CommentForm
							entityType="process"
							entityId={p.id}
							link={`/prozesse/${p.code}`}
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
									entityType="process"
									entityId={p.id}
									members={members}
									sourceKind="manual"
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
			<ApprovalBar
				data={data.bar.data}
				names={data.bar.names}
				eligible={data.bar.eligible}
				currentUserId={ctx.userId}
			/>
			<Section title={t("bia")}>
				<dl className="grid grid-cols-1 gap-4 text-subhead sm:grid-cols-3">
					<div>
						<dt className="font-medium text-footnote text-muted-foreground">
							RTO
						</dt>
						<dd className="font-bold text-title-2">{p.rtoHours ?? "—"} h</dd>
					</div>
					<div>
						<dt className="font-medium text-footnote text-muted-foreground">
							RPO
						</dt>
						<dd className="font-bold text-title-2">{p.rpoHours ?? "—"} h</dd>
					</div>
					<div>
						<dt className="font-medium text-footnote text-muted-foreground">
							MTPD
						</dt>
						<dd className="font-bold text-title-2">{p.mtpdHours ?? "—"} h</dd>
					</div>
				</dl>
				{(p.inputs || p.outputs || p.impactNotes) && (
					<dl className="mt-4 grid grid-cols-1 gap-3 text-subhead sm:grid-cols-2">
						{p.inputs && (
							<div>
								<dt className="font-medium text-footnote text-muted-foreground">
									{t("inputs")}
								</dt>
								<dd>{p.inputs}</dd>
							</div>
						)}
						{p.outputs && (
							<div>
								<dt className="font-medium text-footnote text-muted-foreground">
									{t("outputs")}
								</dt>
								<dd>{p.outputs}</dd>
							</div>
						)}
						{p.impactNotes && (
							<div className="sm:col-span-2">
								<dt className="font-medium text-footnote text-muted-foreground">
									{t("impactNotes")}
								</dt>
								<dd>{p.impactNotes}</dd>
							</div>
						)}
					</dl>
				)}
				{p.reviewAt && (
					<p className="mt-3 text-muted-foreground text-footnote">
						{t("reviewAt")}: {fmtDate.format(new Date(p.reviewAt))}
					</p>
				)}
			</Section>

			<Section title={t("raci")}>
				<p className="mb-3 text-muted-foreground text-footnote">
					{t("raciLead")}
				</p>
				<RaciEditor
					processId={p.id}
					entries={raci.map((r) => ({
						userId: r.userId,
						function: r.function,
						raci: r.raci,
					}))}
					members={members}
					functionLabels={functionLabels}
					canEdit={canEdit}
				/>
			</Section>

			<Section
				title={t("links")}
				actions={
					canEdit ? (
						<ProcessLinksEditor
							processId={p.id}
							controls={CONTROLS.map((c) => ({
								id: c.code,
								label: c.code,
								hint: c.title,
							}))}
							assets={data.assets.map((a) => ({
								id: a.id,
								label: a.name,
								hint: a.type,
							}))}
							providers={data.providers.map((x) => ({
								id: x.id,
								label: x.name,
								hint: x.partnerType,
							}))}
							risks={data.risks.map((r) => ({
								id: r.id,
								label: `${r.code} ${r.title}`,
							}))}
							documents={data.documents.map((d) => ({
								id: d.id,
								label: `${d.docNumber} ${d.title}`,
							}))}
							linked={{
								controls: controls.map((c) => c.code),
								assets: linkedAssets.map((a) => a.id),
								providers: linkedProviders.map((x) => x.id),
								risks: linkedRisks.map((r) => r.id),
								documents: linkedDocs.map((d) => d.id),
							}}
						/>
					) : null
				}
			>
				<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
					<div>
						<p className="font-medium text-footnote mb-1 text-footnote text-muted-foreground">
							{t("controls")}
						</p>
						{controls.length === 0 ? (
							<p className="text-muted-foreground text-subhead">—</p>
						) : (
							<ul className="flex flex-col gap-1 text-subhead">
								{controls.map((c) => (
									<li key={c.code} className="flex items-center gap-2">
										<Link
											href={`/controls/${c.code}`}
											className="font-mono text-footnote hover:underline"
										>
											{c.code}
										</Link>
										<span className="min-w-0 flex-1 truncate">{c.title}</span>
										<Badge
											variant={
												IMPL_TONE[
													(c.status ?? "not_started") as keyof typeof IMPL_TONE
												]
											}
										>
											{ts(
												IMPL_KEY[
													(c.status ?? "not_started") as keyof typeof IMPL_KEY
												],
											)}
										</Badge>
									</li>
								))}
							</ul>
						)}
					</div>
					<div>
						<p className="font-medium text-footnote mb-1 text-footnote text-muted-foreground">
							{t("assets")}
						</p>
						{linkedAssets.length === 0 ? (
							<p className="text-muted-foreground text-subhead">—</p>
						) : (
							<ul className="flex flex-col gap-1 text-subhead">
								{linkedAssets.map((a) => (
									<li key={a.id}>
										<Link href="/assets" className="hover:underline">
											{a.name}
										</Link>
										<span className="text-muted-foreground text-footnote">
											{" "}
											· {a.type}
										</span>
									</li>
								))}
							</ul>
						)}
					</div>
					<div>
						<p className="font-medium text-footnote mb-1 text-footnote text-muted-foreground">
							{t("providers")}
						</p>
						{linkedProviders.length === 0 ? (
							<p className="text-muted-foreground text-subhead">—</p>
						) : (
							<ul className="flex flex-wrap gap-1.5">
								{linkedProviders.map((x) => (
									<li key={x.id}>
										<Link href="/dienstleister">
											<Badge variant={CRIT_TONE[x.criticality]} className="">
												{x.name}
											</Badge>
										</Link>
									</li>
								))}
							</ul>
						)}
					</div>
					<div>
						<div className="mb-1 flex items-center justify-between gap-2">
							<p className="font-medium text-footnote text-muted-foreground">
								{t("risks")}
							</p>
							<SourceRisks
								kind="process"
								id={data.process.id}
								risks={[]}
								canCreate={allows(ctx, { risk: ["create"] })}
								compact
							/>
						</div>
						{linkedRisks.length === 0 ? (
							<p className="text-muted-foreground text-subhead">—</p>
						) : (
							<ul className="flex flex-col gap-1 text-subhead">
								{linkedRisks.map((r) => (
									<li key={r.id}>
										<Link href={`/risiken/${r.id}`} className="hover:underline">
											<span className="font-mono text-footnote">{r.code}</span>{" "}
											{r.title}
										</Link>
									</li>
								))}
							</ul>
						)}
					</div>
					<div className="sm:col-span-2">
						<p className="font-medium text-footnote mb-1 text-footnote text-muted-foreground">
							{t("documents")}
						</p>
						{linkedDocs.length === 0 ? (
							<p className="text-muted-foreground text-subhead">—</p>
						) : (
							<ul className="flex flex-col gap-1 text-subhead">
								{linkedDocs.map((d) => (
									<li key={d.id} className="flex items-center gap-2">
										<Link
											href={`/dokumente/${encodeURIComponent(d.docNumber)}`}
											className="hover:underline"
										>
											<span className="font-mono text-footnote">
												{d.docNumber}
											</span>{" "}
											{d.title}
										</Link>
										<Badge
											variant={d.status === "published" ? "success" : "outline"}
										>
											{d.status}
										</Badge>
									</li>
								))}
							</ul>
						)}
					</div>
				</div>
			</Section>
		</EntityLayout>
	);
}
