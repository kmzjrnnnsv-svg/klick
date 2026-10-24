import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ApplicabilityToggle } from "@/components/entity/applicability-toggle";
import {
	EntityLayout,
	MetaItem,
	Section,
} from "@/components/entity/entity-layout";
import { StatusBadge } from "@/components/entity/status-badge";
import { SheetView } from "@/components/evidence-studio/sheet-view";
import { SourceRisksBlock } from "@/components/risks/source-risks";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requireOrgPage } from "@/lib/auth/gates";
import { toOrgCtx } from "@/lib/auth/guards";
import { allows } from "@/lib/auth/permissions";
import {
	CONTROL_BY_CODE,
	EDGES_BY_REQUIREMENT,
	FRAMEWORK_BY_SLUG,
	REQUIREMENT_BY_KEY,
} from "@/lib/compliance/catalog";
import type { ReqCoverage } from "@/lib/compliance/coverage";
import {
	getOrgCoverageCached,
	shortFrameworkName,
} from "@/lib/compliance/page-data";
import { readOrg } from "@/lib/db/with-org";
import { CONTROL_STATUS } from "@/lib/entities/control";
import { kindHashesFor } from "@/lib/evidence-studio/generate/service";
import { loadSheetData, sheetFor } from "@/lib/evidence-studio/queries";

export default async function RequirementPage({
	params,
}: {
	params: Promise<{ slug: string; code: string }>;
}) {
	const { slug, code: rawCode } = await params;
	const code = decodeURIComponent(rawCode);
	const ctx = await requireOrgPage();
	const fw = FRAMEWORK_BY_SLUG.get(slug);
	const req = REQUIREMENT_BY_KEY.get(`${slug}:${code}`);
	if (!fw || !req) notFound();
	const t = await getTranslations("Frameworks");
	const tc = await getTranslations("Controls");
	const ts = await getTranslations("Status");
	const cov = await getOrgCoverageCached(ctx);
	// Querverweise („Siehe auch“, Vergleich) führen auch zu Rahmenwerken, die
	// die Organisation nicht aktiviert hat: dann Katalogansicht ohne
	// Abdeckungsstatus statt 404.
	const activeFrameworks = cov?.frameworks ?? [];
	const active = activeFrameworks.includes(slug);
	const byRequirement =
		cov?.result.byRequirement ?? new Map<string, ReqCoverage>();
	const implStatus: NonNullable<typeof cov>["implStatus"] =
		cov?.implStatus ?? new Map();
	const key = `${slug}:${code}`;
	const status: ReqCoverage | "inactive" = active
		? (byRequirement.get(key) ?? "open")
		: "inactive";
	const applicability = cov?.applicabilityDetail.get(key);
	const applicable = status !== "not_applicable";
	const section = fw.sections.find((s) => s.code === req.sectionCode);
	const edges = EDGES_BY_REQUIREMENT.get(key) ?? [];
	const related = (req.relatedRequirements ?? [])
		.map((k) => ({
			key: k,
			req: REQUIREMENT_BY_KEY.get(k),
			status: byRequirement.get(k),
		}))
		.filter((x) => x.req);
	// Nachweisbögen der tragenden Controls, gefiltert auf diesen Normpunkt
	const tes = await getTranslations("EvidenceStudio");
	const sheetData =
		active && cov
			? await readOrg(toOrgCtx(ctx), (tx) => loadSheetData(tx, ctx.orgId, cov))
			: null;
	const sheets = sheetData
		? edges.flatMap((e) => {
				const s = sheetFor(sheetData, e.control);
				return s
					? [
							{
								sheet: s,
								evidenceOptions: sheetData.evidence
									.filter((x) => x.controls.includes(e.control))
									.map((x) => ({ id: x.id, title: x.title })),
							},
						]
					: [];
			})
		: [];
	const canEditSheet = allows(ctx, { control: ["update"] });
	const kindHashes =
		sheets.length > 0
			? await readOrg(toOrgCtx(ctx), (tx) =>
					kindHashesFor(
						tx,
						ctx.orgId,
						sheets.map((x) => x.sheet),
					),
				)
			: undefined;
	const statusLabel = (s: ReqCoverage | "inactive") =>
		t(
			s === "covered"
				? "covered"
				: s === "partial"
					? "partial"
					: s === "not_applicable"
						? "notApplicableShort"
						: s === "inactive"
							? "inactive"
							: "open",
		);

	return (
		<EntityLayout
			eyebrow={`${shortFrameworkName(slug)} · ${section ? `${section.code} ${section.title}` : ""}`}
			title={`${req.code} · ${req.title}`}
			subtitle={req.requirementText}
			status={
				<Badge
					variant={
						status === "covered"
							? "success"
							: status === "partial"
								? "warning"
								: status === "not_applicable" || status === "inactive"
									? "muted"
									: "outline"
					}
				>
					{statusLabel(status)}
				</Badge>
			}
			actions={
				active ? (
					<ApplicabilityToggle
						framework={slug}
						code={code}
						applicable={applicable}
						canEdit={allows(ctx, { control: ["update"] })}
					/>
				) : (
					<Button variant="outline" size="sm" asChild>
						<Link href="/einstellungen?tab=frameworks">{t("activate")}</Link>
					</Button>
				)
			}
			meta={
				<>
					<MetaItem label={tc("domain")}>{tc(`domain_${req.domain}`)}</MetaItem>
					<MetaItem label={t("legalBasis")}>
						{req.legalBasisRefs && req.legalBasisRefs.length > 0
							? req.legalBasisRefs.join(", ")
							: (fw.legalBasis ?? "—")}
					</MetaItem>
					<MetaItem label={t("applicability")}>
						{applicability
							? `${t(`source_${applicability.source as "manual"}`)}${applicability.note ? ` — ${applicability.note}` : ""}`
							: t("source_default")}
					</MetaItem>
					{fw.sourceUrl && (
						<MetaItem label={t("sourceLink")}>
							<a
								href={fw.sourceUrl}
								rel="noopener noreferrer nofollow"
								target="_blank"
								className="text-primary hover:underline"
							>
								{new URL(fw.sourceUrl).host}
							</a>
						</MetaItem>
					)}
				</>
			}
			aside={
				<>
					<SourceRisksBlock
						ctx={ctx}
						kind="requirement"
						catalogKey={{ slug, code }}
					/>
					{req.evidenceHints && req.evidenceHints.length > 0 && (
						<Section title={t("evidenceHints")}>
							<ul className="list-disc pl-5 text-subhead">
								{req.evidenceHints.map((h) => (
									<li key={h}>{h}</li>
								))}
							</ul>
						</Section>
					)}
					{req.auditQuestions && req.auditQuestions.length > 0 && (
						<Section title={t("auditQuestions")}>
							<ul className="list-disc pl-5 text-subhead">
								{req.auditQuestions.map((q) => (
									<li key={q}>{q}</li>
								))}
							</ul>
						</Section>
					)}
					{req.pitfalls && req.pitfalls.length > 0 && (
						<Section title={t("pitfalls")}>
							<ul className="list-disc pl-5 text-subhead">
								{req.pitfalls.map((p) => (
									<li key={p}>{p}</li>
								))}
							</ul>
						</Section>
					)}
					{req.tools &&
						(req.tools.startup.length > 0 || req.tools.scale.length > 0) && (
							<Section title={t("tools")}>
								<dl className="text-subhead">
									{req.tools.startup.length > 0 && (
										<>
											<dt className="font-medium text-footnote text-muted-foreground">
												{t("toolsStartup")}
											</dt>
											<dd className="mb-2">{req.tools.startup.join(", ")}</dd>
										</>
									)}
									{req.tools.scale.length > 0 && (
										<>
											<dt className="font-medium text-footnote text-muted-foreground">
												{t("toolsScale")}
											</dt>
											<dd>{req.tools.scale.join(", ")}</dd>
										</>
									)}
								</dl>
								<p className="text-muted-foreground text-footnote">
									{t("toolsDisclaimer")}
								</p>
							</Section>
						)}
				</>
			}
		>
			{req.guidance && (
				<Section title={t("guidance")}>
					<p className="text-subhead">{req.guidance}</p>
				</Section>
			)}

			{req.recommendations && req.recommendations.length > 0 && (
				<Section title={t("recommendations")}>
					<ul className="flex flex-col gap-2 text-subhead">
						{req.recommendations.map((r) => (
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
									{tc(`level_${r.level}`)}
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

			<Section title={t("coveredBy")}>
				{edges.length === 0 ? (
					<p className="text-muted-foreground text-subhead">
						{t("coveredByEmpty")}
					</p>
				) : (
					<ul className="flex flex-col divide-y divide-border/60 overflow-hidden rounded-2xl bg-card text-subhead">
						{edges.map((e) => {
							const c = CONTROL_BY_CODE.get(e.control);
							const s = implStatus.get(e.control);
							return (
								<li
									key={e.control}
									className="flex flex-wrap items-center gap-2 px-3 py-2"
								>
									<Badge variant="outline" className="font-mono">
										{e.control}
									</Badge>
									<Link
										href={`/controls/${e.control}`}
										className="min-w-0 flex-1 truncate hover:underline underline-offset-4"
									>
										{c?.title ?? e.control}
									</Link>
									<span className="text-muted-foreground text-footnote">
										{e.coverage === "full" ? tc("full") : tc("partial")}
									</span>
									{s ? (
										<StatusBadge
											machine={CONTROL_STATUS}
											status={s}
											label={ts(CONTROL_STATUS.labelKey[s] as "notStarted")}
										/>
									) : (
										<Badge variant="muted">—</Badge>
									)}
								</li>
							);
						})}
					</ul>
				)}
			</Section>

			{sheets.length > 0 && applicable && (
				<Section id="nachweise" title={tes("title")}>
					<div className="flex flex-col gap-8">
						{sheets.map(({ sheet, evidenceOptions }) => (
							<div key={sheet.control.code} className="flex flex-col gap-3">
								<h3 className="flex flex-wrap items-center gap-2 font-medium text-subhead">
									<Badge variant="outline" className="font-mono">
										{sheet.control.code}
									</Badge>
									{sheet.control.title}
								</h3>
								<SheetView
									sheet={sheet}
									focus={key}
									canEdit={canEditSheet}
									canCreateEvidence={allows(ctx, { evidence: ["create"] })}
									currentHashes={kindHashes}
									evidenceOptions={evidenceOptions}
								/>
							</div>
						))}
					</div>
				</Section>
			)}

			{related.length > 0 && (
				<Section title={t("seeAlso")}>
					<ul className="flex flex-col divide-y divide-border/60 overflow-hidden rounded-2xl bg-card text-subhead">
						{related.map(({ key: k, req: r, status: s }) => (
							<li
								key={k}
								className="flex flex-wrap items-center gap-2 px-3 py-2"
							>
								<Badge variant="outline" className="font-mono">
									{shortFrameworkName(r?.framework ?? "")} {r?.code}
								</Badge>
								<Link
									href={`/rahmenwerke/${r?.framework}/${encodeURIComponent(r?.code ?? "")}`}
									className={
										activeFrameworks.includes(r?.framework ?? "")
											? "min-w-0 flex-1 truncate hover:underline underline-offset-4"
											: "min-w-0 flex-1 truncate text-muted-foreground hover:underline underline-offset-4"
									}
								>
									{r?.title}
								</Link>
								{s && (
									<Badge
										variant={
											s === "covered"
												? "success"
												: s === "partial"
													? "warning"
													: s === "not_applicable"
														? "muted"
														: "outline"
										}
									>
										{statusLabel(s)}
									</Badge>
								)}
							</li>
						))}
					</ul>
				</Section>
			)}
		</EntityLayout>
	);
}
