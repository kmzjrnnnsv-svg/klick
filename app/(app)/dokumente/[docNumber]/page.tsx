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
import { StatusButton } from "@/components/entity/status-button";
import { UserChip } from "@/components/entity/user-chip";
import { WatchButton } from "@/components/entity/watch-button";
import { Badge } from "@/components/ui/badge";
import { approverEligibility } from "@/lib/approvals/rules";
import {
	activeDelegations,
	latestRequestFor,
	loadCandidates,
} from "@/lib/approvals/service";
import { historyFor } from "@/lib/audit";
import { requireOrg, toOrgCtx } from "@/lib/auth/guards";
import { roleAllows } from "@/lib/auth/permissions";
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
import { env } from "@/lib/env";
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
	const ctx = await requireOrg({ document: ["read"] });
	const t = await getTranslations("Documents");
	const te = await getTranslations("Entity");
	const ta = await getTranslations("Approvals");
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
	const canEdit = roleAllows(ctx.orgRole, { document: ["update"] });
	const e = env();
	const storageAvailable = Boolean(
		e.S3_ENDPOINT && e.S3_ACCESS_KEY_ID && e.S3_SECRET_ACCESS_KEY,
	);
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
					entityOwnerUserId: doc.ownerUserId,
					delegations: dels,
				},
				candidates,
			).eligible,
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
						<UserChip name={names.get(doc.ownerUserId ?? "")} />
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
							<p className="text-muted-foreground text-sm">—</p>
						) : (
							<ul className="flex flex-wrap gap-1.5">
								{controls.map((c) => (
									<Link
										key={c.code}
										href={`/controls/${c.code}`}
										title={c.title}
									>
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
						{doc.legalBasisRefs.length > 0 && (
							<p className="text-muted-foreground text-xs">
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
				title={t("content")}
				actions={
					canEdit && doc.status === "draft" ? (
						<EvidenceForm
							storageAvailable={storageAvailable}
							label={t("file")}
						/>
					) : null
				}
			>
				{doc.fileEvidenceId && (
					<p className="text-sm">
						<a
							href={`/api/nachweise/${doc.fileEvidenceId}`}
							className="text-primary hover:underline"
						>
							{t("file")} ↓
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
					<pre className="max-h-96 overflow-auto rounded-md border bg-muted/30 p-3 font-mono text-xs">
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
					<p className="text-muted-foreground text-sm">{t("versionsEmpty")}</p>
				) : (
					<ul className="flex flex-col divide-y divide-border/60 rounded-md border text-sm">
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
								<span className="text-muted-foreground text-xs">
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
					<p className="text-sm">
						{t("ackQuota", {
							done: acksForCurrent.length,
							total: members.length,
						})}
					</p>
					<ul className="flex flex-wrap gap-1.5 text-xs">
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
