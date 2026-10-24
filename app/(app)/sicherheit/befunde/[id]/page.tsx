import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ActivityStream } from "@/components/entity/activity-stream";
import { CommentForm } from "@/components/entity/comment-form";
import {
	EntityLayout,
	MetaItem,
	Section,
} from "@/components/entity/entity-layout";
import { StatusButton } from "@/components/entity/status-button";
import { SourceRisksBlock } from "@/components/risks/source-risks";
import { AcceptFindingDialog } from "@/components/security/security-forms";
import { Badge } from "@/components/ui/badge";
import { historyFor } from "@/lib/audit";
import { requireOrgPage } from "@/lib/auth/gates";
import { toOrgCtx } from "@/lib/auth/guards";
import { allows } from "@/lib/auth/permissions";
import { CONTROL_BY_CODE } from "@/lib/compliance/catalog";
import { fmtDate } from "@/lib/compliance/page-data";
import { listComments, userNames } from "@/lib/compliance/queries";
import { getFindingDetail } from "@/lib/compliance/queries-security";
import { readOrg } from "@/lib/db/with-org";
import { SEVERITY_TONE } from "@/lib/entities/security-finding";
import { mergeActivity, toHistoryItems } from "@/lib/history";
import { SCAN_TOOL_LABEL } from "@/lib/security/parsers";
import { remediationFor } from "@/lib/security/remediation";

// Sicherheitsbefund: Schwere, Fundstelle, Erklärung und Abhilfe (je Stack),
// SLA, Verknüpfung zu Abweichung, Aufgabe, Produkt und Control.
export default async function FindingPage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const { id } = await params;
	if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
	const ctx = await requireOrgPage({ security: ["read"] });
	const t = await getTranslations("Security");
	const te = await getTranslations("Entity");
	const tg = await getTranslations("Engagements");
	const data = await readOrg(toOrgCtx(ctx), async (tx) => {
		const d = await getFindingDetail(tx, ctx.orgId, id);
		if (!d) return null;
		const [comments, history] = await Promise.all([
			listComments(tx, ctx.orgId, "security_finding", id),
			historyFor(tx, `security_finding:${id}`),
		]);
		const names = await userNames(tx, [
			...history.map((h) => h.actorUserId),
			...comments.map((c) => c.authorUserId),
		]);
		for (const [k, v] of d.names) names.set(k, v);
		return { ...d, comments, history, names };
	});
	if (!data) notFound();
	const f = data.finding;
	const canEdit = allows(ctx, { security: ["update"] });
	const canAccept = allows(ctx, { security: ["accept"] });
	const now = new Date();
	const open = f.status === "open" || f.status === "in_progress";
	const fix = remediationFor(f.ruleId, f.category);
	const control = f.controlCode ? CONTROL_BY_CODE.get(f.controlCode) : null;
	const entries = mergeActivity(
		toHistoryItems(data.history),
		data.comments.map((c) => ({
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
			eyebrow={`${SCAN_TOOL_LABEL[f.tool]} · ${t(`cat_${f.category}`)}`}
			title={f.title}
			subtitle={f.location ?? undefined}
			status={
				<StatusButton
					target={{
						kind: "security_finding",
						findingId: f.id,
						status: f.status,
					}}
					disabled={!canEdit}
				/>
			}
			actions={
				open && canAccept ? <AcceptFindingDialog findingId={f.id} /> : null
			}
			meta={
				<>
					<MetaItem label={t("severity")}>
						<Badge variant={SEVERITY_TONE[f.severity]}>
							{t(`sev_${f.severity}`)}
						</Badge>
						{f.cvss !== null && (
							<span
								className="ml-2 text-muted-foreground text-footnote tabular-nums"
								title={f.cvssVector ?? undefined}
							>
								CVSS {f.cvss.toFixed(1)}
							</span>
						)}
					</MetaItem>
					<MetaItem label={t("due")}>
						<span
							className={
								open && f.dueAt && f.dueAt < now
									? "text-destructive"
									: undefined
							}
						>
							{f.dueAt ? fmtDate.format(f.dueAt) : "—"}
						</span>
					</MetaItem>
					<MetaItem label={t("seen")}>
						{fmtDate.format(f.firstSeenAt)} – {fmtDate.format(f.lastSeenAt)}
					</MetaItem>
					{f.retestStatus && (
						<MetaItem label={tg("retestTitle")}>
							{tg(`retest_${f.retestStatus}`)}
							{f.retestedAt && ` · ${fmtDate.format(f.retestedAt)}`}
						</MetaItem>
					)}
					<MetaItem label={t("ids")}>
						{[...new Set([f.cve, f.cwe, f.ruleId].filter(Boolean))].join(
							" · ",
						) || "—"}
					</MetaItem>
				</>
			}
			aside={
				<>
					<SourceRisksBlock ctx={ctx} kind="security_finding" id={id} />
					<Section title={te("activity")}>
						<CommentForm
							entityType="security_finding"
							entityId={f.id}
							link={`/sicherheit/befunde/${f.id}`}
						/>
						<ActivityStream
							entries={entries}
							names={data.names}
							labels={{
								empty: te("activityEmpty"),
								changed: te("changed"),
								commented: te("commented"),
								system: te("system"),
							}}
						/>
					</Section>
				</>
			}
		>
			{f.status === "accepted" && (
				<p className="mb-4 rounded-2xl bg-card p-3 text-subhead">
					{t("acceptedInfo", {
						until: f.acceptedUntil
							? fmtDate.format(new Date(f.acceptedUntil))
							: "—",
						note: f.statusNote ?? "",
					})}
				</p>
			)}
			{f.status !== "accepted" && f.statusNote && (
				<p className="mb-4 text-muted-foreground text-subhead">
					{f.statusNote}
				</p>
			)}

			<Section title={t("what")}>
				<p className="text-subhead">{data.details?.description ?? fix.why}</p>
				{f.packageName && (
					<p className="mt-2 text-subhead">
						{t("package", {
							name: f.packageName,
							version: f.packageVersion ?? "?",
						})}
						{f.fixedVersion &&
							` · ${t("fixedIn", { version: f.fixedVersion })}`}
					</p>
				)}
				{data.details?.evidence && (
					<p
						className="mt-2 whitespace-pre-line font-mono text-muted-foreground text-footnote"
						translate="no"
					>
						{data.details.evidence}
					</p>
				)}
				{f.retestNote && (
					<p className="mt-2 text-subhead">
						{tg("retestNote")} {f.retestNote}
					</p>
				)}
			</Section>

			<Section title={t("fix")}>
				{data.details?.remediation && (
					<p className="mb-2 text-subhead">{data.details.remediation}</p>
				)}
				<p className="mb-2 text-muted-foreground text-subhead">{fix.why}</p>
				<ul className="list-disc pl-5 text-subhead">
					{fix.fix.map((x) => (
						<li key={x}>{x}</li>
					))}
				</ul>
			</Section>

			<Section title={te("links")}>
				<ul className="flex flex-col gap-1 text-subhead">
					{control && (
						<li>
							Control:{" "}
							<Link
								href={`/controls/${control.code}`}
								className="hover:underline"
							>
								{control.code} {control.title}
							</Link>
						</li>
					)}
					{data.engagement && (
						<li>
							{tg("engagement")}:{" "}
							<Link
								href={`/sicherheit/auftraege/${data.engagement.id}?tab=befunde`}
								className="hover:underline"
							>
								{data.engagement.code} {data.engagement.title}
							</Link>
						</li>
					)}
					{data.product && (
						<li>
							{t("product")}:{" "}
							<Link
								href={`/produkte/${data.product.id}?tab=befunde`}
								className="hover:underline"
							>
								{data.product.code} {data.product.name}
							</Link>
						</li>
					)}
					{data.nonconformity && (
						<li>
							{t("nonconformity")}:{" "}
							<Link
								href={`/abweichungen/${data.nonconformity.id}`}
								className="hover:underline"
							>
								{data.nonconformity.code}
							</Link>
						</li>
					)}
					{data.task && (
						<li>
							{t("task")}:{" "}
							<Link href="/heute/aufgaben" className="hover:underline">
								{data.task.title}
							</Link>
						</li>
					)}
					{data.scan && (
						<li>
							{t("lastScan")}: {data.scan.toolName ?? "—"} ·{" "}
							{fmtDate.format(data.scan.startedAt)}
							{data.scan.evidenceId && (
								<>
									{" · "}
									<a
										href={`/api/nachweise/${data.scan.evidenceId}`}
										className="underline"
									>
										{t("rawReport")}
									</a>
								</>
							)}
						</li>
					)}
					{f.reopenCount > 0 && <li>{t("reopened", { n: f.reopenCount })}</li>}
				</ul>
			</Section>
		</EntityLayout>
	);
}
