import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { CoverageBar } from "@/components/entity/coverage-bar";
import { UrlTabs } from "@/components/entity/url-tabs";
import { SoaTab } from "@/components/frameworks/soa-tab";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { requireOrg, toOrgCtx } from "@/lib/auth/guards";
import {
	CONTROL_BY_CODE,
	EDGES_BY_REQUIREMENT,
	FRAMEWORK_BY_SLUG,
} from "@/lib/compliance/catalog";
import type { ReqCoverage } from "@/lib/compliance/coverage";
import {
	getOrgCoverageCached,
	pct,
	shortFrameworkName,
} from "@/lib/compliance/page-data";
import { listEvidenceWithControls } from "@/lib/compliance/queries";
import { listDocuments } from "@/lib/compliance/queries-p2";
import { readOrg } from "@/lib/db/with-org";

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
	searchParams: Promise<{ tab?: string }>;
}) {
	const { slug } = await params;
	const { tab = "anforderungen" } = await searchParams;
	const ctx = await requireOrg();
	const fw = FRAMEWORK_BY_SLUG.get(slug);
	if (!fw) notFound();
	const t = await getTranslations("Frameworks");
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

	return (
		<>
			<PageHeader
				eyebrow={`${fw.authority ?? ""} ${fw.version ?? ""}`.trim()}
				title={fw.name}
				lead={fw.description}
				actions={
					<span className="flex flex-wrap gap-3 text-sm">
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
				<div className="mb-6 grid gap-4 md:grid-cols-[1fr_auto]">
					<CoverageBar bucket={bucket} labels={labels} />
					<div className="flex gap-4 text-sm">
						<div>
							<p className="lv-eyebrow text-[0.52rem] text-muted-foreground">
								{t("coverage")}
							</p>
							<p className="font-serif-display text-2xl text-primary">
								{pct(bucket.coveragePct)}
							</p>
						</div>
						<div>
							<p className="lv-eyebrow text-[0.52rem] text-muted-foreground">
								{t("progress")}
							</p>
							<p className="font-serif-display text-2xl text-primary">
								{pct(bucket.progressPct)}
							</p>
						</div>
					</div>
				</div>
			)}
			{fw.recommendedApproach && (
				<p className="mb-6 rounded-md border border-dashed p-3 text-sm">
					<span className="lv-eyebrow mr-2 text-[0.52rem] text-muted-foreground">
						{t("approach")}
					</span>
					{fw.recommendedApproach}
				</p>
			)}
			{fw.requirements.length === 0 ? (
				<p className="text-muted-foreground text-sm">{t("noIndex")}</p>
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
							...(soaEnabled
								? [{ value: "soa", label: t("soa"), count: annexA.length }]
								: []),
						]}
					/>
					{tab === "soa" && soaData ? (
						<SoaTab
							slug={slug}
							requirements={annexA}
							cov={cov}
							evidenceByControl={soaData.evidenceByControl}
							documents={soaData.documents}
						/>
					) : tab === "luecken" ? (
						<>
							<p className="mb-4 text-muted-foreground text-sm">
								{t("gapsLead")}
							</p>
							{gaps.length === 0 ? (
								<p className="text-sm">{t("gapsEmpty")}</p>
							) : (
								<ul className="flex flex-col divide-y divide-border/60 rounded-md border text-sm">
									{gaps.map(({ r, key, status }) => {
										const edges = EDGES_BY_REQUIREMENT.get(key) ?? [];
										return (
											<li
												key={r.code}
												className="flex flex-col gap-1 px-3 py-2"
											>
												<div className="flex flex-wrap items-center gap-2">
													<Badge
														variant="outline"
														className="font-mono normal-case tracking-normal"
													>
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
												<div className="flex flex-wrap gap-1.5 text-xs">
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
											<h2 className="lv-eyebrow text-[0.6rem] text-muted-foreground">
												{section.code} · {section.title}
											</h2>
											{sb && (
												<span className="text-muted-foreground text-xs">
													{pct(sb.coveragePct)}
												</span>
											)}
										</div>
										<ul className="flex flex-col divide-y divide-border/60 rounded-md border text-sm">
											{items.map(({ r, status }) => (
												<li
													key={r.code}
													className="flex flex-wrap items-center gap-2 px-3 py-2"
												>
													<Badge
														variant="outline"
														className="font-mono normal-case tracking-normal"
													>
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
			<p className="mt-8 text-muted-foreground text-xs">
				{shortFrameworkName(slug)} · {fw.legalBasis ?? ""}
			</p>
		</>
	);
}
