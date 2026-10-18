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
import { QuickCreateTask } from "@/components/entity/quick-create-task";
import { StatusBadge } from "@/components/entity/status-badge";
import { UrlTabs } from "@/components/entity/url-tabs";
import { UserChip } from "@/components/entity/user-chip";
import { ProviderForm } from "@/components/registers/provider-form";
import { DecisionRequestsBlock } from "@/components/resolutions/decision-requests-block";
import { SourceRisksBlock } from "@/components/risks/source-risks";
import { StartRatingButton } from "@/components/supplier/start-rating-button";
import {
	ContractClausesForm,
	PortalLinkDialog,
	RevokeLinkButton,
	StartSupplierAssessmentDialog,
} from "@/components/supplier/supplier-forms";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { approvalBarFor } from "@/lib/approvals/bar";
import { historyFor } from "@/lib/audit";
import { requireOrgPage } from "@/lib/auth/gates";
import { toOrgCtx } from "@/lib/auth/guards";
import { allows } from "@/lib/auth/permissions";
import { ART30_CLAUSES } from "@/lib/compliance/catalog/art30-clauses";
import { SUPPLIER_TEMPLATES } from "@/lib/compliance/catalog/questionnaires";
import { fmtDate } from "@/lib/compliance/page-data";
import {
	listComments,
	listMembersForPicker,
	listTasks,
	userNames,
} from "@/lib/compliance/queries";
import { listProviderRatings } from "@/lib/compliance/queries-ratings";
import { getProviderDetail } from "@/lib/compliance/queries-suppliers";
import { supplierQuestions } from "@/lib/compliance/supplier-assessment";
import { TRAFFIC_TONE } from "@/lib/compliance/supplier-rating";
import { readOrg } from "@/lib/db/with-org";
import { TASK_STATUS } from "@/lib/entities/task";
import { mergeActivity, toHistoryItems } from "@/lib/history";

const TABS = [
	"stammdaten",
	"bewertungen",
	"vertrag",
	"nachweise",
	"prozesse",
] as const;
type Tab = (typeof TABS)[number];
type Search = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

const RATING_TONE = {
	A: "success",
	B: "success",
	C: "warning",
	D: "destructive",
} as const;

// Dienstleister: Stammdaten, Lieferantenbewertungen (Fragebogen mit
// Portal-Link), Vertrag nach DORA Art. 30, Nachweise aus den Bewertungen,
// verknüpfte Prozesse und Assets.
export default async function ProviderPage({
	params,
	searchParams,
}: {
	params: Promise<{ id: string }>;
	searchParams: Promise<Search>;
}) {
	const { id } = await params;
	if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
	const sp = await searchParams;
	const ctx = await requireOrgPage({ provider: ["read"] });
	const t = await getTranslations("Suppliers");
	const tr = await getTranslations("Rating");
	const tp = await getTranslations("Providers");
	const ta = await getTranslations("Assessment");
	const te = await getTranslations("Entity");
	const ts = await getTranslations("Status");
	const tev = await getTranslations("Evidence");
	const data = await readOrg(toOrgCtx(ctx), async (tx) => {
		const d = await getProviderDetail(tx, ctx.orgId, id);
		if (!d) return null;
		const [comments, history, members, tasks, ratings] = await Promise.all([
			listComments(tx, ctx.orgId, "provider", id),
			historyFor(tx, `provider:${id}`),
			listMembersForPicker(tx, ctx.orgId),
			listTasks(tx, ctx.orgId, { entityType: "provider", entityId: id }),
			listProviderRatings(tx, ctx.orgId, id),
		]);
		const names = await userNames(tx, [
			...history.map((h) => h.actorUserId),
			...comments.map((c) => c.authorUserId),
		]);
		for (const [k, v] of d.names) names.set(k, v);
		const bar = await approvalBarFor(tx, ctx.orgId, ctx.userId, {
			type: "provider",
			id,
			ownerUserId: d.provider.ownerUserId,
		});
		return { ...d, comments, history, members, tasks, ratings, names, bar };
	});
	if (!data) notFound();
	const p = data.provider;
	const tab: Tab = (TABS as readonly string[]).includes(one(sp.tab) ?? "")
		? (one(sp.tab) as Tab)
		: "stammdaten";
	const canEdit = allows(ctx, { provider: ["update"] });
	const canAssess = canEdit && allows(ctx, { assessment: ["create"] });
	const base = `/dienstleister/${p.id}`;
	const critical = p.criticality === "critical" || p.isMaterial;
	const latest = data.assessments.find((a) => a.status === "completed");
	const dd = p.dueDiligence;
	const clauses = ART30_CLAUSES.map((c) => ({
		...c,
		required: !c.criticalOnly || critical,
	}));
	const clauseValues = p.contractClauses ?? {};
	const clauseDone = clauses.filter(
		(c) => c.required && clauseValues[c.code] === true,
	).length;
	const clauseRequired = clauses.filter((c) => c.required).length;
	const lastContact = data.assessments.find((a) => a.contactEmail);
	const templates = SUPPLIER_TEMPLATES.map((x) => ({
		code: x.code,
		title: x.title,
		description: x.description,
		questions: supplierQuestions(x, p).length,
	}));
	const defaultTemplate =
		p.isIct && (p.isOutsourcing || p.partnerType === "ict")
			? ("dora-ikt" as const)
			: ("nis2-sw" as const);
	const now = new Date();
	const nextDue = p.nextAssessmentAt ? new Date(p.nextAssessmentAt) : null;
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
			eyebrow={`${tp(`partner_${p.partnerType}`)} · ${tp(`crit_${p.criticality}`)}`}
			title={p.name}
			subtitle={p.serviceDescription ?? undefined}
			actions={
				<div className="flex flex-wrap gap-2">
					<Link
						href="/dienstleister"
						className={buttonVariants({ variant: "outline", size: "sm" })}
					>
						{t("toRegister")}
					</Link>
					{canEdit && (
						<ProviderForm
							members={data.members}
							trigger="link"
							initial={{
								providerId: p.id,
								name: p.name,
								partnerType: p.partnerType,
								serviceType: p.serviceType,
								serviceDescription: p.serviceDescription,
								category: p.category,
								status: p.status,
								criticality: p.criticality,
								isIct: p.isIct,
								isOutsourcing: p.isOutsourcing,
								isMaterial: p.isMaterial,
								country: p.country,
								processesPersonalData: p.processesPersonalData,
								contractRef: p.contractRef,
								contractStart: p.contractStart,
								contractEnd: p.contractEnd,
								dataLocations: p.dataLocations,
								noticePeriodDays: p.noticePeriodDays,
								ownerUserId: p.ownerUserId,
								notes: p.notes,
							}}
						/>
					)}
				</div>
			}
			meta={
				<>
					<MetaItem label={t("lastAssessment")}>
						{p.lastAssessmentAt ? (
							<>
								{fmtDate.format(new Date(p.lastAssessmentAt))}
								{dd?.method === "rating" && dd.traffic ? (
									<Badge
										className="ml-2"
										variant={
											TRAFFIC_TONE[
												String(dd.traffic) as keyof typeof TRAFFIC_TONE
											]
										}
									>
										{String(dd.level)}
									</Badge>
								) : null}
								{dd?.method !== "rating" && latest?.rating && (
									<Badge
										className="ml-2"
										variant={
											RATING_TONE[latest.rating as keyof typeof RATING_TONE] ??
											"muted"
										}
									>
										{latest.rating}
									</Badge>
								)}
							</>
						) : (
							t("never")
						)}
					</MetaItem>
					<MetaItem label={t("nextAssessment")}>
						<span
							className={
								nextDue && nextDue < now ? "text-destructive" : undefined
							}
						>
							{nextDue ? fmtDate.format(nextDue) : "—"}
						</span>
					</MetaItem>
					<MetaItem label={t("clauses")}>
						{t("clausesProgress", { done: clauseDone, total: clauseRequired })}
					</MetaItem>
					<MetaItem label={tp("owner")}>
						<UserChip name={data.names.get(p.ownerUserId ?? "")} />
					</MetaItem>
				</>
			}
			aside={
				<>
					<SourceRisksBlock ctx={ctx} kind="provider" id={id} />
					<DecisionRequestsBlock ctx={ctx} kind="provider" id={id} />
					<Section
						title={te("tasks")}
						actions={
							canEdit ? (
								<QuickCreateTask
									entityType="provider"
									entityId={p.id}
									members={data.members}
								/>
							) : null
						}
					>
						{data.tasks.length === 0 ? (
							<p className="text-muted-foreground text-sm">
								{te("tasksEmpty")}
							</p>
						) : (
							<ul className="flex flex-col gap-2 text-sm">
								{data.tasks.map((task) => (
									<li
										key={task.id}
										className="flex items-start justify-between gap-2 rounded-md border p-2"
									>
										<div className="min-w-0">
											<p className="truncate">{task.title}</p>
											<p className="text-muted-foreground text-xs">
												{task.assigneeName ?? "—"}
												{task.dueAt ? ` · ${task.dueAt}` : ""}
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
					<Section title={te("activity")}>
						<CommentForm entityType="provider" entityId={p.id} link={base} />
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
			<ApprovalBar
				data={data.bar.data}
				names={data.bar.names}
				eligible={data.bar.eligible}
				currentUserId={ctx.userId}
			/>
			<UrlTabs
				base={base}
				active={tab}
				tabs={TABS.map((x) => ({
					value: x,
					label: t(`tab_${x}`),
					count:
						x === "bewertungen"
							? data.assessments.length
							: x === "nachweise"
								? data.files.length
								: x === "prozesse"
									? data.processes.length + data.assets.length
									: undefined,
				}))}
			/>

			{tab === "stammdaten" && (
				<>
					<Section title={t("profile")}>
						<dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
							<div>
								<dt className="text-muted-foreground text-xs">
									{tp("serviceType")}
								</dt>
								<dd>{p.serviceType ? tp(`service_${p.serviceType}`) : "—"}</dd>
							</div>
							<div>
								<dt className="text-muted-foreground text-xs">
									{tp("country")}
								</dt>
								<dd>{p.country ?? "—"}</dd>
							</div>
							<div>
								<dt className="text-muted-foreground text-xs">
									{tp("contract")}
								</dt>
								<dd>
									{p.contractRef ?? "—"}
									{p.contractEnd &&
										` · ${tp("contractEnd")} ${fmtDate.format(new Date(p.contractEnd))}`}
									{p.noticePeriodDays !== null &&
										` · ${t("noticeDays", { n: p.noticePeriodDays })}`}
								</dd>
							</div>
							<div>
								<dt className="text-muted-foreground text-xs">DORA</dt>
								<dd className="flex flex-wrap gap-1">
									{p.isIct && <Badge variant="outline">{tp("isIct")}</Badge>}
									{p.isOutsourcing && (
										<Badge variant="outline">{tp("isOutsourcing")}</Badge>
									)}
									{p.isMaterial && (
										<Badge variant="outline">{tp("isMaterial")}</Badge>
									)}
									{p.processesPersonalData && !p.dpaSignedAt && (
										<Badge variant="destructive">{tp("dpaMissing")}</Badge>
									)}
									{!p.isIct && !p.isOutsourcing && !p.isMaterial && "—"}
								</dd>
							</div>
							{p.dataLocations.length > 0 && (
								<div>
									<dt className="text-muted-foreground text-xs">
										{tp("dataLocations")}
									</dt>
									<dd>{p.dataLocations.join(", ")}</dd>
								</div>
							)}
						</dl>
						{p.notes && (
							<p className="mt-3 whitespace-pre-line text-muted-foreground text-sm">
								{p.notes}
							</p>
						)}
					</Section>
					<Section title={t("dueDiligence")}>
						{dd?.method === "rating" ? (
							<p className="text-sm">
								{tr("ddSummary", {
									date: dd.assessedAt
										? fmtDate.format(new Date(String(dd.assessedAt)))
										: "—",
									code: String(dd.ratingCode ?? "—"),
									level: String(dd.level ?? "—"),
									score: String(dd.score ?? "—").replace(".", ","),
									recommendation: String(dd.recommendation ?? "—"),
									decision: tr(
										`decision_${String(dd.decision ?? "open")}` as "decision_open",
									),
								})}
								{dd.decisionNote && (
									<span className="mt-1 block text-muted-foreground">
										{String(dd.decisionNote)}
									</span>
								)}
							</p>
						) : dd ? (
							<p className="text-sm">
								{t("ddSummary", {
									date: dd.assessedAt
										? fmtDate.format(new Date(String(dd.assessedAt)))
										: "—",
									code: String(dd.assessmentCode ?? "—"),
									rating: String(dd.rating ?? "—"),
									score: String(dd.score ?? "—"),
									decision: t(
										`decision_${String(dd.decision ?? "accept")}` as "decision_accept",
									),
								})}
								{dd.knockouts &&
									` ${t("ddKnockouts", { list: String(dd.knockouts) })}`}
								{dd.decisionNote && (
									<span className="mt-1 block text-muted-foreground">
										{String(dd.decisionNote)}
									</span>
								)}
							</p>
						) : (
							<p className="text-muted-foreground text-sm">{t("ddEmpty")}</p>
						)}
					</Section>
				</>
			)}

			{tab === "bewertungen" && (
				<Section
					title={tr("internalTitle")}
					actions={
						canEdit ? (
							<StartRatingButton
								providerId={p.id}
								draftId={data.ratings.find((r) => r.status === "draft")?.id}
							/>
						) : null
					}
				>
					<p className="mb-3 text-muted-foreground text-sm">
						{tr("internalLead")}
					</p>
					{data.ratings.length === 0 ? (
						<p className="text-sm">{tr("internalEmpty")}</p>
					) : (
						<ul className="flex flex-col divide-y divide-border/60 rounded-md border text-sm">
							{data.ratings.map((r) => (
								<li
									key={r.id}
									className="flex flex-wrap items-center gap-3 px-3 py-2"
								>
									<Link
										href={`${base}/bewertung/${r.id}`}
										className="font-mono text-xs hover:underline"
									>
										{r.code}
									</Link>
									{r.status === "draft" ? (
										<Badge variant="muted">{tr("draft")}</Badge>
									) : (
										<>
											{r.traffic && (
												<Badge variant={TRAFFIC_TONE[r.traffic]}>
													{r.level}
												</Badge>
											)}
											<span className="tabular-nums">
												{r.totalScore?.toFixed(2).replace(".", ",")} ·{" "}
												{Math.round(((r.totalScore ?? 0) / 5) * 100)} %
											</span>
											<span>{tr(`decision_${r.decision}`)}</span>
										</>
									)}
									<span className="ml-auto text-muted-foreground text-xs">
										{r.completedAt
											? fmtDate.format(r.completedAt)
											: fmtDate.format(r.createdAt)}
									</span>
								</li>
							))}
						</ul>
					)}
				</Section>
			)}
			{tab === "bewertungen" && (
				<Section
					title={t("assessments")}
					actions={
						canAssess ? (
							<StartSupplierAssessmentDialog
								providerId={p.id}
								templates={templates}
								defaultTemplate={defaultTemplate}
								contact={{
									name: lastContact?.contactName ?? null,
									email: lastContact?.contactEmail ?? null,
								}}
							/>
						) : null
					}
				>
					<p className="mb-3 text-muted-foreground text-sm">
						{t("assessmentsLead")}
					</p>
					{data.assessments.length === 0 ? (
						<p className="text-sm">{t("assessmentsEmpty")}</p>
					) : (
						<ul className="flex flex-col gap-3">
							{data.assessments.map((a) => {
								const open =
									a.status !== "completed" && a.status !== "cancelled";
								return (
									<li
										key={a.id}
										className="flex flex-col gap-2 rounded-md border p-3 text-sm"
									>
										<div className="flex flex-wrap items-start justify-between gap-2">
											<div className="min-w-0">
												<Link
													href={`/gap-analyse/${a.id}${a.status === "submitted" || a.status === "in_review" ? "?schritt=bewertung" : ""}`}
													className="font-medium hover:underline"
												>
													<span className="font-mono text-xs" translate="no">
														{a.code}
													</span>{" "}
													{a.title}
												</Link>
												<p className="text-muted-foreground text-xs">
													{ta(`status_${a.status}`)} ·{" "}
													{ta("progress", {
														answered: a.answered,
														total: a.questions.length,
													})}
													{a.dueAt &&
														` · ${t("dueOn", { date: fmtDate.format(new Date(a.dueAt)) })}`}
													{a.contactEmail &&
														` · ${a.contactName ? `${a.contactName}, ` : ""}${a.contactEmail}`}
												</p>
											</div>
											<div className="flex items-center gap-2">
												{a.rating && (
													<Badge
														variant={
															RATING_TONE[
																a.rating as keyof typeof RATING_TONE
															] ?? "muted"
														}
													>
														{t("rating", { rating: a.rating })}
													</Badge>
												)}
												{a.decision && (
													<Badge variant="muted">
														{t(`decision_${a.decision}`)}
													</Badge>
												)}
											</div>
										</div>
										{open && (
											<div className="flex flex-wrap items-center gap-2 border-t pt-2">
												<span className="text-muted-foreground text-xs">
													{a.link?.active
														? t("linkActive", {
																prefix: a.link.prefix,
																date: fmtDate.format(a.link.expiresAt),
																used: a.link.lastUsedAt
																	? fmtDate.format(a.link.lastUsedAt)
																	: t("notYet"),
															})
														: t("linkNone")}
												</span>
												{canAssess && (
													<>
														<PortalLinkDialog
															assessmentId={a.id}
															contactEmail={a.contactEmail}
															hasActiveLink={Boolean(a.link?.active)}
														/>
														{a.link?.active && (
															<RevokeLinkButton assessmentId={a.id} />
														)}
													</>
												)}
											</div>
										)}
									</li>
								);
							})}
						</ul>
					)}
				</Section>
			)}

			{tab === "vertrag" && (
				<Section title={t("contractTitle")}>
					<p className="mb-3 text-muted-foreground text-sm">
						{critical ? t("contractLeadCritical") : t("contractLead")}
					</p>
					<ContractClausesForm
						providerId={p.id}
						clauses={clauses}
						values={clauseValues}
						canEdit={canEdit}
					/>
				</Section>
			)}

			{tab === "nachweise" && (
				<Section title={t("files")}>
					<p className="mb-3 text-muted-foreground text-sm">{t("filesLead")}</p>
					{data.files.length === 0 ? (
						<p className="text-sm">{t("filesEmpty")}</p>
					) : (
						<ul className="flex flex-col divide-y divide-border/60 rounded-md border text-sm">
							{data.files.map((f) => (
								<li
									key={f.id}
									className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
								>
									<a
										href={`/api/nachweise/${f.id}`}
										className="min-w-0 truncate hover:underline"
									>
										{f.title}
									</a>
									<span className="flex items-center gap-2 text-muted-foreground text-xs">
										{f.source === "supplier_portal" && (
											<Badge variant="outline">{t("fromSupplier")}</Badge>
										)}
										<Badge variant="muted">
											{tev(`class_${f.classification}` as "class_internal")}
										</Badge>
										{fmtDate.format(f.createdAt)}
									</span>
								</li>
							))}
						</ul>
					)}
				</Section>
			)}

			{tab === "prozesse" && (
				<>
					<Section title={t("processes")}>
						{data.processes.length === 0 ? (
							<p className="text-muted-foreground text-sm">
								{t("processesEmpty")}
							</p>
						) : (
							<ul className="flex flex-col gap-1 text-sm">
								{data.processes.map((pr) => (
									<li key={pr.code} className="flex items-center gap-2">
										<Link
											href={`/prozesse/${encodeURIComponent(pr.code)}`}
											className="hover:underline"
										>
											<span className="font-mono text-xs" translate="no">
												{pr.code}
											</span>{" "}
											{pr.name}
										</Link>
										{pr.criticality !== "standard" && (
											<Badge
												variant={
													pr.criticality === "critical"
														? "destructive"
														: "warning"
												}
											>
												{tp(`crit_${pr.criticality}`)}
											</Badge>
										)}
									</li>
								))}
							</ul>
						)}
					</Section>
					<Section title={t("assets")}>
						{data.assets.length === 0 ? (
							<p className="text-muted-foreground text-sm">
								{t("assetsEmpty")}
							</p>
						) : (
							<ul className="flex flex-col gap-1 text-sm">
								{data.assets.map((as) => (
									<li key={as.id}>
										<Link href="/assets" className="hover:underline">
											{as.name}
										</Link>
									</li>
								))}
							</ul>
						)}
					</Section>
				</>
			)}
		</EntityLayout>
	);
}
