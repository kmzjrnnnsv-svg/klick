import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import {
	DecideRequestButtons,
	RespondRequestForm,
} from "@/components/audits/audit-forms";
import { ActivityStream } from "@/components/entity/activity-stream";
import { CommentForm } from "@/components/entity/comment-form";
import {
	EntityLayout,
	MetaItem,
	Section,
} from "@/components/entity/entity-layout";
import { UserChip } from "@/components/entity/user-chip";
import { WatchButton } from "@/components/entity/watch-button";
import { withMessages } from "@/components/i18n/with-messages";
import { Badge } from "@/components/ui/badge";
import { historyFor } from "@/lib/audit";
import { requireOrgPage } from "@/lib/auth/gates";
import { toOrgCtx } from "@/lib/auth/guards";
import { allows } from "@/lib/auth/permissions";
import { maskSecret } from "@/lib/auth/visibility";
import { requestOverdue } from "@/lib/compliance/audit-workspace";
import { CONTROL_BY_CODE } from "@/lib/compliance/catalog";
import { fmtDate } from "@/lib/compliance/page-data";
import {
	listComments,
	listEvidence,
	listWatcherIds,
	userNames,
} from "@/lib/compliance/queries";
import { getAuditRequest } from "@/lib/compliance/queries-p3";
import { readOrg } from "@/lib/db/with-org";
import { berlinToday } from "@/lib/evidence-studio/queries";
import {
	type ActivityEntry,
	mergeActivity,
	toHistoryItems,
} from "@/lib/history";

const REQ_TONE = {
	open: "warning",
	answered: "default",
	accepted: "success",
	rejected: "destructive",
} as const;

// Anfrage im Audit (Teil 6, Nov 2026): Beschreibung, Control, Antwort mit
// Nachweisen, Antworten bzw. Akzeptieren/Ablehnen und Kommentare zwischen
// Prüfer:in und Organisation. Prüfer-Sicht wie im Cockpit: streng geheime
// Nachweise ohne Titel.
async function AuditRequestPage({
	params,
}: {
	params: Promise<{ id: string; requestId: string }>;
}) {
	const { id, requestId } = await params;
	const uuid = /^[0-9a-f-]{36}$/i;
	if (!uuid.test(id) || !uuid.test(requestId)) notFound();
	const ctx = await requireOrgPage({ audit: ["read"] });
	const t = await getTranslations("Audits");
	const tc = await getTranslations("Common");
	const te = await getTranslations("Entity");
	const canRespond = allows(ctx, { audit_request: ["respond"] });
	const canDecide = allows(ctx, { audit_request: ["decide"] });

	const data = await readOrg(toOrgCtx(ctx), async (tx) => {
		const r = await getAuditRequest(tx, ctx.orgId, id, requestId);
		if (!r) return null;
		const [comments, history, watcherIds, evidence] = await Promise.all([
			listComments(tx, ctx.orgId, "audit_request", requestId),
			historyFor(tx, `audit_request:${requestId}`),
			listWatcherIds(tx, ctx.orgId, "audit_request", requestId),
			listEvidence(tx, ctx.orgId),
		]);
		const names = await userNames(tx, [
			r.requestedByUserId,
			r.assigneeUserId,
			...history.map((h) => h.actorUserId),
			...comments.map((c) => c.authorUserId),
		]);
		return { r, comments, history, watcherIds, evidence, names };
	});
	if (!data) notFound();
	const { r, comments, history, watcherIds, names } = data;
	const evidence = maskSecret(
		ctx,
		data.evidence,
		(await getTranslations("Evidence"))("secretTitle"),
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
	const link = `/audits/${id}/anfragen/${requestId}`;
	const overdue = requestOverdue(r, berlinToday());
	const control = r.controlCode ? CONTROL_BY_CODE.get(r.controlCode) : null;

	return (
		<EntityLayout
			back={{ href: `/audits/${id}?tab=anfragen`, label: r.auditTitle }}
			eyebrow={t("requestEyebrow")}
			title={r.title}
			subtitle={r.description ?? undefined}
			status={
				<Badge variant={REQ_TONE[r.status]}>{t(`rstatus_${r.status}`)}</Badge>
			}
			actions={
				<WatchButton
					entityType="audit_request"
					entityId={r.id}
					watching={watcherIds.includes(ctx.userId)}
				/>
			}
			meta={
				<>
					<MetaItem label={t("requestedBy")}>
						<UserChip
							name={names.get(r.requestedByUserId ?? "")}
							fallback="—"
						/>
					</MetaItem>
					<MetaItem label={t("assignee")}>
						<UserChip
							name={names.get(r.assigneeUserId ?? "")}
							fallback={tc("nobody")}
						/>
					</MetaItem>
					<MetaItem label={t("dueAt")}>
						<span className={overdue ? "text-destructive" : undefined}>
							{r.dueAt ? fmtDate.format(new Date(r.dueAt)) : "—"}
							{overdue ? ` · ${t("overdue")}` : ""}
						</span>
					</MetaItem>
					<MetaItem label="Control">
						{r.controlCode ? (
							<Link
								href={`/controls/${r.controlCode}`}
								className="hover:underline"
								title={control?.title}
							>
								<span className="font-mono">{r.controlCode}</span>
								{control ? ` · ${control.title}` : ""}
							</Link>
						) : (
							<span className="text-muted-foreground">{t("controlNone")}</span>
						)}
					</MetaItem>
				</>
			}
			aside={
				<Section title={te("activity")}>
					<CommentForm entityType="audit_request" entityId={r.id} link={link} />
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
			}
		>
			<Section title={t("response")}>
				{r.responseNote || r.responseEvidenceIds.length > 0 ? (
					<div className="flex flex-col gap-2 text-subhead">
						{r.responseNote && (
							<p className="whitespace-pre-wrap">{r.responseNote}</p>
						)}
						{r.responseEvidenceIds.length > 0 && (
							<ul className="flex flex-wrap gap-2">
								{r.responseEvidenceIds.map((eid) => {
									const ev = evidence.find((x) => x.id === eid);
									return (
										<li key={eid}>
											<Link
												href={`/nachweise/${eid}`}
												className="hit-area inline-flex rounded-lg bg-muted px-2 py-1 text-footnote hover:bg-muted/70"
											>
												{ev?.title ?? eid.slice(0, 8)}
											</Link>
										</li>
									);
								})}
							</ul>
						)}
						{r.answeredAt && (
							<p className="text-footnote text-muted-foreground">
								{t("answeredAt", { date: fmtDate.format(r.answeredAt) })}
							</p>
						)}
					</div>
				) : (
					<p className="text-muted-foreground text-subhead">
						{t("noResponse")}
					</p>
				)}
				<div className="mt-3 flex flex-wrap gap-2">
					{canRespond && (r.status === "open" || r.status === "rejected") && (
						<RespondRequestForm
							requestId={r.id}
							evidence={evidence.map((e) => ({ id: e.id, title: e.title }))}
						/>
					)}
					{canDecide && r.status === "answered" && (
						<DecideRequestButtons requestId={r.id} />
					)}
				</div>
			</Section>
		</EntityLayout>
	);
}

export default withMessages(AuditRequestPage, [
	"Audits",
	"Auth",
	"Common",
	"Entity",
	"Functions",
	"Organisation",
]);
