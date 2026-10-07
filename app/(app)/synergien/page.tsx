import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { EmptyState } from "@/components/entity/empty-state";
import { UrlTabs } from "@/components/entity/url-tabs";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { requireOrg } from "@/lib/auth/guards";
import {
	CONTROL_BY_CODE,
	EDGES_BY_CONTROL,
	frameworksWithIndex,
} from "@/lib/compliance/catalog";
import {
	CATALOG_CONTROL_REFS,
	CATALOG_EDGES,
	CATALOG_REQ_REFS,
} from "@/lib/compliance/catalog-view";
import { rankByLeverage } from "@/lib/compliance/coverage";
import {
	getOrgCoverageCached,
	pct,
	shortFrameworkName,
} from "@/lib/compliance/page-data";
import {
	computeSynergy,
	prioritizePlan,
	type SynergyCatalog,
	whatIfAddFramework,
} from "@/lib/compliance/synergy";

export default async function SynergiesPage({
	searchParams,
}: {
	searchParams: Promise<{ tab?: string }>;
}) {
	const { tab = "plan" } = await searchParams;
	const ctx = await requireOrg();
	const t = await getTranslations("Synergies");
	const tc = await getTranslations("Controls");
	const cov = await getOrgCoverageCached(ctx);
	if (!cov || cov.frameworks.length === 0) {
		return (
			<>
				<PageHeader title={t("title")} lead={t("lead")} />
				<EmptyState title={t("title")} lead={t("whatIfLead")} />
			</>
		);
	}
	const applicability = new Map<string, boolean>();
	const src = cov.input.applicability;
	if (src instanceof Map) for (const [k, v] of src) applicability.set(k, v);
	const catalog: SynergyCatalog = {
		requirements: CATALOG_REQ_REFS,
		edges: CATALOG_EDGES,
		controls: CATALOG_CONTROL_REFS,
		applicability,
	};
	const synergy = computeSynergy(cov.frameworks, catalog);
	const fwLabel = (s: string) => shortFrameworkName(s);

	const summary =
		synergy.overlapPct === null
			? t("summaryNoOverlap", {
					req: synergy.requirementCount,
					controls: synergy.controlCount,
				})
			: t("summary", {
					req: synergy.requirementCount,
					controls: synergy.controlCount,
					multi: synergy.multiFrameworkControls,
					pct: synergy.overlapPct,
				});

	return (
		<>
			<PageHeader title={t("title")} lead={t("lead")} />
			<p className="mb-4 text-sm">
				<span className="font-medium">
					{cov.frameworks.map(fwLabel).join(" + ")}
				</span>{" "}
				= {summary}
			</p>
			<UrlTabs
				base="/synergien"
				active={tab}
				tabs={[
					{ value: "plan", label: t("tabPlan") },
					{ value: "matrix", label: t("tabMatrix") },
					{ value: "was-waere-wenn", label: t("tabWhatIf") },
				]}
			/>

			{tab === "matrix" && (
				<>
					<p className="mb-4 text-muted-foreground text-sm">
						{t("matrixLead")}
					</p>
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead className="w-28">{t("control")}</TableHead>
								<TableHead>{tc("title")}</TableHead>
								<TableHead className="w-24 text-right">
									{tc("leverage")}
								</TableHead>
								{cov.frameworks.map((fw) => (
									<TableHead key={fw} className="w-24 text-center">
										{fwLabel(fw)}
									</TableHead>
								))}
							</TableRow>
						</TableHeader>
						<TableBody>
							{rankByLeverage(cov.result.leverage).map((lev) => {
								const c = CONTROL_BY_CODE.get(lev.control);
								const edges = EDGES_BY_CONTROL.get(lev.control) ?? [];
								const status = cov.implStatus.get(lev.control);
								return (
									<TableRow key={lev.control}>
										<TableCell className="font-mono text-xs">
											<Link
												href={`/controls/${lev.control}`}
												className="hover:underline underline-offset-4"
											>
												{lev.control}
											</Link>
										</TableCell>
										<TableCell>
											<span
												className={
													status === "implemented"
														? "text-muted-foreground line-through"
														: ""
												}
											>
												{c?.title}
											</span>
										</TableCell>
										<TableCell className="text-right text-xs">
											{lev.score}
										</TableCell>
										{cov.frameworks.map((fw) => {
											const fwEdges = edges.filter((e) => {
												if (!e.requirement.startsWith(`${fw}:`)) return false;
												return (
													cov.result.byRequirement.get(e.requirement) !==
														"not_applicable" &&
													cov.result.byRequirement.has(e.requirement)
												);
											});
											const full = fwEdges.some((e) => e.coverage === "full");
											const partial =
												!full && fwEdges.some((e) => e.coverage === "partial");
											return (
												<TableCell
													key={fw}
													className="text-center"
													title={fwEdges
														.map((e) => e.requirement.slice(fw.length + 1))
														.join(", ")}
												>
													{full ? (
														t("matrixCell_full")
													) : partial ? (
														t("matrixCell_partial")
													) : (
														<span className="text-muted-foreground">
															{t("matrixCell_none")}
														</span>
													)}
													{fwEdges.length > 0 && (
														<span className="ml-1 text-muted-foreground text-xs">
															{fwEdges.length}
														</span>
													)}
												</TableCell>
											);
										})}
									</TableRow>
								);
							})}
						</TableBody>
					</Table>
				</>
			)}

			{tab === "was-waere-wenn" && (
				<>
					<p className="mb-4 text-muted-foreground text-sm">
						{t("whatIfLead")}
					</p>
					{(() => {
						const candidates = frameworksWithIndex().filter(
							(f) => !cov.frameworks.includes(f.slug),
						);
						if (candidates.length === 0)
							return <p className="text-sm">{t("whatIfAll")}</p>;
						return (
							<ul className="grid gap-4 md:grid-cols-2">
								{candidates.map((f) => {
									const w = whatIfAddFramework(
										cov.frameworks,
										f.slug,
										catalog,
										cov.implStatus,
									);
									return (
										<li
											key={f.slug}
											className="flex flex-col gap-2 rounded-md border p-4 text-sm"
										>
											<p className="font-medium">{f.name}</p>
											<p className="text-muted-foreground">{f.description}</p>
											<dl className="grid grid-cols-3 gap-2 text-center">
												<div>
													<dt className="lv-eyebrow text-[0.52rem] text-muted-foreground">
														{t("newControls")}
													</dt>
													<dd className="font-serif-display text-2xl text-primary">
														{w.newControls.length}
													</dd>
												</div>
												<div>
													<dt className="lv-eyebrow text-[0.52rem] text-muted-foreground">
														{t("alreadyNeeded")}
													</dt>
													<dd className="font-serif-display text-2xl text-primary">
														{w.alreadyNeededControls}
													</dd>
												</div>
												<div>
													<dt className="lv-eyebrow text-[0.52rem] text-muted-foreground">
														{t("alreadyCovered")}
													</dt>
													<dd className="font-serif-display text-2xl text-primary">
														{pct(w.alreadyCoveredPct)}
													</dd>
												</div>
											</dl>
											<Link
												href="/einstellungen?tab=frameworks"
												className="text-primary text-xs hover:underline"
											>
												{t("tabWhatIf")} → Einstellungen
											</Link>
										</li>
									);
								})}
							</ul>
						);
					})()}
				</>
			)}

			{tab === "plan" && (
				<>
					<p className="mb-4 text-muted-foreground text-sm">{t("planLead")}</p>
					{(() => {
						const plan = prioritizePlan(
							cov.frameworks,
							catalog,
							cov.implStatus,
							25,
						);
						if (plan.steps.length === 0)
							return <p className="text-sm">{t("planEmpty")}</p>;
						return (
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead className="w-12">{t("step")}</TableHead>
										<TableHead className="w-28">{t("control")}</TableHead>
										<TableHead>{tc("title")}</TableHead>
										<TableHead className="w-20">{t("effort")}</TableHead>
										<TableHead className="w-40">{t("gain")}</TableHead>
										<TableHead className="w-40">{t("frameworks")}</TableHead>
										<TableHead className="w-28 text-right">
											{t("cumulative")}
										</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									<TableRow className="text-muted-foreground">
										<TableCell>—</TableCell>
										<TableCell colSpan={5}>{t("baseline")}</TableCell>
										<TableCell className="text-right">
											{pct(plan.baselineCoveragePct)}
										</TableCell>
									</TableRow>
									{plan.steps.map((s, i) => (
										<TableRow key={s.control}>
											<TableCell className="text-muted-foreground">
												{i + 1}
											</TableCell>
											<TableCell className="font-mono text-xs">
												<Link
													href={`/controls/${s.control}`}
													className="hover:underline underline-offset-4"
												>
													{s.control}
												</Link>
											</TableCell>
											<TableCell>
												{CONTROL_BY_CODE.get(s.control)?.title}
											</TableCell>
											<TableCell>{tc(`effort_${s.effort}`)}</TableCell>
											<TableCell className="text-xs">
												{t("gainText", {
													covered: s.gainCovered,
													partial: s.gainPartial,
												})}
											</TableCell>
											<TableCell className="flex flex-wrap gap-1">
												{s.frameworks.map((fw) => (
													<Badge
														key={fw}
														variant="outline"
														className="normal-case tracking-normal"
													>
														{fwLabel(fw)}
													</Badge>
												))}
											</TableCell>
											<TableCell className="text-right font-medium">
												{pct(s.cumulativeCoveragePct)}
											</TableCell>
										</TableRow>
									))}
								</TableBody>
							</Table>
						);
					})()}
				</>
			)}
		</>
	);
}
