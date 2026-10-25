import { Download } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ApprovalBar } from "@/components/approvals/approval-bar";
import { AckButton } from "@/components/documents/ack-button";
import {
	DocumentEditor,
	NewVersionDialog,
} from "@/components/documents/document-forms";
import { ActivityStream } from "@/components/entity/activity-stream";
import { CommentForm } from "@/components/entity/comment-form";
import {
	EntityLayout,
	MetaItem,
	Section,
} from "@/components/entity/entity-layout";
import { EvidenceForm } from "@/components/entity/evidence-form";
import { ResponsibleEditor } from "@/components/entity/responsible-editor";
import { StatusButton } from "@/components/entity/status-button";
import { WatchButton } from "@/components/entity/watch-button";
import { DecisionRequestsBlock } from "@/components/resolutions/decision-requests-block";
import { Badge } from "@/components/ui/badge";
import { canDecideNow } from "@/lib/approvals/rules";
import {
	activeDelegations,
	latestRequestFor,
	loadCandidates,
} from "@/lib/approvals/service";
import { historyFor } from "@/lib/audit";
import { requireOrgPage } from "@/lib/auth/gates";
import { toOrgCtx } from "@/lib/auth/guards";
import { allows } from "@/lib/auth/permissions";
import { fmtDate } from "@/lib/compliance/page-data";
import {
	listComments,
	listMembersForPicker,
	listWatcherIds,
	userNames,
} from "@/lib/compliance/queries";
import { getDocumentByNumber } from "@/lib/compliance/queries-p2";
import { readOrg } from "@/lib/db/with-org";
import { diffLines } from "@/lib/documents/diff";
import {
	type ActivityEntry,
	mergeActivity,
	toHistoryItems,
} from "@/lib/history";

export default async function DocumentDetailPage({
	params,
}: {
	params: Promise<{ docNumber: string }>;
}) {
	const { docNumber: raw } = await params;
	const docNumber = decodeURIComponent(raw);
	const ctx = await requireOrgPage({ document: ["read"] });
	const t = await getTranslations("Documents");
	const tNav = await getTranslations("Nav");
	const te = await getTranslations("Entity");
	const data = await readOrg(toOrgCtx(ctx), async (tx) => {
		const d = await getDocumentByNumber(tx, ctx.orgId, docNumber);
		if (!d) return null;
		const [comments, history, watcherIds, members, approval, candidates, dels] =
			await Promise.all([
				listComments(tx, ctx.orgId, "document", d.doc.id),
				historyFor(tx, `document:${d.doc.id}`),
				listWatcherIds(tx, ctx.orgId, "document", d.doc.id),
				listMembersForPicker(tx, ctx.orgId),
				latestRequestFor(tx, ctx.orgId, "document", d.doc.id),
				loadCandidates(tx, ctx.orgId),
				activeDelegations(tx, ctx.orgId),
			]);
		const names = await userNames(tx, [
			...history.map((h) => h.actorUserId),
			...comments.map((c) => c.authorUserId),
			...(approval?.decisions.map((x) => x.approverUserId) ?? []),
		]);
		for (const [k, v] of d.names) names.set(k, v);
		return {
			...d,
			comments,
			history,
			watcherIds,
			members,
			approval,
			candidates,
			dels,
			names,
		};
	});
	if (!data) notFound();
	const {
		doc,
		versions,
		controls,
		acks,
		comments,
		history,
		watcherIds,
		members,
		approval,
		candidates,
		dels,
		names,
	} = data;
	const canEdit = allows(ctx, { document: ["update"] });
	const me = candidates.find((c) => c.userId === ctx.userId);
	const step = approval?.steps.find((s) => s.order === approval.currentStep);
	const eligible = Boolean(
		approval &&
			approval.status === "pending" &&
			step &&
			me &&
			canDecideNow(
				step,
				me,
				{
					requesterUserId: approval.requestedByUserId,
					entityOwnerUserId: doc.ownerUserId,
					delegations: dels,
				},
				candidates,
				approval.decisions.filter((d) => d.step === approval.currentStep),
			),
	);
	const currentVersion = versions.find((v) => v.version === doc.version);
	const acksForCurrent = currentVersion
		? acks.filter((a) => a.documentVersionId === currentVersion.id)
		: [];
	const myAck = acksForCurrent.some((a) => a.userId === ctx.userId);
	const published = versions.filter((v) => v.publishedAt);
	const prev = published.find((v) => v.version !== doc.version);
	const diff =
		prev && doc.bodyMarkdown && prev.bodyMarkdown
			? diffLines(prev.bodyMarkdown, doc.bodyMarkdown)
			: null;

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
			back={{ href: "/dokumente", label: tNav("documents") }}
			eyebrow={`${doc.docNumber} · ${t(`type_${doc.type}`)} · v${doc.version}`}
			title={doc.title}
			status={
				<StatusButton
					target={{ kind: "document", documentId: doc.id, status: doc.status }}
					disabled={!canEdit}
				/>
			}
			actions={
				<>
					{doc.status === "published" && !myAck && (
						<AckButton documentId={doc.id} />
					)}
					{canEdit && doc.status !== "draft" && (
						<NewVersionDialog documentId={doc.id} />
					)}
					<WatchButton
						entityType="document"
						entityId={doc.id}
						watching={watcherIds.includes(ctx.userId)}
					/>
				</>
			}
			meta={
				<>
					<MetaItem label={t("owner")}>
						<ResponsibleEditor
							entity="document"
							id={doc.id}
							ownerUserId={doc.ownerUserId}
							ownerFunction={doc.ownerFunction}
							ownerName={names.get(doc.ownerUserId ?? "") ?? null}
							members={members}
							canEdit={canEdit}
						/>
					</MetaItem>
					<MetaItem label={t("approver")}>
						{doc.approverFunction ?? "—"}
					</MetaItem>
					<MetaItem label={t("classification")}>{doc.classification}</MetaItem>
					<MetaItem label={t("nextReview")}>
						{doc.nextReviewAt
							? fmtDate.format(new Date(doc.nextReviewAt))
							: "—"}
					</MetaItem>
				</>
			}
			aside={
				<>
					<DecisionRequestsBlock
						ctx={ctx}
						kind="document"
						id={doc.id}
						title={`${doc.docNumber} ${doc.title}`}
					/>
					<Section title={te("activity")}>
						<CommentForm
							entityType="document"
							entityId={doc.id}
							link={`/dokumente/${encodeURIComponent(doc.docNumber)}`}
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
					<Section title={t("controls")}>
						{controls.length === 0 ? (
							<p className="text-muted-foreground text-subhead">—</p>
						) : (
							<ul className="flex flex-wrap gap-1.5">
								{controls.map((c) => (
									<Link
										key={c.code}
										href={`/controls/${c.code}`}
										title={c.title}
									>
										<Badge variant="outline" className="font-mono">
											{c.code}
										</Badge>
									</Link>
								))}
							</ul>
						)}
						{doc.legalBasisRefs.length > 0 && (
							<p className="text-muted-foreground text-footnote">
								{t("requirements")}: {doc.legalBasisRefs.join(" · ")}
							</p>
						)}
					</Section>
				</>
			}
		>
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

			<Section
				title={t("content")}
				actions={
					canEdit && doc.status === "draft" ? (
						<EvidenceForm label={t("file")} />
					) : null
				}
			>
				{doc.fileEvidenceId && (
					<p className="text-subhead">
						<a
							href={`/api/nachweise/${doc.fileEvidenceId}`}
							className="inline-flex items-center gap-1 text-primary hover:underline"
						>
							<Download aria-hidden="true" className="size-4" />
							{t("file")}
						</a>
					</p>
				)}
				<DocumentEditor
					documentId={doc.id}
					body={doc.bodyMarkdown ?? ""}
					editable={canEdit && doc.status === "draft"}
				/>
			</Section>

			{diff && (
				<Section title={t("diff")}>
					<pre className="max-h-96 overflow-auto rounded-xl bg-muted p-3 font-mono text-footnote">
						{diff.map((l, i) => (
							<div
								// biome-ignore lint/suspicious/noArrayIndexKey: Diff-Zeilen haben keine eigene Identität
								key={`${i}-${l.type}`}
								className={
									l.type === "add"
										? "bg-success/15"
										: l.type === "del"
											? "bg-destructive/10 line-through"
											: ""
								}
							>
								{l.type === "add" ? "+ " : l.type === "del" ? "− " : "  "}
								{l.text}
							</div>
						))}
					</pre>
				</Section>
			)}

			<Section title={t("versions")}>
				{versions.length === 0 ? (
					<p className="text-muted-foreground text-subhead">
						{t("versionsEmpty")}
					</p>
				) : (
					<ul className="flex flex-col divide-y divide-border/60 overflow-hidden rounded-2xl bg-card text-subhead">
						{versions.map((v) => (
							<li
								key={v.id}
								className="flex flex-wrap items-center gap-2 px-3 py-2"
							>
								<Badge
									variant={v.version === doc.version ? "default" : "outline"}
								>
									v{v.version}
								</Badge>
								<span className="min-w-0 flex-1 truncate">
									{v.changeSummary}
								</span>
								<span className="text-muted-foreground text-footnote">
									{v.approvedAt
										? `✓ ${names.get(v.approvedByUserId ?? "") ?? ""} ${fmtDate.format(v.approvedAt)}`
										: ""}
									{v.publishedAt ? ` · ${fmtDate.format(v.publishedAt)}` : ""}
								</span>
							</li>
						))}
					</ul>
				)}
			</Section>

			{doc.status === "published" && (
				<Section title={t("acknowledgements")}>
					<p className="text-subhead">
						{t("ackQuota", {
							done: acksForCurrent.length,
							total: members.length,
						})}
					</p>
					<ul className="flex flex-wrap gap-1.5 text-footnote">
						{members.map((m) => {
							const done = acksForCurrent.some((a) => a.userId === m.userId);
							return (
								<Badge key={m.userId} variant={done ? "success" : "muted"}>
									{m.name}
								</Badge>
							);
						})}
					</ul>
				</Section>
			)}
		</EntityLayout>
	);
}
