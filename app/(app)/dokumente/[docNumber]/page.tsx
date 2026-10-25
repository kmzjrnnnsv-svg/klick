import { ChevronRight, Download } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ApprovalBar } from "@/components/approvals/approval-bar";
import { AckButton } from "@/components/documents/ack-button";
import { ApproverFunctionSelect } from "@/components/documents/approver-select";
import { DocumentFileForm } from "@/components/documents/document-file-form";
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
import { ResponsibleEditor } from "@/components/entity/responsible-editor";
import { StatusButton } from "@/components/entity/status-button";
import { WatchButton } from "@/components/entity/watch-button";
import { MarkdownView } from "@/components/markdown-view";
import { DecisionRequestsBlock } from "@/components/resolutions/decision-requests-block";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
	currentPublished,
	type VersionState,
	validRanges,
	versionState,
} from "@/lib/documents/versions";
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
	// Gültig ist die zuletzt veröffentlichte, nicht zurückgezogene Fassung;
	// die Arbeitskopie (Entwurf, in Prüfung, freigegeben) steht getrennt
	const current = currentPublished(versions);
	const ranges = validRanges(versions);
	const working =
		doc.status === "draft" ||
		doc.status === "in_review" ||
		doc.status === "approved";
	const acksForCurrent = current
		? acks.filter((a) => a.documentVersionId === current.id)
		: [];
	const myAck = acksForCurrent.some((a) => a.userId === ctx.userId);
	const diff =
		working && current && doc.bodyMarkdown && current.bodyMarkdown
			? diffLines(current.bodyMarkdown, doc.bodyMarkdown)
			: null;
	// Altbestand: veröffentlichte Fassung trägt einen anderen Text als die
	// Arbeitskopie (vor Migration 0042 möglich) — neu einreichen
	const stale =
		!working &&
		current !== null &&
		((current.bodyMarkdown ?? "") !== (doc.bodyMarkdown ?? "") ||
			(current.fileEvidenceId ?? null) !== (doc.fileEvidenceId ?? null));
	const stateVariant: Record<
		VersionState,
		"success" | "default" | "outline" | "muted" | "warning"
	> = {
		current: "success",
		approved: "default",
		in_review: "warning",
		draft: "outline",
		superseded: "muted",
		retired: "muted",
	};
	const basisVersions = versions
		.filter((v) => v.approvedAt || v.publishedAt)
		.map((v) => v.version);
	const workingTitle =
		doc.status === "in_review"
			? t("workingCopyReview", { version: doc.version })
			: doc.status === "approved"
				? t("workingCopyApproved", { version: doc.version })
				: t("workingCopy", { version: doc.version });
	const fileLink = (id: string, label: string) => (
		<p className="text-subhead">
			<a
				href={`/api/nachweise/${id}`}
				className="hit-area inline-flex items-center gap-1 text-primary hover:underline"
			>
				<Download aria-hidden="true" className="size-4" />
				{label}
			</a>
		</p>
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
					{current && !myAck && <AckButton documentId={doc.id} />}
					{canEdit && !working && (
						<NewVersionDialog
							documentId={doc.id}
							version={doc.version}
							basisVersions={basisVersions}
						/>
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
					<MetaItem label={t("current")}>
						{current
							? t("inForceSince", {
									version: current.version,
									date: fmtDate.format(current.publishedAt ?? new Date()),
								})
							: t("currentNone")}
					</MetaItem>
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
						<ApproverFunctionSelect
							documentId={doc.id}
							value={doc.approverFunction}
							canEdit={canEdit}
						/>
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

			<Section title={t("inForce")}>
				{current ? (
					<>
						<p className="text-muted-foreground text-footnote">
							{t("inForceSince", {
								version: current.version,
								date: fmtDate.format(current.publishedAt ?? new Date()),
							})}
						</p>
						{stale && (
							<Alert variant="warning">
								<AlertDescription>{t("staleText")}</AlertDescription>
							</Alert>
						)}
						{current.fileEvidenceId &&
							fileLink(
								current.fileEvidenceId,
								t("fileOfVersion", { version: current.version }),
							)}
						{current.bodyMarkdown && working ? (
							// während ein Entwurf läuft: Text eingeklappt, der Unterschied
							// steht unten
							<details className="group rounded-2xl bg-card text-subhead">
								<summary className="flex min-h-(--control-h) cursor-pointer items-center gap-2 px-4 text-primary">
									<ChevronRight
										aria-hidden="true"
										className="size-4 transition-transform group-open:rotate-90 motion-reduce:transition-none"
									/>
									{t("showCurrentText", { version: current.version })}
								</summary>
								<div className="border-border/60 border-t px-4 pb-4">
									<MarkdownView source={current.bodyMarkdown} />
								</div>
							</details>
						) : current.bodyMarkdown ? (
							<MarkdownView source={current.bodyMarkdown} />
						) : (
							!current.fileEvidenceId && (
								<p className="text-muted-foreground text-subhead">
									{t("noContent")}
								</p>
							)
						)}
					</>
				) : (
					<p className="text-muted-foreground text-subhead">
						{doc.status === "retired" ? t("inForceRetired") : t("inForceNone")}
					</p>
				)}
			</Section>

			{working && (
				<Section
					title={workingTitle}
					actions={
						canEdit && doc.status === "draft" ? (
							<DocumentFileForm
								documentId={doc.id}
								hasFile={doc.fileEvidenceId !== null}
							/>
						) : null
					}
				>
					{current && (
						<p className="text-muted-foreground text-footnote">
							{t("workingCopyLead", { version: current.version })}
						</p>
					)}
					{doc.changeSummary && (
						<p className="text-subhead">{doc.changeSummary}</p>
					)}
					{doc.fileEvidenceId &&
						fileLink(
							doc.fileEvidenceId,
							t("fileOfVersion", { version: doc.version }),
						)}
					<DocumentEditor
						documentId={doc.id}
						body={doc.bodyMarkdown ?? ""}
						editable={canEdit && doc.status === "draft"}
					/>
				</Section>
			)}

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
					<ul className="flex flex-col list-inset overflow-hidden rounded-2xl bg-card text-subhead">
						{versions.map((v) => {
							const state = versionState(v, doc, versions);
							const range = ranges.get(v.id);
							return (
								<li key={v.id} className="flex flex-col gap-1 px-4 py-2.5">
									<div className="flex flex-wrap items-center gap-2">
										<span className="font-medium tabular-nums">
											v{v.version}
										</span>
										<Badge variant={stateVariant[state]}>
											{t(`state_${state}`)}
										</Badge>
										<span className="min-w-0 flex-1 break-words">
											{v.changeSummary}
										</span>
									</div>
									<p className="flex flex-wrap gap-x-3 text-muted-foreground text-footnote">
										{range && (
											<span>
												{range.until
													? t("validRange", {
															from: fmtDate.format(range.from),
															until: fmtDate.format(range.until),
														})
													: t("validFrom", {
															from: fmtDate.format(range.from),
														})}
											</span>
										)}
										{v.approvedAt && (
											<span>
												{names.get(v.approvedByUserId ?? "")
													? t("approvedBy", {
															name: names.get(v.approvedByUserId ?? "") ?? "",
															date: fmtDate.format(v.approvedAt),
														})
													: t("approvedOn", {
															date: fmtDate.format(v.approvedAt),
														})}
											</span>
										)}
										{v.fileEvidenceId && (
											<a
												href={`/api/nachweise/${v.fileEvidenceId}`}
												className="hit-area inline-flex items-center gap-1 text-primary hover:underline"
											>
												<Download aria-hidden="true" className="size-3.5" />
												{t("file")}
											</a>
										)}
									</p>
								</li>
							);
						})}
					</ul>
				)}
			</Section>

			{current && (
				<Section title={t("acknowledgements")}>
					<p className="text-subhead">
						{t("ackFor", { version: current.version })} ·{" "}
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
