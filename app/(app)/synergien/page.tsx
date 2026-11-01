import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { EmptyState } from "@/components/entity/empty-state";
import { UrlTabs } from "@/components/entity/url-tabs";
import { withMessages } from "@/components/i18n/with-messages";
import { PageHeader } from "@/components/page-header";
import { SectionSwitch } from "@/components/shell/section-switch";
import { CompareControls } from "@/components/synergies/compare-controls";
import { Badge } from "@/components/ui/badge";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { requireOrgPage } from "@/lib/auth/gates";
import {
	ALL_REQUIREMENTS,
	CONTROL_BY_CODE,
	frameworksWithIndex,
} from "@/lib/compliance/catalog";
import {
	CATALOG_CONTROL_REFS,
	profileApplicability,
} from "@/lib/compliance/catalog-view";
import { compareFrameworks } from "@/lib/compliance/compare";
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

async function SynergiesPage({
	searchParams,
}: {
	searchParams: Promise<{
		tab?: string;
		a?: string;
		b?: string;
		stichtag?: string;
	}>;
}) {
	const { tab = "plan", a: qa, b: qb, stichtag } = await searchParams;
	const ctx = await requireOrgPage();
	const t = await getTranslations("Synergies");
	const tc = await getTranslations("Controls");
	const cov = await getOrgCoverageCached(ctx);
	if (!cov || cov.frameworks.length === 0) {
		return (
			<>
				<SectionSwitch group="synergies" current="/synergien" ctx={ctx} />

				<PageHeader title={t("title")} lead={t("lead")} />
				<EmptyState title={t("title")} lead={t("whatIfLead")} />
			</>
		);
	}
	const applicability = new Map<string, boolean>();
	const src = cov.input.applicability;
	if (src instanceof Map) for (const [k, v] of src) applicability.set(k, v);
	// Katalog der Org: eigene Rahmenwerke rechnen mit (R4)
	const catalog: SynergyCatalog = {
		requirements: cov.catalog.reqRefs,
		edges: cov.catalog.edgeRefs,
		controls: CATALOG_CONTROL_REFS,
		applicability,
	};
	const synergy = computeSynergy(cov.frameworks, catalog);
	const fwLabel = (s: string) => shortFrameworkName(s, cov.catalog);

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
			<SectionSwitch group="synergies" current="/synergien" ctx={ctx} />

			<PageHeader title={t("title")} lead={t("lead")} />
			<p className="mb-4 text-subhead">
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
					{ value: "vergleich", label: t("tabCompare") },
					{ value: "was-waere-wenn", label: t("tabWhatIf") },
				]}
			/>

			{tab === "vergleich" &&
				(() => {
					const indexed = frameworksWithIndex().filter((f) =>
						cov.frameworks.includes(f.slug),
					);
					const options = indexed.map((f) => ({
						slug: f.slug,
						name: shortFrameworkName(f.slug),
					}));
					const a = indexed.some((f) => f.slug === qa)
						? (qa as string)
						: (options[0]?.slug ?? "");
					const b = indexed.some((f) => f.slug === qb && f.slug !== a)
						? (qb as string)
						: (options.find((o) => o.slug !== a)?.slug ?? "");
					const asOf =
						stichtag && /^\d{4}-\d{2}-\d{2}$/.test(stichtag) ? stichtag : null;
					if (!a || !b)
						return <p className="text-subhead">{t("compareNeedTwo")}</p>;
					// Anwendbarkeit: heute aus der Org-Rechnung; am Stichtag neu abgeleitet,
					// manuelle Entscheidungen bleiben darüber.
					let applicabilityMap = applicability;
					if (asOf) {
						applicabilityMap = profileApplicability({
							sector: cov.profile.sector,
							licenceStage: cov.profile.licenceStage,
							caspServices: cov.profile.caspServices,
							frameworks: cov.frameworks,
							tlptDesignated: cov.profile.tlptDesignated,
							frameworkVariants: cov.profile.frameworkVariants,
							issuesTokens: cov.profile.issuesTokens,
							productRoles: cov.profile.productRoles,
							asOf: new Date(`${asOf}T00:00:00Z`),
						});
						for (const [k, v] of cov.applicabilityDetail)
							if (v.source === "manual") applicabilityMap.set(k, v.applicable);
					}
					const related = new Map<string, readonly string[]>();
					for (const r of ALL_REQUIREMENTS)
						if (r.relatedRequirements?.length)
							related.set(`${r.framework}:${r.code}`, r.relatedRequirements);
					const cmp = compareFrameworks(
						a,
						b,
						{
							requirements: cov.catalog.reqRefs,
							edges: cov.catalog.edgeRefs,
							applicability: applicabilityMap,
							related,
						},
						cov.implStatus,
					);
					const KIND_TONE = {
						equivalent: "success",
						partial: "warning",
						unique: "outline",
					} as const;
					const STATUS_TONE = {
						covered: "success",
						partial: "warning",
						open: "outline",
						not_applicable: "muted",
					} as const;
					return (
						<>
							<p className="mb-4 text-muted-foreground text-subhead">
								{t("compareLead")}
							</p>
							<CompareControls options={options} a={a} b={b} asOf={asOf} />
							<div className="mb-4 flex flex-wrap gap-2 text-subhead">
								<Badge variant="success">
									{t("kind_equivalent")}: {cmp.counts.equivalent}
								</Badge>
								<Badge variant="warning">
									{t("kind_partial")}: {cmp.counts.partial}
								</Badge>
								<Badge variant="outline">
									{t("kind_unique", { fw: fwLabel(a) })}: {cmp.counts.unique}
								</Badge>
								<Badge variant="outline">
									{t("kind_uniqueB", { fw: fwLabel(b) })}: {cmp.counts.uniqueB}
								</Badge>
								<Badge variant="muted">
									{t("sharedControls", { n: cmp.sharedControls.length })}
								</Badge>
							</div>
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead className="w-40">{fwLabel(a)}</TableHead>
										<TableHead>{t("requirementTitle")}</TableHead>
										<TableHead className="w-28">{t("relation")}</TableHead>
										<TableHead className="w-48">{fwLabel(b)}</TableHead>
										<TableHead className="w-44">{t("viaControls")}</TableHead>
										<TableHead className="w-24">{t("orgStatus")}</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{cmp.rows.map((row) => (
										<TableRow key={row.key}>
											<TableCell className="whitespace-nowrap font-mono text-footnote">
												<Link
													href={`/rahmenwerke/${a}/${encodeURIComponent(row.code)}`}
													className="hover:underline underline-offset-4"
												>
													{row.code}
												</Link>
											</TableCell>
											<TableCell className="text-subhead">
												{cov.catalog.requirementByKey.get(row.key)?.title}
											</TableCell>
											<TableCell>
												<Badge variant={KIND_TONE[row.kind]}>
													{t(`kind_${row.kind}`, { fw: fwLabel(a) })}
												</Badge>
											</TableCell>
											<TableCell className="font-mono text-footnote">
												{row.counterparts.length === 0
													? "—"
													: row.counterparts.map((c) => (
															<Link
																key={c.key}
																href={`/rahmenwerke/${b}/${encodeURIComponent(c.code)}`}
																className="mr-1 inline-block hover:underline underline-offset-4"
																title={
																	cov.catalog.requirementByKey.get(c.key)?.title
																}
															>
																{c.code}
															</Link>
														))}
											</TableCell>
											<TableCell className="font-mono text-footnote text-muted-foreground">
												{row.sharedControls.join(", ") || "—"}
											</TableCell>
											<TableCell>
												<Badge variant={STATUS_TONE[row.status]}>
													{tc(`status_${row.status}` as "status_open")}
												</Badge>
											</TableCell>
										</TableRow>
									))}
								</TableBody>
							</Table>
							{cmp.uniqueB.length > 0 && (
								<div className="mt-6">
									<h3 className="font-medium text-subhead">
										{t("uniqueBTitle", { fw: fwLabel(b), other: fwLabel(a) })}
									</h3>
									<ul className="mt-2 flex flex-wrap gap-1">
										{cmp.uniqueB.map((u) => (
											<li key={u.key}>
												<Link
													href={`/rahmenwerke/${b}/${encodeURIComponent(u.code)}`}
												>
													<Badge variant="outline" className="">
														{u.code} ·{" "}
														{cov.catalog.requirementByKey.get(u.key)?.title}
													</Badge>
												</Link>
											</li>
										))}
									</ul>
								</div>
							)}
							<div className="mt-6 grid grid-cols-1 gap-4 text-subhead sm:grid-cols-2">
								<div>
									<h3 className="font-medium">
										{t("onlyControls", { fw: fwLabel(a) })}
									</h3>
									<p className="mt-1 font-mono text-muted-foreground text-footnote">
										{cmp.onlyA.join(", ") || "—"}
									</p>
								</div>
								<div>
									<h3 className="font-medium">
										{t("onlyControls", { fw: fwLabel(b) })}
									</h3>
									<p className="mt-1 font-mono text-muted-foreground text-footnote">
										{cmp.onlyB.join(", ") || "—"}
									</p>
								</div>
							</div>
						</>
					);
				})()}

			{tab === "matrix" && (
				<>
					<p className="mb-4 text-muted-foreground text-subhead">
						{t("matrixLead")}
					</p>
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead className="sticky left-0 z-10 w-24 bg-background align-bottom">
									{t("control")}
								</TableHead>
								<TableHead className="min-w-48 align-bottom">
									{tc("title")}
								</TableHead>
								<TableHead className="w-16 text-right align-bottom">
									{tc("leverage")}
								</TableHead>
								{cov.frameworks.map((fw) => (
									<TableHead
										key={fw}
										className="h-auto w-9 px-1 py-2 align-bottom"
										title={fwLabel(fw)}
									>
										<span className="mx-auto block max-h-36 rotate-180 overflow-hidden text-ellipsis [writing-mode:vertical-rl]">
											{fwLabel(fw)}
										</span>
									</TableHead>
								))}
							</TableRow>
						</TableHeader>
						<TableBody>
							{rankByLeverage(cov.result.leverage).map((lev) => {
								const c = CONTROL_BY_CODE.get(lev.control);
								const edges = cov.catalog.edgesByControl.get(lev.control) ?? [];
								const status = cov.implStatus.get(lev.control);
								return (
									<TableRow key={lev.control}>
										<TableCell className="sticky left-0 z-10 whitespace-nowrap bg-background font-mono text-footnote">
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
										<TableCell className="text-right text-footnote">
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
													className="whitespace-nowrap px-1 text-center"
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
														<span className="ml-0.5 text-footnote text-muted-foreground">
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
					<p className="mb-4 text-muted-foreground text-subhead">
						{t("whatIfLead")}
					</p>
					{(() => {
						const candidates = frameworksWithIndex().filter(
							(f) => !cov.frameworks.includes(f.slug),
						);
						if (candidates.length === 0)
							return <p className="text-subhead">{t("whatIfAll")}</p>;
						return (
							<ul className="grid grid-cols-1 gap-4 md:grid-cols-2">
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
											className="flex flex-col gap-2 rounded-2xl bg-card p-4 text-subhead"
										>
											<p className="font-medium">{f.name}</p>
											<p className="text-muted-foreground">{f.description}</p>
											<dl className="grid grid-cols-3 gap-2 text-center">
												<div>
													<dt className="font-medium text-footnote text-muted-foreground">
														{t("newControls")}
													</dt>
													<dd className="font-bold text-title-2">
														{w.newControls.length}
													</dd>
												</div>
												<div>
													<dt className="font-medium text-footnote text-muted-foreground">
														{t("alreadyNeeded")}
													</dt>
													<dd className="font-bold text-title-2">
														{w.alreadyNeededControls}
													</dd>
												</div>
												<div>
													<dt className="font-medium text-footnote text-muted-foreground">
														{t("alreadyCovered")}
													</dt>
													<dd className="font-bold text-title-2">
														{pct(w.alreadyCoveredPct)}
													</dd>
												</div>
											</dl>
											<Link
												href="/einstellungen?tab=frameworks"
												className="text-primary text-footnote hover:underline"
											>
												{`${t("tabWhatIf")} > Einstellungen`}
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
					<p className="mb-4 text-muted-foreground text-subhead">
						{t("planLead")}
					</p>
					{(() => {
						const plan = prioritizePlan(
							cov.frameworks,
							catalog,
							cov.implStatus,
							25,
						);
						if (plan.steps.length === 0)
							return <p className="text-subhead">{t("planEmpty")}</p>;
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
											<TableCell className="whitespace-nowrap font-mono text-footnote">
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
											<TableCell className="text-footnote">
												{t("gainText", {
													covered: s.gainCovered,
													partial: s.gainPartial,
												})}
											</TableCell>
											<TableCell className="flex flex-wrap gap-1">
												{s.frameworks.map((fw) => (
													<Badge key={fw} variant="outline" className="">
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

export default withMessages(SynergiesPage, ["Synergies"]);
