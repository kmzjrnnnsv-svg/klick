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
import { StatusBadge } from "@/components/entity/status-badge";
import { StatusButton } from "@/components/entity/status-button";
import { UrlTabs } from "@/components/entity/url-tabs";
import { UserChip } from "@/components/entity/user-chip";
import {
	AddFindingDialog,
	EngagementFileUpload,
	EngagementScopeForm,
	EngagementSummaryForm,
	RetestControls,
} from "@/components/security/engagement-forms";
import { ScanImportDialog } from "@/components/security/security-forms";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { historyFor } from "@/lib/audit";
import { requireOrgPage } from "@/lib/auth/gates";
import { toOrgCtx } from "@/lib/auth/guards";
import { roleAllows } from "@/lib/auth/permissions";
import { fmtDate } from "@/lib/compliance/page-data";
import { listComments, userNames } from "@/lib/compliance/queries";
import { getEngagementDetail } from "@/lib/compliance/queries-engagements";
import { readOrg } from "@/lib/db/with-org";
import { ENGAGEMENT_STATUS_MACHINE } from "@/lib/entities/engagement";
import {
	FINDING_STATUS_MACHINE,
	SEVERITY_TONE,
} from "@/lib/entities/security-finding";
import { findingRef } from "@/lib/export/engagement-report";
import { mergeActivity, toHistoryItems } from "@/lib/history";
import { engagementGate } from "@/lib/security/engagement-rules";
import { cn } from "@/lib/utils";

const TABS = ["umfang", "befunde", "nachtest", "bericht"] as const;
type Tab = (typeof TABS)[number];
type Search = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

const RESULT_TONE = {
	pass: "success",
	partial: "warning",
	fail: "destructive",
} as const;

// Sicherheitsauftrag: Umfang und Beauftragung → Befunde (manuell/Import) →
// Nachtest → Bericht (Summary, Datei, ZIP). Lieferung trägt den
// Wirksamkeitstest ein (/testprogramm).
export default async function EngagementPage({
	params,
	searchParams,
}: {
	params: Promise<{ id: string }>;
	searchParams: Promise<Search>;
}) {
	const { id } = await params;
	if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
	const sp = await searchParams;
	const ctx = await requireOrgPage({ security: ["read"] });
	const t = await getTranslations("Engagements");
	const ts = await getTranslations("Security");
	const tst = await getTranslations("Status");
	const te = await getTranslations("Entity");
	const data = await readOrg(toOrgCtx(ctx), async (tx) => {
		const d = await getEngagementDetail(tx, ctx.orgId, id);
		if (!d) return null;
		const [comments, history] = await Promise.all([
			listComments(tx, ctx.orgId, "security_engagement", id),
			historyFor(tx, `security_engagement:${id}`),
		]);
		const names = await userNames(tx, [
			...history.map((h) => h.actorUserId),
			...comments.map((c) => c.authorUserId),
		]);
		for (const [k, v] of d.names) names.set(k, v);
		return { ...d, comments, history, names };
	});
	if (!data) notFound();
	const e = data.engagement;
	const tab: Tab = (TABS as readonly string[]).includes(one(sp.tab) ?? "")
		? (one(sp.tab) as Tab)
		: "umfang";
	const canEdit = roleAllows(ctx.orgRole, { security: ["update"] });
	const canCreate = roleAllows(ctx.orgRole, { security: ["create"] });
	const closed = e.status === "closed" || e.status === "cancelled";
	const scopeLocked = !(e.status === "planned" || e.status === "authorized");
	const findingsOpen = data.findings.filter(
		(f) => f.status === "open" || f.status === "in_progress",
	);
	const canAddFindings = canCreate && !closed && e.status !== "planned";
	const base = `/sicherheit/auftraege/${e.id}`;
	// Was fehlt für den nächsten Schritt? (gleiche Regeln wie die Action)
	const next = ENGAGEMENT_STATUS_MACHINE.transitions.find(
		(x) => x.from === e.status && x.primary,
	);
	const blocker = next ? engagementGate(next.to, e, data.findings) : null;
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
			eyebrow={`${e.code} · ${t(`kind_${e.kind}`)}`}
			title={e.title}
			subtitle={
				data.product ? `${data.product.code} ${data.product.name}` : undefined
			}
			status={
				<StatusButton
					target={{
						kind: "security_engagement",
						engagementId: e.id,
						status: e.status,
					}}
					disabled={!canEdit}
				/>
			}
			actions={
				<div className="flex flex-wrap gap-2">
					<Link
						href="/sicherheit?tab=auftraege"
						className={buttonVariants({ variant: "outline", size: "sm" })}
					>
						{t("toList")}
					</Link>
					{roleAllows(ctx.orgRole, { export: ["create"] }) && (
						<a
							href={`/api/export/sicherheitsauftrag.zip?id=${e.id}`}
							className={buttonVariants({ variant: "outline", size: "sm" })}
							title={t("exportHint")}
						>
							{t("export")}
						</a>
					)}
				</div>
			}
			meta={
				<>
					<MetaItem label={t("period")}>
						{e.startAt
							? `${fmtDate.format(new Date(e.startAt))} – ${e.endAt ? fmtDate.format(new Date(e.endAt)) : "…"}`
							: "—"}
					</MetaItem>
					<MetaItem label={t("authorization")}>
						{e.kind === "quick_check"
							? t("authorizationNotNeeded")
							: data.authorization
								? t("authorizationPresent")
								: t("authorizationMissing")}
					</MetaItem>
					<MetaItem label={t("findings")}>
						{t("findingsShort", {
							total: data.findings.length,
							open: findingsOpen.length,
						})}
					</MetaItem>
					<MetaItem label={t("result")}>
						{e.result ? (
							<Badge variant={RESULT_TONE[e.result]}>
								{t(`result_${e.result}`)}
							</Badge>
						) : (
							"—"
						)}
					</MetaItem>
					<MetaItem label={t("owner")}>
						<UserChip name={data.names.get(e.ownerUserId ?? "")} />
					</MetaItem>
				</>
			}
			aside={
				<Section title={te("activity")}>
					<CommentForm
						entityType="security_engagement"
						entityId={e.id}
						link={base}
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
			}
		>
			{blocker && canEdit && (
				<p
					role="status"
					className="mb-4 rounded-md border border-warning/60 bg-warning/10 p-3 text-sm"
				>
					{tst(`gate_${blocker}`)}
				</p>
			)}
			{e.statusNote && (
				<p className="mb-4 text-muted-foreground text-sm">{e.statusNote}</p>
			)}
			<UrlTabs
				base={base}
				active={tab}
				tabs={TABS.map((x) => ({
					value: x,
					label: t(`tab_${x}`),
					count:
						x === "befunde"
							? data.findings.length
							: x === "nachtest"
								? data.findings.filter((f) => f.retestStatus === "pending")
										.length || undefined
								: undefined,
				}))}
			/>

			{tab === "umfang" && (
				<>
					{e.kind !== "quick_check" && (
						<Section title={t("authorizationTitle")}>
							<p className="mb-3 text-sm">{t("authorizationLead")}</p>
							{data.authorization ? (
								<p className="mb-3 text-sm">
									<a
										href={`/api/nachweise/${data.authorization.id}`}
										className="hover:underline"
									>
										{data.authorization.title}
									</a>
									<span className="text-muted-foreground text-xs">
										{" "}
										· {fmtDate.format(data.authorization.createdAt)}
										{e.authorizedAt &&
											` · ${t("authorizedBy", {
												name: data.names.get(e.authorizedByUserId ?? "") ?? "—",
												date: fmtDate.format(e.authorizedAt),
											})}`}
									</span>
								</p>
							) : (
								<p className="mb-3 text-destructive text-sm">
									{t("authorizationMissingLead")}
								</p>
							)}
							{canEdit && !scopeLocked && (
								<EngagementFileUpload
									engagementId={e.id}
									fileRole="authorization"
									label={
										data.authorization
											? t("authorizationReplace")
											: t("authorizationUpload")
									}
								/>
							)}
						</Section>
					)}
					<Section title={t("scopeTitle")}>
						<EngagementScopeForm
							engagementId={e.id}
							initial={e}
							scopeLocked={scopeLocked}
							disabled={!canEdit || closed}
						/>
					</Section>
				</>
			)}

			{tab === "befunde" && (
				<Section
					title={t("findings")}
					actions={
						canAddFindings ? (
							<div className="flex flex-wrap gap-2">
								<ScanImportDialog products={[]} engagementId={e.id} />
								<AddFindingDialog
									engagementId={e.id}
									defaultTarget={e.targets[0] ?? ""}
								/>
							</div>
						) : null
					}
				>
					{e.status === "planned" && (
						<p className="mb-3 text-muted-foreground text-sm">
							{t("findingsAfterAuthorization")}
						</p>
					)}
					{data.findings.length === 0 ? (
						<p className="text-sm">{t("findingsEmpty")}</p>
					) : (
						<ul className="flex flex-col divide-y divide-border/60 rounded-md border text-sm">
							{data.findings.map((f, i) => (
								<li
									key={f.id}
									className="flex flex-col gap-1 px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
								>
									<span className="min-w-0">
										<Link
											href={`/sicherheit/befunde/${f.id}`}
											className="font-medium hover:underline"
										>
											<span className="font-mono text-xs" translate="no">
												{findingRef(i)}
											</span>{" "}
											{f.title}
										</Link>
										<span className="block text-muted-foreground text-xs">
											{[
												f.cvss !== null ? `CVSS ${f.cvss.toFixed(1)}` : null,
												f.cwe,
												f.location ?? f.target,
												f.tool !== "manual" ? ts("imported") : null,
											]
												.filter(Boolean)
												.join(" · ")}
										</span>
									</span>
									<span className="flex shrink-0 items-center gap-2">
										<Badge variant={SEVERITY_TONE[f.severity]}>
											{ts(`sev_${f.severity}`)}
										</Badge>
										<StatusBadge
											machine={FINDING_STATUS_MACHINE}
											status={f.status}
											label={tst(
												FINDING_STATUS_MACHINE.labelKey[f.status] as "sfOpen",
											)}
										/>
									</span>
								</li>
							))}
						</ul>
					)}
				</Section>
			)}

			{tab === "nachtest" && (
				<Section title={t("retestTitle")}>
					<p className="mb-3 text-muted-foreground text-sm">
						{e.retestDueAt
							? t("retestLead", {
									date: fmtDate.format(new Date(e.retestDueAt)),
								})
							: t("retestLeadNone")}
					</p>
					{data.findings.length === 0 ? (
						<p className="text-sm">{t("findingsEmpty")}</p>
					) : (
						<ul className="flex flex-col divide-y divide-border/60 rounded-md border text-sm">
							{data.findings.map((f, i) => (
								<li
									key={f.id}
									className="flex flex-col gap-2 px-3 py-2 lg:flex-row lg:items-start lg:justify-between"
								>
									<span className="min-w-0">
										<span className="font-mono text-xs" translate="no">
											{findingRef(i)}
										</span>{" "}
										{f.title}
										<span className="block text-muted-foreground text-xs">
											{ts(`sev_${f.severity}`)} ·{" "}
											{tst(
												FINDING_STATUS_MACHINE.labelKey[f.status] as "sfOpen",
											)}
											{f.retestStatus && ` · ${t(`retest_${f.retestStatus}`)}`}
											{f.retestedAt && ` · ${fmtDate.format(f.retestedAt)}`}
										</span>
										{f.retestNote && (
											<span className="block text-muted-foreground text-xs">
												{f.retestNote}
											</span>
										)}
									</span>
									{canEdit &&
										(e.status === "delivered" || e.status === "retest") && (
											<RetestControls findingId={f.id} />
										)}
								</li>
							))}
						</ul>
					)}
				</Section>
			)}

			{tab === "bericht" && (
				<>
					<Section title={t("reportTitle")}>
						<EngagementSummaryForm
							engagementId={e.id}
							summary={e.summary}
							retestDueAt={e.retestDueAt}
							disabled={!canEdit || closed}
						/>
					</Section>
					<Section title={t("reportFile")}>
						{data.report ? (
							<p className="mb-3 text-sm">
								<a
									href={`/api/nachweise/${data.report.id}`}
									className="hover:underline"
								>
									{data.report.title}
								</a>
								<span className="text-muted-foreground text-xs">
									{" "}
									· {fmtDate.format(data.report.createdAt)}
								</span>
							</p>
						) : (
							<p className="mb-3 text-muted-foreground text-sm">
								{t("reportFileNone")}
							</p>
						)}
						{canEdit && !closed && (
							<EngagementFileUpload
								engagementId={e.id}
								fileRole="report"
								label={data.report ? t("reportReplace") : t("reportUpload")}
							/>
						)}
					</Section>
					<Section title={t("deliveryTitle")}>
						<p
							className={cn(
								"text-sm",
								!e.deliveredAt && "text-muted-foreground",
							)}
						>
							{e.deliveredAt
								? t("deliveredInfo", {
										date: fmtDate.format(e.deliveredAt),
										tests: e.controlTestIds.length,
									})
								: t("deliveryLead")}
						</p>
						{e.deliveredAt && (
							<Link
								href="/testprogramm"
								className="mt-2 inline-block text-primary text-sm hover:underline"
							>
								{t("toTestProgramme")}
							</Link>
						)}
					</Section>
				</>
			)}
		</EntityLayout>
	);
}
