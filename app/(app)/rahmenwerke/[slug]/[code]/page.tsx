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
import { Badge } from "@/components/ui/badge";
import { requireOrg } from "@/lib/auth/guards";
import { roleAllows } from "@/lib/auth/permissions";
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
import { CONTROL_STATUS } from "@/lib/entities/control";

export default async function RequirementPage({
	params,
}: {
	params: Promise<{ slug: string; code: string }>;
}) {
	const { slug, code: rawCode } = await params;
	const code = decodeURIComponent(rawCode);
	const ctx = await requireOrg();
	const fw = FRAMEWORK_BY_SLUG.get(slug);
	const req = REQUIREMENT_BY_KEY.get(`${slug}:${code}`);
	if (!fw || !req) notFound();
	const t = await getTranslations("Frameworks");
	const tc = await getTranslations("Controls");
	const ts = await getTranslations("Status");
	const cov = await getOrgCoverageCached(ctx);
	if (!cov?.frameworks.includes(slug)) notFound();
	const key = `${slug}:${code}`;
	const status: ReqCoverage = cov.result.byRequirement.get(key) ?? "open";
	const applicability = cov.applicabilityDetail.get(key);
	const applicable = status !== "not_applicable";
	const section = fw.sections.find((s) => s.code === req.sectionCode);
	const edges = EDGES_BY_REQUIREMENT.get(key) ?? [];
	const related = (req.relatedRequirements ?? [])
		.map((k) => ({
			key: k,
			req: REQUIREMENT_BY_KEY.get(k),
			status: cov.result.byRequirement.get(k),
		}))
		.filter((x) => x.req);
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
								: status === "not_applicable"
									? "muted"
									: "outline"
					}
				>
					{statusLabel(status)}
				</Badge>
			}
			actions={
				<ApplicabilityToggle
					framework={slug}
					code={code}
					applicable={applicable}
					canEdit={roleAllows(ctx.orgRole, { control: ["update"] })}
				/>
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
								rel="noopener nofollow"
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
					{req.evidenceHints && req.evidenceHints.length > 0 && (
						<Section title={t("evidenceHints")}>
							<ul className="list-disc pl-5 text-sm">
								{req.evidenceHints.map((h) => (
									<li key={h}>{h}</li>
								))}
							</ul>
						</Section>
					)}
					{req.auditQuestions && req.auditQuestions.length > 0 && (
						<Section title={t("auditQuestions")}>
							<ul className="list-disc pl-5 text-sm">
								{req.auditQuestions.map((q) => (
									<li key={q}>{q}</li>
								))}
							</ul>
						</Section>
					)}
					{req.pitfalls && req.pitfalls.length > 0 && (
						<Section title={t("pitfalls")}>
							<ul className="list-disc pl-5 text-sm">
								{req.pitfalls.map((p) => (
									<li key={p}>{p}</li>
								))}
							</ul>
						</Section>
					)}
					{req.tools &&
						(req.tools.startup.length > 0 || req.tools.scale.length > 0) && (
							<Section title={t("tools")}>
								<dl className="text-sm">
									{req.tools.startup.length > 0 && (
										<>
											<dt className="lv-eyebrow text-[0.52rem] text-muted-foreground">
												{t("toolsStartup")}
											</dt>
											<dd className="mb-2">{req.tools.startup.join(", ")}</dd>
										</>
									)}
									{req.tools.scale.length > 0 && (
										<>
											<dt className="lv-eyebrow text-[0.52rem] text-muted-foreground">
												{t("toolsScale")}
											</dt>
											<dd>{req.tools.scale.join(", ")}</dd>
										</>
									)}
								</dl>
								<p className="text-muted-foreground text-xs">
									{t("toolsDisclaimer")}
								</p>
							</Section>
						)}
				</>
			}
		>
			{req.guidance && (
				<Section title={t("guidance")}>
					<p className="text-sm">{req.guidance}</p>
				</Section>
			)}

			{req.recommendations && req.recommendations.length > 0 && (
				<Section title={t("recommendations")}>
					<ul className="flex flex-col gap-2 text-sm">
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
					<p className="text-muted-foreground text-sm">{t("coveredByEmpty")}</p>
				) : (
					<ul className="flex flex-col divide-y divide-border/60 rounded-md border text-sm">
						{edges.map((e) => {
							const c = CONTROL_BY_CODE.get(e.control);
							const s = cov.implStatus.get(e.control);
							return (
								<li
									key={e.control}
									className="flex flex-wrap items-center gap-2 px-3 py-2"
								>
									<Badge
										variant="outline"
										className="font-mono normal-case tracking-normal"
									>
										{e.control}
									</Badge>
									<Link
										href={`/controls/${e.control}`}
										className="min-w-0 flex-1 truncate hover:underline underline-offset-4"
									>
										{c?.title ?? e.control}
									</Link>
									<span className="text-muted-foreground text-xs">
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

			{related.length > 0 && (
				<Section title={t("seeAlso")}>
					<ul className="flex flex-col divide-y divide-border/60 rounded-md border text-sm">
						{related.map(({ key: k, req: r, status: s }) => (
							<li
								key={k}
								className="flex flex-wrap items-center gap-2 px-3 py-2"
							>
								<Badge
									variant="outline"
									className="font-mono normal-case tracking-normal"
								>
									{shortFrameworkName(r?.framework ?? "")} {r?.code}
								</Badge>
								{cov.frameworks.includes(r?.framework ?? "") ? (
									<Link
										href={`/rahmenwerke/${r?.framework}/${encodeURIComponent(r?.code ?? "")}`}
										className="min-w-0 flex-1 truncate hover:underline underline-offset-4"
									>
										{r?.title}
									</Link>
								) : (
									<span className="min-w-0 flex-1 truncate text-muted-foreground">
										{r?.title}
									</span>
								)}
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
