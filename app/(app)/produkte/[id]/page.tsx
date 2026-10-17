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
import { QuickCreateTask } from "@/components/entity/quick-create-task";
import { StatusBadge } from "@/components/entity/status-badge";
import { StatusButton } from "@/components/entity/status-button";
import { UrlTabs } from "@/components/entity/url-tabs";
import { UserChip } from "@/components/entity/user-chip";
import {
	ConformityForm,
	LifecycleForm,
	SbomUpload,
	ScopeForm,
	StartChecklistButton,
} from "@/components/products/product-forms";
import { SourceRisksBlock } from "@/components/risks/source-risks";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { historyFor } from "@/lib/audit";
import { requireOrgPage } from "@/lib/auth/gates";
import { toOrgCtx } from "@/lib/auth/guards";
import { roleAllows } from "@/lib/auth/permissions";
import {
	CRA_CHECK_LABEL,
	CRA_REPORTING_FROM,
	productCraStatus,
} from "@/lib/compliance/cra";
import { fmtDate } from "@/lib/compliance/page-data";
import {
	listComments,
	listMembersForPicker,
	listTasks,
	userNames,
} from "@/lib/compliance/queries";
import { listDocuments } from "@/lib/compliance/queries-p2";
import { getProductDetail } from "@/lib/compliance/queries-products";
import { listFindings } from "@/lib/compliance/queries-security";
import { readOrg } from "@/lib/db/with-org";
import {
	FINDING_STATUS_MACHINE,
	SEVERITY_TONE,
} from "@/lib/entities/security-finding";
import { TASK_STATUS } from "@/lib/entities/task";
import { s3Configured } from "@/lib/evidence/store";
import { mergeActivity, toHistoryItems } from "@/lib/history";
import { cn } from "@/lib/utils";

const TABS = [
	"ueberblick",
	"einstufung",
	"konformitaet",
	"sbom",
	"befunde",
	"checkliste",
	"vorfaelle",
] as const;
type Tab = (typeof TABS)[number];
type Search = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

// Produkt (CRA): Überblick mit abgeleiteter Checkliste, Einstufung und
// Lebenszyklus, Konformität, SBOM, CRA-Checkliste (Fragebogen), Vorfälle.
export default async function ProductPage({
	params,
	searchParams,
}: {
	params: Promise<{ id: string }>;
	searchParams: Promise<Search>;
}) {
	const { id } = await params;
	if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
	const sp = await searchParams;
	const ctx = await requireOrgPage({ product: ["read"] });
	const t = await getTranslations("Products");
	const te = await getTranslations("Entity");
	const ts = await getTranslations("Status");
	const ti = await getTranslations("Incidents");
	const ta = await getTranslations("Assessment");
	const ts2 = await getTranslations("Security");
	const data = await readOrg(toOrgCtx(ctx), async (tx) => {
		const d = await getProductDetail(tx, ctx.orgId, id);
		if (!d) return null;
		const [comments, history, members, tasks, docs, findings] =
			await Promise.all([
				listComments(tx, ctx.orgId, "product", id),
				historyFor(tx, `product:${id}`),
				listMembersForPicker(tx, ctx.orgId),
				listTasks(tx, ctx.orgId, { entityType: "product", entityId: id }),
				listDocuments(tx, ctx.orgId),
				listFindings(tx, ctx.orgId, { productId: id }),
			]);
		const names = await userNames(tx, [
			...history.map((h) => h.actorUserId),
			...comments.map((c) => c.authorUserId),
		]);
		for (const [k, v] of d.names) names.set(k, v);
		return { ...d, comments, history, members, tasks, docs, findings, names };
	});
	if (!data) notFound();
	const p = data.product;
	const tab: Tab = (TABS as readonly string[]).includes(one(sp.tab) ?? "")
		? (one(sp.tab) as Tab)
		: "ueberblick";
	const canEdit = roleAllows(ctx.orgRole, { product: ["update"] });
	const canChecklist = roleAllows(ctx.orgRole, { assessment: ["create"] });
	const now = new Date();
	const cra = productCraStatus(p, now);
	const base = `/produkte/${p.id}`;
	const docOptions = data.docs.map((d) => ({
		id: d.id,
		docNumber: d.docNumber,
		title: d.title,
	}));
	const docLabel = (docId: string | null) => {
		const d = docId ? data.documents.get(docId) : null;
		return d ? (
			<Link href={`/dokumente/${d.docNumber}`} className="hover:underline">
				{d.docNumber} {d.title}
			</Link>
		) : (
			"—"
		);
	};
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
	const sbom = p.sbomSummary;
	const openFindings = data.findings.filter(
		(f) => f.status === "open" || f.status === "in_progress",
	);
	const running = data.checklists.find(
		(c) => c.status !== "completed" && c.status !== "cancelled",
	);

	return (
		<EntityLayout
			eyebrow={`${p.code} · ${t(`role_${p.role}`)} · ${t(`kind_${p.kind}`)}`}
			title={p.name}
			subtitle={p.description ?? undefined}
			status={
				<StatusButton
					target={{ kind: "product", productId: p.id, status: p.status }}
					disabled={!canEdit}
				/>
			}
			meta={
				<>
					<MetaItem label={t("inScope")}>
						{t(
							`scope_${p.craInScope === null ? "unknown" : p.craInScope ? "yes" : "no"}`,
						)}
					</MetaItem>
					<MetaItem label={t("craClass")}>{t(`class_${p.craClass}`)}</MetaItem>
					<MetaItem label={t("supportUntil")}>
						{p.supportUntil ? fmtDate.format(new Date(p.supportUntil)) : "—"}
					</MetaItem>
					<MetaItem label={t("owner")}>
						<UserChip name={data.names.get(p.ownerUserId ?? "")} />
					</MetaItem>
				</>
			}
			aside={
				<>
					<SourceRisksBlock ctx={ctx} kind="product" id={id} />
					<Section
						title={te("tasks")}
						actions={
							canEdit ? (
								<QuickCreateTask
									entityType="product"
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
						<CommentForm entityType="product" entityId={p.id} link={base} />
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
			<UrlTabs
				base={base}
				active={tab}
				tabs={TABS.map((x) => ({
					value: x,
					label: t(`tab_${x}`),
					count:
						x === "checkliste"
							? data.checklists.length
							: x === "vorfaelle"
								? data.incidents.length
								: x === "befunde"
									? openFindings.length
									: undefined,
				}))}
			/>

			{tab === "ueberblick" && (
				<>
					<Section title={t("craChecks")}>
						{cra.state === "out_of_scope" ? (
							<p className="text-sm">{t("outOfScopeLead")}</p>
						) : (
							<>
								<p className="mb-3 text-muted-foreground text-sm">
									{t("checksLead", { done: cra.done, total: cra.total })}
								</p>
								<ul className="flex flex-col divide-y divide-border/60 rounded-md border text-sm">
									{cra.checks.map((c) => (
										<li
											key={c.key}
											className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
										>
											<span className="flex items-center gap-2">
												<span
													aria-hidden
													className={cn(
														"size-2 rounded-full",
														c.ok
															? "bg-success"
															: c.severity === "critical"
																? "bg-destructive"
																: "bg-warning",
													)}
												/>
												{c.ok ? t(`check_${c.key}`) : CRA_CHECK_LABEL[c.key]}
											</span>
											<span className="text-muted-foreground text-xs">
												{c.ok
													? t("checkOk")
													: t("checkDue", {
															date: fmtDate.format(new Date(c.dueFrom)),
														})}
											</span>
										</li>
									))}
								</ul>
							</>
						)}
					</Section>
					{cra.state !== "out_of_scope" && (
						<Section title={t("route")}>
							<p className="text-sm">{cra.route.label}</p>
							<p className="text-muted-foreground text-xs">{cra.route.basis}</p>
						</Section>
					)}
					{cra.state !== "out_of_scope" && p.role === "manufacturer" && (
						<Section title={t("reporting")}>
							<p className="text-sm">
								{t("reportingLead", {
									date: fmtDate.format(new Date(CRA_REPORTING_FROM)),
								})}
							</p>
							<div className="mt-2 flex flex-wrap gap-2">
								<Link
									href="/vorfaelle/neu"
									className={buttonVariants({ variant: "outline", size: "sm" })}
								>
									{t("reportIncident")}
								</Link>
							</div>
						</Section>
					)}
				</>
			)}

			{tab === "einstufung" && (
				<>
					<Section title={t("scopeTitle")}>
						<ScopeForm
							productId={p.id}
							disabled={!canEdit}
							initial={{
								craInScope: p.craInScope,
								scopeReason: p.scopeReason,
								craClass: p.craClass,
								classReason: p.classReason,
								isFoss: p.isFoss,
								harmonisedStandards: p.harmonisedStandards,
								role: p.role,
								kind: p.kind,
							}}
						/>
					</Section>
					<Section title={t("lifecycle")}>
						{cra.support.state !== "ok" && (
							<p
								className={cn(
									"mb-3 rounded-md border p-2 text-sm",
									cra.support.state === "ending_soon"
										? "border-warning/50"
										: "border-destructive/50",
								)}
							>
								{t(`support_${cra.support.state}`, {
									years: cra.support.years ?? 0,
									days: cra.support.daysLeft ?? 0,
								})}
							</p>
						)}
						<LifecycleForm
							productId={p.id}
							disabled={!canEdit}
							initial={{
								version: p.version,
								placedOnMarketAt: p.placedOnMarketAt,
								supportUntil: p.supportUntil,
								supportReason: p.supportReason,
								vulnContact: p.vulnContact,
							}}
						/>
					</Section>
				</>
			)}

			{tab === "konformitaet" && (
				<>
					<Section title={t("route")}>
						<p className="text-sm">{cra.route.label}</p>
						<p className="text-muted-foreground text-xs">{cra.route.basis}</p>
					</Section>
					<Section title={t("conformity")}>
						<dl className="mb-4 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
							<div>
								<dt className="text-muted-foreground text-xs">
									{t("riskDocument")}
								</dt>
								<dd>{docLabel(p.riskDocumentId)}</dd>
							</div>
							<div>
								<dt className="text-muted-foreground text-xs">
									{t("techDocument")}
								</dt>
								<dd>{docLabel(p.techDocDocumentId)}</dd>
							</div>
						</dl>
						<ConformityForm
							productId={p.id}
							disabled={!canEdit}
							documents={docOptions}
							thirdParty={cra.route.thirdParty}
							initial={{
								riskDocumentId: p.riskDocumentId,
								techDocDocumentId: p.techDocDocumentId,
								declarationAt: p.declarationAt,
								ceMarked: p.ceMarked,
								notifiedBody: p.notifiedBody,
							}}
						/>
						<p className="mt-3 text-muted-foreground text-xs">
							{t("templatesHint")}{" "}
							<Link href="/dokumente" className="underline">
								{t("toTemplates")}
							</Link>
						</p>
					</Section>
				</>
			)}

			{tab === "sbom" && (
				<>
					<Section title={t("sbom")}>
						{sbom ? (
							<div className="flex flex-col gap-3 text-sm">
								<p>
									<Badge variant={sbom.ok ? "success" : "warning"}>
										{sbom.ok ? t("sbomValid") : t("sbomInvalid")}
									</Badge>{" "}
									{sbom.format === "cyclonedx" ? "CycloneDX" : "SPDX"}{" "}
									{sbom.specVersion ?? ""} ·{" "}
									{t("sbomComponents", { count: sbom.components })}
									{sbom.generatedAt &&
										` · ${t("sbomGenerated", {
											date: fmtDate.format(new Date(sbom.generatedAt)),
										})}`}
								</p>
								{sbom.primaryComponent && (
									<p className="text-muted-foreground text-xs">
										{sbom.primaryComponent}
									</p>
								)}
								<table className="w-full max-w-md text-sm">
									<tbody>
										{(
											[
												"version",
												"identifier",
												"license",
												"hash",
												"supplier",
											] as const
										).map((k) => (
											<tr key={k} className="border-t">
												<td className="py-1">{t(`sbomField_${k}`)}</td>
												<td className="py-1 text-right tabular-nums">
													{sbom.fields[k]} %
												</td>
											</tr>
										))}
									</tbody>
								</table>
								{sbom.issues.length > 0 && (
									<ul className="list-disc pl-5 text-muted-foreground text-xs">
										{sbom.issues.map((i) => (
											<li key={i}>{i}</li>
										))}
									</ul>
								)}
								{data.sbomEvidence && (
									<p className="text-xs">
										<a
											href={`/api/nachweise/${data.sbomEvidence.id}`}
											className="underline"
										>
											{data.sbomEvidence.fileName ?? data.sbomEvidence.title}
										</a>
									</p>
								)}
							</div>
						) : (
							<p className="text-muted-foreground text-sm">{t("sbomEmpty")}</p>
						)}
					</Section>
					{canEdit &&
						(s3Configured() ? (
							<Section title={t("sbomUpload")}>
								<SbomUpload productId={p.id} />
							</Section>
						) : (
							<p className="text-muted-foreground text-sm">
								{t("storageNotConfigured")}
							</p>
						))}
				</>
			)}

			{tab === "befunde" && (
				<Section
					title={t("findings")}
					actions={
						<Link
							href="/sicherheit?tab=schnellcheck"
							className={buttonVariants({ variant: "outline", size: "sm" })}
						>
							{t("toSecurity")}
						</Link>
					}
				>
					<p className="mb-3 text-muted-foreground text-sm">
						{t("findingsLead")}
					</p>
					{data.findings.length === 0 ? (
						<p className="text-muted-foreground text-sm">
							{t("findingsEmpty")}
						</p>
					) : (
						<ul className="flex flex-col divide-y divide-border/60 rounded-md border text-sm">
							{data.findings.slice(0, 100).map((f) => (
								<li
									key={f.id}
									className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
								>
									<Link
										href={`/sicherheit/befunde/${f.id}`}
										className="min-w-0 truncate hover:underline"
									>
										{f.title}
									</Link>
									<span className="flex items-center gap-2 text-xs">
										<Badge variant={SEVERITY_TONE[f.severity]}>
											{ts2(`sev_${f.severity}`)}
										</Badge>
										<Badge variant="muted">
											{ts(
												FINDING_STATUS_MACHINE.labelKey[f.status] as "sfOpen",
											)}
										</Badge>
									</span>
								</li>
							))}
						</ul>
					)}
				</Section>
			)}

			{tab === "checkliste" && (
				<Section
					title={t("checklist")}
					actions={
						canChecklist && p.role !== "oss_steward" ? (
							<StartChecklistButton
								productId={p.id}
								label={running ? t("continueChecklist") : t("startChecklist")}
							/>
						) : null
					}
				>
					<p className="mb-3 text-muted-foreground text-sm">
						{p.role === "oss_steward"
							? t("checklistSteward")
							: t("checklistLead")}
					</p>
					{data.checklists.length === 0 ? (
						<p className="text-muted-foreground text-sm">
							{t("checklistEmpty")}
						</p>
					) : (
						<ul className="flex flex-col divide-y divide-border/60 rounded-md border text-sm">
							{data.checklists.map((c) => (
								<li
									key={c.id}
									className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
								>
									<Link
										href={`/gap-analyse/${c.id}`}
										className="min-w-0 truncate hover:underline"
									>
										<span className="font-mono text-xs" translate="no">
											{c.code}
										</span>{" "}
										{c.title}
									</Link>
									<span className="flex items-center gap-2 text-xs">
										{c.score !== null && (
											<span className="tabular-nums">{c.score} / 100</span>
										)}
										{c.rating && <Badge variant="outline">{c.rating}</Badge>}
										<Badge variant="muted">
											{ta(`status_${c.status as "draft"}`)}
										</Badge>
									</span>
								</li>
							))}
						</ul>
					)}
				</Section>
			)}

			{tab === "vorfaelle" && (
				<Section
					title={t("incidents")}
					actions={
						roleAllows(ctx.orgRole, { incident: ["create"] }) ? (
							<Link
								href="/vorfaelle/neu"
								className={buttonVariants({ variant: "outline", size: "sm" })}
							>
								{t("reportIncident")}
							</Link>
						) : null
					}
				>
					{data.incidents.length === 0 ? (
						<p className="text-muted-foreground text-sm">
							{t("incidentsEmpty")}
						</p>
					) : (
						<ul className="flex flex-col divide-y divide-border/60 rounded-md border text-sm">
							{data.incidents.map((i) => (
								<li
									key={i.id}
									className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
								>
									<Link
										href={`/vorfaelle/${i.id}`}
										className="min-w-0 truncate hover:underline"
									>
										<span className="font-mono text-xs" translate="no">
											{i.code}
										</span>{" "}
										{i.title}
									</Link>
									<span className="text-muted-foreground text-xs">
										{i.regimes.map((r) => ti(`regime_${r}`)).join(" · ")} ·{" "}
										{fmtDate.format(i.awareAt)}
									</span>
								</li>
							))}
						</ul>
					)}
				</Section>
			)}
		</EntityLayout>
	);
}
