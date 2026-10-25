import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { CoverageBar } from "@/components/entity/coverage-bar";
import { UrlTabs } from "@/components/entity/url-tabs";
import { FrameworkEvidence } from "@/components/evidence-studio/framework-evidence";
import { SoaTab } from "@/components/frameworks/soa-tab";
import { PageHeader } from "@/components/page-header";
import { ReadinessPanel } from "@/components/readiness/readiness-panel";
import { Badge } from "@/components/ui/badge";
import { requireOrgPage } from "@/lib/auth/gates";
import { toOrgCtx } from "@/lib/auth/guards";
import { allows } from "@/lib/auth/permissions";
import {
	CONTROL_BY_CODE,
	EDGES_BY_REQUIREMENT,
	FRAMEWORK_BY_SLUG,
} from "@/lib/compliance/catalog";
import { evidenceKindsForFrameworks } from "@/lib/compliance/catalog/evidence-kinds";
import type { ReqCoverage } from "@/lib/compliance/coverage";
import {
	getOrgCoverageCached,
	pct,
	shortFrameworkName,
} from "@/lib/compliance/page-data";
import { listEvidenceWithControls } from "@/lib/compliance/queries";
import { listDocuments } from "@/lib/compliance/queries-p2";
import { listAudits } from "@/lib/compliance/queries-p3";
import { loadReadiness } from "@/lib/compliance/queries-readiness";
import { parseStichtag, stichtagOptions } from "@/lib/compliance/readiness";
import { readOrg } from "@/lib/db/with-org";
import { kindOverview } from "@/lib/evidence-studio/generate/service";
import {
	type RequirementProgress,
	requirementProgress,
} from "@/lib/evidence-studio/progress";
import {
	berlinToday,
	loadSheetData,
	sheetFor,
} from "@/lib/evidence-studio/queries";

const TONE: Record<ReqCoverage, "success" | "warning" | "outline" | "muted"> = {
	covered: "success",
	partial: "warning",
	open: "outline",
	not_applicable: "muted",
};

export default async function FrameworkPage({
	params,
	searchParams,
}: {
	params: Promise<{ slug: string }>;
	searchParams: Promise<{ tab?: string; stichtag?: string }>;
}) {
	const { slug } = await params;
	const { tab = "anforderungen", stichtag } = await searchParams;
	const ctx = await requireOrgPage();
	const fw = FRAMEWORK_BY_SLUG.get(slug);
	if (!fw) notFound();
	const t = await getTranslations("Frameworks");
	const tNav = await getTranslations("Nav");
	const tes = await getTranslations("EvidenceStudio");
	const cov = await getOrgCoverageCached(ctx);
	if (!cov?.frameworks.includes(slug)) notFound();
	const bucket = cov.result.byFramework.get(slug);
	const labels = {
		covered: t("covered"),
		partial: t("partial"),
		open: t("open"),
		applicable: t("applicable"),
	};
	const statusLabel = (s: ReqCoverage) =>
		t(
			s === "covered"
				? "covered"
				: s === "partial"
					? "partial"
					: s === "not_applicable"
						? "notApplicableShort"
						: "open",
		);

	const reqs = fw.requirements.map((r) => {
		const key = `${slug}:${r.code}`;
		return {
			r,
			key,
			status: cov.result.byRequirement.get(key) ?? ("open" as ReqCoverage),
		};
	});
	const gaps = reqs.filter(
		(x) => x.status === "open" || x.status === "partial",
	);
	// SoA nur für ISO 27001 (Annex A); Daten erst laden, wenn der Tab offen ist.
	const soaEnabled = slug === "iso27001";
	const annexA = fw.requirements.filter((r) => r.code.startsWith("A."));
	const soaData =
		soaEnabled && tab === "soa"
			? await readOrg(toOrgCtx(ctx), async (tx) => {
					const ev = await listEvidenceWithControls(tx, ctx.orgId);
					const evidenceByControl = new Map<string, number>();
					for (const e of ev)
						for (const code of e.controlCodes)
							evidenceByControl.set(
								code,
								(evidenceByControl.get(code) ?? 0) + 1,
							);
					const docs = (await listDocuments(tx, ctx.orgId)).map((d) => ({
						docNumber: d.docNumber,
						title: d.title,
						status: d.status,
						templateCode: d.templateCode,
						isoMandatory: d.isoMandatory,
					}));
					return { evidenceByControl, documents: docs };
				})
			: null;

	// Nachweise je Normpunkt: Bögen der Controls dieses Rahmenwerks (nur im Reiter)
	const evidenceTab =
		tab === "nachweise"
			? await readOrg(toOrgCtx(ctx), async (tx) => {
					const data = await loadSheetData(tx, ctx.orgId, cov);
					const codes = new Set(
						fw.requirements.flatMap((r) =>
							(EDGES_BY_REQUIREMENT.get(`${slug}:${r.code}`) ?? []).map(
								(e) => e.control,
							),
						),
					);
					const sheets = [...codes].flatMap((c) => {
						const s = sheetFor(data, c);
						return s ? [s] : [];
					});
					const progress = new Map<string, RequirementProgress>();
					for (const r of fw.requirements) {
						const key = `${slug}:${r.code}`;
						progress.set(
							key,
							requirementProgress(
								sheets.filter((s) => s.requirements.some((x) => x.key === key)),
								key,
							),
						);
					}
					const kinds = await kindOverview(
						tx,
						ctx.orgId,
						evidenceKindsForFrameworks([slug]).map((k) => k.code),
						berlinToday(),
						{ userId: ctx.userId },
					);
					return { progress, notApplicable: data.notApplicable, kinds };
				})
			: null;

	// Prüfungsreife nur laden, wenn der Tab offen ist (eigene Stichtag-Rechnung).
	const readiness =
		tab === "pruefungsreife"
			? await readOrg(toOrgCtx(ctx), async (tx) => {
					const today = new Date();
					const asOf = parseStichtag(stichtag, today);
					const audits = await listAudits(tx, ctx.orgId);
					const options = stichtagOptions(
						fw.requirements.map((r) => r.effectiveFrom),
						today,
						audits
							.filter(
								(a) =>
									a.status === "planned" &&
									(a.frameworkIds.length === 0 ||
										a.frameworkIds.includes(slug)),
							)
							.map((a) => a.plannedAt),
					);
					const loaded = await loadReadiness(tx, ctx.orgId, {
						asOf,
						frameworks: [slug],
					});
					const result = loaded?.results[0];
					if (!result) return null;
					if (!options.includes(result.asOf)) options.push(result.asOf);
					return { result, options: options.sort() };
				})
			: null;

	return (
		<>
			<PageHeader
				back={{ href: "/rahmenwerke", label: tNav("groupFrameworks") }}
				eyebrow={`${fw.authority ?? ""} ${fw.version ?? ""}`.trim()}
				title={fw.name}
				lead={fw.description}
				actions={
					<span className="flex flex-wrap gap-3 text-subhead">
						<a
							href={`/api/export/gap.csv?fw=${slug}`}
							className="text-primary hover:underline underline-offset-4"
						>
							{t("exportGap")}
						</a>
						{soaEnabled && (
							<a
								href="/api/export/soa.md"
								className="text-primary hover:underline underline-offset-4"
							>
								{t("exportSoa")}
							</a>
						)}
					</span>
				}
			/>
			{bucket && (
				<div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-[1fr_auto]">
					<CoverageBar bucket={bucket} labels={labels} />
					<div className="flex gap-4 text-subhead">
						<div>
							<p className="font-medium text-footnote text-muted-foreground">
								{t("coverage")}
							</p>
							<p className="font-bold text-title-2">
								{pct(bucket.coveragePct)}
							</p>
						</div>
						<div>
							<p className="font-medium text-footnote text-muted-foreground">
								{t("progress")}
							</p>
							<p className="font-bold text-title-2">
								{pct(bucket.progressPct)}
							</p>
						</div>
					</div>
				</div>
			)}
			{fw.recommendedApproach && (
				<p className="mb-6 rounded-2xl bg-card p-3 text-subhead">
					<span className="font-medium text-footnote mr-2 text-footnote text-muted-foreground">
						{t("approach")}
					</span>
					{fw.recommendedApproach}
				</p>
			)}
			{fw.requirements.length === 0 ? (
				<p className="text-muted-foreground text-subhead">{t("noIndex")}</p>
			) : (
				<>
					<UrlTabs
						base={`/rahmenwerke/${slug}`}
						active={tab}
						tabs={[
							{
								value: "anforderungen",
								label: t("requirements"),
								count: reqs.length,
							},
							{ value: "luecken", label: t("gaps"), count: gaps.length },
							{ value: "nachweise", label: tes("tabEvidence") },
							{ value: "pruefungsreife", label: t("tabReadiness") },
							...(soaEnabled
								? [{ value: "soa", label: t("soa"), count: annexA.length }]
								: []),
						]}
					/>
					{tab === "nachweise" && evidenceTab ? (
						<FrameworkEvidence
							framework={fw}
							progress={evidenceTab.progress}
							notApplicable={evidenceTab.notApplicable}
							kinds={evidenceTab.kinds}
							canCreate={allows(ctx, { evidence: ["create"] })}
						/>
					) : tab === "pruefungsreife" && readiness ? (
						<ReadinessPanel
							result={readiness.result}
							sectionTitles={Object.fromEntries(
								fw.sections.map((s) => [s.code, s.title]),
							)}
							stichtage={readiness.options}
							base={{
								path: `/rahmenwerke/${slug}`,
								params: { tab: "pruefungsreife" },
							}}
							canCreateTask={allows(ctx, { task: ["create"] })}
							exportHref={
								allows(ctx, { export: ["create"] })
									? `/api/export/readiness.md?fw=${slug}&stichtag=${readiness.result.asOf}`
									: undefined
							}
						/>
					) : tab === "soa" && soaData ? (
						<SoaTab
							slug={slug}
							requirements={annexA}
							cov={cov}
							evidenceByControl={soaData.evidenceByControl}
							documents={soaData.documents}
						/>
					) : tab === "luecken" ? (
						<>
							<p className="mb-4 text-muted-foreground text-subhead">
								{t("gapsLead")}
							</p>
							{gaps.length === 0 ? (
								<p className="text-subhead">{t("gapsEmpty")}</p>
							) : (
								<ul className="flex flex-col divide-y divide-border/60 overflow-hidden rounded-2xl bg-card text-subhead">
									{gaps.map(({ r, key, status }) => {
										const edges = EDGES_BY_REQUIREMENT.get(key) ?? [];
										return (
											<li
												key={r.code}
												className="flex flex-col gap-1 px-3 py-2"
											>
												<div className="flex flex-wrap items-center gap-2">
													<Badge variant="outline" className="font-mono">
														{r.code}
													</Badge>
													<Link
														href={`/rahmenwerke/${slug}/${encodeURIComponent(r.code)}`}
														className="min-w-0 flex-1 truncate font-medium hover:underline underline-offset-4"
													>
														{r.title}
													</Link>
													<Badge variant={TONE[status]}>
														{statusLabel(status)}
													</Badge>
												</div>
												<div className="flex flex-wrap gap-1.5 text-footnote">
													{edges.map((e) => {
														const c = CONTROL_BY_CODE.get(e.control);
														const s =
															cov.implStatus.get(e.control) ?? "not_started";
														return (
															<Link
																key={e.control}
																href={`/controls/${e.control}`}
																className="rounded-sm border px-2 py-0.5 hover:bg-muted"
																title={c?.title}
															>
																{e.control} · {s}
																{e.coverage === "partial" ? " · teilweise" : ""}
															</Link>
														);
													})}
												</div>
											</li>
										);
									})}
								</ul>
							)}
						</>
					) : (
						<div className="flex flex-col gap-8">
							{fw.sections.map((section) => {
								const items = reqs.filter(
									(x) => x.r.sectionCode === section.code,
								);
								if (items.length === 0) return null;
								const sb = cov.result.bySection.get(slug)?.get(section.code);
								return (
									<section key={section.code}>
										<div className="mb-2 flex items-baseline justify-between gap-3">
											<h2 className="font-medium text-footnote text-muted-foreground">
												{section.code} · {section.title}
											</h2>
											{sb && (
												<span className="text-muted-foreground text-footnote">
													{pct(sb.coveragePct)}
												</span>
											)}
										</div>
										<ul className="flex flex-col divide-y divide-border/60 overflow-hidden rounded-2xl bg-card text-subhead">
											{items.map(({ r, status }) => (
												<li
													key={r.code}
													className="flex flex-wrap items-center gap-2 px-3 py-2"
												>
													<Badge variant="outline" className="font-mono">
														{r.code}
													</Badge>
													<Link
														href={`/rahmenwerke/${slug}/${encodeURIComponent(r.code)}`}
														className="min-w-0 flex-1 truncate hover:underline underline-offset-4"
													>
														{r.title}
													</Link>
													<Badge variant={TONE[status]}>
														{statusLabel(status)}
													</Badge>
												</li>
											))}
										</ul>
									</section>
								);
							})}
						</div>
					)}
				</>
			)}
			<p className="mt-8 text-muted-foreground text-footnote">
				{shortFrameworkName(slug)} · {fw.legalBasis ?? ""}
			</p>
		</>
	);
}
