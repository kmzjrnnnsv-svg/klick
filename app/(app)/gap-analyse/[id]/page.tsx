import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ChapterPane } from "@/components/assessments/chapter-pane";
import { ExtendButton } from "@/components/assessments/extend-button";
import { FocusQuestion } from "@/components/assessments/focus-question";
import { MeasuresForm } from "@/components/assessments/measures-form";
import { QuestionCard } from "@/components/assessments/question-card";
import {
	ApplyDialog,
	CancelButton,
	CompleteChecklistButton,
	RepeatButton,
	ReviewCell,
	SubmitButton,
} from "@/components/assessments/review-controls";
import { withMessages } from "@/components/i18n/with-messages";
import { PageHeader } from "@/components/page-header";
import {
	CompleteSupplierDialog,
	ReopenSupplierDialog,
} from "@/components/supplier/supplier-forms";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { KeepActiveVisible } from "@/components/ui/keep-active-visible";
import type { ImplStatus } from "@/db/schema/enums";
import {
	applyChanges,
	proposeControlStatus,
	proposeExclusions,
} from "@/lib/assessments/apply";
import {
	catalogQuestions,
	sectionsOf,
} from "@/lib/assessments/catalog-template";
import { productMeasures, proposeMeasures } from "@/lib/assessments/measures";
import {
	type NaConfirmation,
	naAllowed,
	naDropsControl,
	naImpactOf,
	naOpenShare,
} from "@/lib/assessments/na";
import { naConfirmations } from "@/lib/assessments/na-approval";
import {
	effectiveAnswer,
	questionVerdict,
	scoreAssessment,
	type Verdict,
} from "@/lib/assessments/score";
import { missingQuestions } from "@/lib/assessments/short-check";
import { answerStates } from "@/lib/assessments/state";
import { requireOrgPage } from "@/lib/auth/gates";
import { toOrgCtx } from "@/lib/auth/guards";
import { allows } from "@/lib/auth/permissions";
import { CONTROL_BY_CODE } from "@/lib/compliance/catalog";
import { CONTROL_EXPLAINERS } from "@/lib/compliance/catalog/control-explainers";
import { synergyCatalogFor } from "@/lib/compliance/catalog-view";
import { deriveCoverage } from "@/lib/compliance/coverage";
import { exclusionAllowedForKey, naImpact } from "@/lib/compliance/exclusions";
import { STATIC_CATALOG } from "@/lib/compliance/org-catalog";
import {
	fmtDate,
	getOrgCoverageCached,
	shortFrameworkName,
} from "@/lib/compliance/page-data";
import { listMembersForPicker } from "@/lib/compliance/queries";
import { getAssessmentDetail } from "@/lib/compliance/queries-assessments";
import { relationHint } from "@/lib/compliance/relation-hints";
import { prioritizePlan } from "@/lib/compliance/synergy";
import { readOrg } from "@/lib/db/with-org";
import { cn } from "@/lib/utils";

// Zwei Schritte (Wunsch 03.11.): Fragen, dann Ergebnis mit Übernehmen,
// Maßnahmen und Bericht. Alte Links auf Bewertung/Maßnahmen landen im
// Ergebnis an der passenden Stelle.
const STEPS = ["fragen", "ergebnis"] as const;
const LEGACY_STEPS: Record<string, string> = {
	bewertung: "antworten",
	massnahmen: "massnahmen",
};
// Kopf der Seite bleibt bei den Fragen stehen: höchstens so viele Rahmenwerke
const SHOWN_FRAMEWORKS = 4;
type Step = (typeof STEPS)[number];

const VERDICT_TONE: Record<
	Verdict,
	"success" | "warning" | "destructive" | "outline" | "muted"
> = {
	fulfilled: "success",
	unproven: "warning",
	partial: "warning",
	not_fulfilled: "destructive",
	open: "outline",
	not_applicable: "muted",
};

const IMPL_KEY: Record<ImplStatus, string> = {
	not_started: "notStarted",
	planned: "planned",
	in_progress: "inProgress",
	implemented: "implemented",
	not_applicable: "notApplicable",
};

type Search = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

// Geführte Gap-Analyse: 1 Fragen (eine auf einmal oder als Liste je
// Kapitel) → 2 Ergebnis. Schritt, Ansicht, Frage und Kapitel stehen in der
// URL.
async function AssessmentPage({
	params,
	searchParams,
}: {
	params: Promise<{ id: string }>;
	searchParams: Promise<Search>;
}) {
	const { id } = await params;
	if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
	const sp = await searchParams;
	const ctx = await requireOrgPage({ assessment: ["read"] });
	const t = await getTranslations("Assessment");
	const tes = await getTranslations("EvidenceStudio");
	const tNav = await getTranslations("Nav");
	const ts = await getTranslations("Status");
	const data = await readOrg(toOrgCtx(ctx), async (tx) => {
		const detail = await getAssessmentDetail(tx, ctx.orgId, id);
		if (!detail) return null;
		return {
			...detail,
			// Weitergeben und Maßnahmen nur an Personen, die mitarbeiten können
			members: await listMembersForPicker(tx, ctx.orgId, { workers: true }),
			// „Nicht relevant“: Stand der Bestätigung je Frage
			naConfirmations:
				detail.assessment.kind === "self"
					? await naConfirmations(tx, ctx.orgId, id, detail.answers)
					: new Map<string, NaConfirmation>(),
		};
	});
	if (!data || data.assessment.kind === "engagement") notFound();
	const a = data.assessment;
	// Produktcheckliste (CRA) und Lieferantenbewertung: gleicher Ablauf, aber
	// Antworten gelten nur für Produkt bzw. Dienstleister — keine Übernahme in
	// den Control-Status.
	const productId = a.kind === "product" ? a.subjectId : null;
	const providerId = a.kind === "supplier" ? a.subjectId : null;
	const subjectScoped = Boolean(productId || providerId);
	const closed = a.status === "completed" || a.status === "cancelled";
	const rawStep = one(sp.schritt) ?? "";
	const step: Step = (STEPS as readonly string[]).includes(rawStep)
		? (rawStep as Step)
		: LEGACY_STEPS[rawStep]
			? "ergebnis"
			: closed
				? "ergebnis"
				: "fragen";
	const canAnswer = !closed && allows(ctx, { assessment: ["answer"] });
	const canReview = !closed && allows(ctx, { assessment: ["review"] });
	const canApply = !closed && allows(ctx, { assessment: ["apply"] });
	const canTasks = allows(ctx, { task: ["create"] });
	const cov = await getOrgCoverageCached(ctx);
	const catalog = cov?.catalog ?? STATIC_CATALOG;
	const fwNames = Object.fromEntries(
		a.frameworks.map((s) => [s, shortFrameworkName(s, catalog)]),
	);
	const allowedKey = (k: string) => exclusionAllowedForKey(k, catalog);

	const states = answerStates(a.questions, data.answers, data.controlEvidence);
	const answerBy = new Map(data.answers.map((x) => [x.questionCode, x]));
	const score = scoreAssessment(a.questions, states, {
		naOpenShare: subjectScoped ? undefined : (q) => naOpenShare(q, catalog),
	});
	const sections = sectionsOf(a.questions);
	const answeredIn = (code: string) =>
		a.questions.filter(
			(q) => q.sectionCode === code && effectiveAnswer(states.get(q.code)),
		).length;
	const statusLabel = (code?: string) =>
		code
			? ts(IMPL_KEY[data.implStatus.get(code) ?? "not_started"] as "notStarted")
			: null;

	// Abdeckung heute vs. nach Übernahme (nur die Rahmenwerke des Fragebogens);
	// „Nicht relevant“ zählt nur bestätigt
	const naConfirmed = (q: { code: string }) =>
		data.naConfirmations.get(q.code)?.status === "confirmed";
	const changes = proposeControlStatus(
		a.questions,
		states,
		data.implStatus,
		allowedKey,
		{ dropsControl: (q) => naDropsControl(q, catalog), naConfirmed },
	);
	// noch nicht bestätigt: wirkt, sobald die zweite Person bestätigt
	const naOpen = a.questions.flatMap((q) => {
		const c = data.naConfirmations.get(q.code);
		if (!c || c.status === "confirmed" || !q.controlCode) return [];
		if (effectiveAnswer(states.get(q.code)) !== "na") return [];
		return [
			{
				controlCode: q.controlCode,
				title: CONTROL_BY_CODE.get(q.controlCode)?.title ?? "",
				status: c.status,
			},
		];
	});
	const after = applyChanges(data.implStatus, changes);
	const alreadyExcluded = new Set(
		[...(cov?.applicabilityDetail ?? [])]
			.filter(([, d]) => d.source === "manual" && !d.applicable)
			.map(([k]) => k),
	);
	const exclusions = subjectScoped
		? []
		: proposeExclusions(
				a.questions,
				states,
				allowedKey,
				alreadyExcluded,
				naConfirmed,
			);
	const exclusionInfo = naImpact(
		exclusions.map((x) => x.key),
		catalog,
	).excludable;
	const applicability = new Map(
		[...(cov?.applicabilityDetail ?? [])].map(([k, d]) => [k, d.applicable]),
	);
	const coverageInput = {
		frameworks: a.frameworks,
		requirements: catalog.reqRefs,
		applicability,
		edges: catalog.edgeRefs,
	};
	const covNow = deriveCoverage({
		...coverageInput,
		implStatus: data.implStatus,
	});
	const applicabilityAfter = new Map(applicability);
	for (const x of exclusions) applicabilityAfter.set(x.key, false);
	const covAfter = deriveCoverage({
		...coverageInput,
		applicability: applicabilityAfter,
		implStatus: after,
	});

	const base = `/gap-analyse/${a.id}`;
	const stepHref = (s: Step, extra = "") => `${base}?schritt=${s}${extra}`;

	// Ansicht der Fragen: eine auf einmal (Standard zum Beantworten) oder als
	// Liste je Kapitel (zum Durchsehen; ohne Recht zu antworten immer)
	const view: "fokus" | "liste" =
		one(sp.ansicht) === "liste" || !canAnswer ? "liste" : "fokus";
	const isAnswered = (code: string) =>
		Boolean(effectiveAnswer(states.get(code)));
	const focusHref = (code?: string) =>
		`${base}?schritt=fragen&ansicht=fokus${code ? `&frage=${code}` : ""}`;
	const doneHref = `${base}?schritt=fragen&ansicht=fokus&fertig=1`;
	// nächste offene Frage ab einer Stelle, rundherum, ohne die Stelle selbst
	const nextOpen = (from: number) => {
		const n = a.questions.length;
		for (let k = 1; k <= n; k += 1) {
			const q = a.questions[(from + k) % n];
			if (q && !isAnswered(q.code)) return q;
		}
		return null;
	};
	const firstOpenIn = (section: string) =>
		a.questions.find((q) => q.sectionCode === section && !isAnswered(q.code)) ??
		a.questions.find((q) => q.sectionCode === section);

	// Kurz-Check: wie viele Fragen der vollständige Fragebogen noch hätte
	const missing =
		a.kind === "self" && !closed && cov
			? missingQuestions(
					a.questions,
					catalogQuestions({
						sector: cov.profile.sector,
						licenceStage: cov.profile.licenceStage,
						caspServices: cov.profile.caspServices,
						frameworks: a.frameworks,
						tlptDesignated: cov.profile.tlptDesignated,
						frameworkVariants: cov.profile.frameworkVariants,
						issuesTokens: cov.profile.issuesTokens,
						productRoles: cov.profile.productRoles,
						asOf: a.asOf ? new Date(`${a.asOf}T12:00:00Z`) : undefined,
						manual: new Map(
							[...cov.applicabilityDetail]
								.filter(([, d]) => d.source === "manual")
								.map(([k, d]) => [k, d.applicable]),
						),
						catalog,
					}),
				)
			: 0;
	const canExtend = missing > 0 && allows(ctx, { assessment: ["create"] });

	return (
		// Fragen als geteilte Ansicht: ab 1024 px steht der Kopf, Kapitel und
		// Fragen scrollen je für sich (data-split-*, styles/base.css)
		<div data-split-page={step === "fragen" ? "" : undefined}>
			<PageHeader
				compact
				back={{ href: "/gap-analyse", label: tNav("gapAnalysis") }}
				eyebrow={`${a.code} · ${t(`status_${a.status}`)}${a.asOf ? ` · Stichtag ${fmtDate.format(new Date(a.asOf))}` : ""}`}
				title={a.title}
				lead={t("progress", {
					answered: score.progress.answered,
					total: score.progress.total,
				})}
				actions={
					<div className="flex flex-wrap gap-2">
						{productId && (
							<Link
								href={`/produkte/${productId}?tab=checkliste`}
								className={buttonVariants({ variant: "outline", size: "sm" })}
							>
								{t("toProduct")}
							</Link>
						)}
						{providerId && (
							<Link
								href={`/dienstleister/${providerId}?tab=bewertungen`}
								className={buttonVariants({ variant: "outline", size: "sm" })}
							>
								{t("toProvider")}
							</Link>
						)}
						{/* Kopf bleibt stehen: höchstens vier Rahmenwerke, Rest gezählt */}
						{a.frameworks.slice(0, SHOWN_FRAMEWORKS).map((s) => (
							<Badge key={s} variant="muted">
								{shortFrameworkName(s, catalog)}
							</Badge>
						))}
						{a.frameworks.length > SHOWN_FRAMEWORKS && (
							<Badge
								variant="muted"
								title={a.frameworks
									.slice(SHOWN_FRAMEWORKS)
									.map((s) => shortFrameworkName(s, catalog))
									.join(", ")}
							>
								{t("moreFrameworks", {
									count: a.frameworks.length - SHOWN_FRAMEWORKS,
								})}
							</Badge>
						)}
					</div>
				}
			/>

			<nav aria-label="Schritte" className="mb-5">
				<ol className="flex flex-wrap gap-2 text-subhead">
					{STEPS.map((s) => (
						<li key={s}>
							<Link
								href={stepHref(s)}
								aria-current={step === s ? "step" : undefined}
								className={cn(
									"inline-flex rounded-xl bg-card px-3 py-1.5 transition-colors hover:bg-muted",
									step === s && "border-primary bg-primary/5 font-medium",
								)}
							>
								{t(`step_${s}`)}
							</Link>
						</li>
					))}
				</ol>
				<div
					className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted"
					role="progressbar"
					aria-valuemin={0}
					aria-valuemax={score.progress.total}
					aria-valuenow={score.progress.answered}
					aria-label={t("progress", {
						answered: score.progress.answered,
						total: score.progress.total,
					})}
				>
					<div
						className="h-full rounded-full bg-primary"
						style={{
							width: `${score.progress.total > 0 ? (100 * score.progress.answered) / score.progress.total : 0}%`,
						}}
					/>
				</div>
			</nav>

			{closed && (
				<p className="mb-4 rounded-2xl bg-card p-3 text-subhead">
					{t("readOnly")}
				</p>
			)}

			{step === "fragen" && (canAnswer || missing > 0) && (
				<div className="mb-4 flex flex-wrap items-center justify-between gap-3">
					{canAnswer ? (
						<nav
							aria-label={t("viewLabel")}
							className="inline-flex rounded-xl bg-muted p-0.5 text-subhead"
						>
							{(["fokus", "liste"] as const).map((v) => (
								<Link
									key={v}
									href={
										v === "fokus"
											? focusHref()
											: stepHref("fragen", "&ansicht=liste")
									}
									aria-current={view === v ? "true" : undefined}
									className={cn(
										"hit-area rounded-lg px-3 py-1.5",
										view === v && "bg-card font-medium shadow-sm",
									)}
								>
									{t(`view_${v}`)}
								</Link>
							))}
						</nav>
					) : (
						<span />
					)}
					{missing > 0 && (
						<p className="flex flex-wrap items-center gap-2 text-footnote text-muted-foreground">
							{t("shortCheckLine", {
								shown: a.questions.length,
								total: a.questions.length + missing,
							})}
							{canExtend && (
								<ExtendButton assessmentId={a.id} missing={missing} />
							)}
						</p>
					)}
				</div>
			)}

			{step === "fragen" &&
				view === "fokus" &&
				(() => {
					const asked = one(sp.frage);
					const askedIdx = asked
						? a.questions.findIndex((q) => q.code === asked)
						: -1;
					const done =
						one(sp.fertig) === "1" &&
						!a.questions.some((q) => !isAnswered(q.code));
					const current = done
						? null
						: askedIdx >= 0
							? a.questions[askedIdx]
							: (a.questions.find((q) => !isAnswered(q.code)) ?? null);
					// die Frage steht immer in der Adresse: sonst springt die Seite
					// nach dem Speichern zur nächsten offenen Frage, bevor die
					// Rückfrage zur Antwort beantwortet ist
					if (current && askedIdx < 0) redirect(focusHref(current.code));
					const idx = current ? a.questions.indexOf(current) : -1;
					const chapter = current?.sectionCode ?? "";
					return (
						<div
							data-split-body
							className="grid grid-cols-1 gap-6 lg:grid-cols-[14rem_1fr]"
						>
							<nav aria-label={t("chapters")} data-split-pane>
								<KeepActiveVisible active={chapter} />
								<ul className="flex gap-1 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible">
									{sections.map((s) => {
										const doneIn = answeredIn(s.code);
										return (
											<li key={s.code}>
												<Link
													href={focusHref(firstOpenIn(s.code)?.code)}
													aria-current={s.code === chapter ? "page" : undefined}
													className={cn(
														"flex items-center justify-between gap-2 whitespace-nowrap rounded-md px-2 py-1.5 text-subhead hover:bg-muted",
														s.code === chapter && "bg-muted font-medium",
													)}
												>
													<span className="truncate">{s.title}</span>
													<span
														className={cn(
															"text-footnote tabular-nums",
															doneIn === s.count
																? "text-success"
																: "text-muted-foreground",
														)}
													>
														{t("chapterProgress", {
															answered: doneIn,
															total: s.count,
														})}
													</span>
												</Link>
											</li>
										);
									})}
								</ul>
							</nav>
							<div data-split-pane className="min-w-0">
								{!current ? (
									<section className="flex flex-col items-start gap-4 rounded-2xl bg-card p-6 sm:p-8">
										<h2 className="font-semibold text-title-2">
											{t("focusDoneTitle")}
										</h2>
										<p className="text-callout text-muted-foreground">
											{t("focusDoneLead", {
												total: a.questions.length,
											})}
										</p>
										<div className="flex flex-wrap gap-2">
											<Link
												href={stepHref("ergebnis")}
												className={buttonVariants()}
											>
												{t("toResult")}
											</Link>
											<Link
												href={stepHref("fragen", "&ansicht=liste")}
												className={buttonVariants({ variant: "outline" })}
											>
												{t("focusDoneList")}
											</Link>
											{canExtend && (
												<ExtendButton assessmentId={a.id} missing={missing} />
											)}
										</div>
									</section>
								) : (
									(() => {
										const q = current;
										const row = answerBy.get(q.code);
										const fromControl = q.controlCode
											? (data.controlEvidence.get(q.controlCode) ?? [])
											: [];
										const own = (row?.evidenceIds ?? []).map((eid) => ({
											id: eid,
											title: data.evidence.get(eid)?.title ?? eid,
										}));
										const ownIds = new Set(own.map((d) => d.id));
										const documents = [
											...own,
											...fromControl
												.filter((d) => !ownIds.has(d.id))
												.map((d) => ({ ...d, fromControl: true })),
										];
										const plain = q.controlCode
											? CONTROL_EXPLAINERS[q.controlCode]
											: undefined;
										const nextQ = nextOpen(idx);
										const prevQ = idx > 0 ? a.questions[idx - 1] : null;
										const linkable = data.allEvidence
											.filter(
												(e) =>
													!ownIds.has(e.id) &&
													!fromControl.some((d) => d.id === e.id),
											)
											.map((e) => ({ id: e.id, title: e.title }));
										return (
											<FocusQuestion
												key={q.code}
												assessmentId={a.id}
												questionCode={q.code}
												statement={plain?.what ?? q.text}
												why={plain ? plain.why : (q.help ?? null)}
												technical={
													q.controlCode ? `${q.controlCode} · ${q.text}` : null
												}
												position={{
													index: idx + 1,
													total: a.questions.length,
													chapter: q.sectionTitle,
												}}
												initial={{
													answer: row?.answer ?? null,
													comment: row?.comment ?? null,
													documents: documents.length,
												}}
												nextHref={nextQ ? focusHref(nextQ.code) : doneHref}
												prevHref={prevQ ? focusHref(prevQ.code) : null}
												members={data.members}
												canAnswer={canAnswer}
												canDelegate={canAnswer && canTasks}
											>
												<QuestionCard
													key={`${q.code}-${row?.answer ?? ""}-${row?.comment ?? ""}`}
													assessmentId={a.id}
													question={q}
													na={
														subjectScoped || !q.controlCode
															? null
															: {
																	allowed: naAllowed(q, catalog),
																	...naImpactOf(q, catalog),
																}
													}
													initial={{
														answer: row?.answer ?? null,
														comment: row?.comment ?? null,
														naReason: row?.naReason ?? null,
														naConfirmation:
															data.naConfirmations.get(q.code) ?? null,
														documents,
													}}
													hint={
														q.controlCode && !subjectScoped
															? relationHint(
																	q.controlCode,
																	{
																		frameworks: a.frameworks,
																		applicability,
																		catalog,
																	},
																	(topic) =>
																		tes(
																			`topic_${topic.replace(":", "_")}` as "topic_retention",
																		),
																)
															: undefined
													}
													statusLabel={statusLabel(q.controlCode)}
													frameworkNames={fwNames}
													members={data.members}
													existingEvidence={linkable}
													canAnswer={canAnswer}
													canDelegate={canAnswer && canTasks}
													canImportDocument={allows(ctx, {
														document: ["create"],
													})}
												/>
											</FocusQuestion>
										);
									})()
								)}
							</div>
						</div>
					);
				})()}

			{step === "fragen" &&
				view === "liste" &&
				(() => {
					const chapter = one(sp.kapitel) ?? sections[0]?.code ?? "";
					const idx = sections.findIndex((s) => s.code === chapter);
					const next = sections[idx + 1];
					const questions = a.questions.filter(
						(q) => q.sectionCode === chapter,
					);
					const linkable = data.allEvidence.map((e) => ({
						id: e.id,
						title: e.title,
					}));
					return (
						<div
							data-split-body
							className="grid grid-cols-1 gap-6 lg:grid-cols-[14rem_1fr]"
						>
							<nav aria-label={t("chapters")} data-split-pane>
								<KeepActiveVisible active={chapter} />
								<ul className="flex gap-1 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible">
									{sections.map((s) => {
										const done = answeredIn(s.code);
										return (
											<li key={s.code}>
												<Link
													href={stepHref(
														"fragen",
														`&ansicht=liste&kapitel=${s.code}`,
													)}
													aria-current={s.code === chapter ? "page" : undefined}
													className={cn(
														"flex items-center justify-between gap-2 whitespace-nowrap rounded-md px-2 py-1.5 text-subhead hover:bg-muted",
														s.code === chapter && "bg-muted font-medium",
													)}
												>
													<span className="truncate">{s.title}</span>
													<span
														className={cn(
															"text-footnote tabular-nums",
															done === s.count
																? "text-success"
																: "text-muted-foreground",
														)}
													>
														{t("chapterProgress", {
															answered: done,
															total: s.count,
														})}
													</span>
												</Link>
											</li>
										);
									})}
								</ul>
							</nav>
							{/* key: ein neues Kapitel beginnt oben */}
							<ChapterPane
								key={chapter}
								title={sections[idx]?.title ?? ""}
								total={questions.length}
								answered={answeredIn(chapter)}
							>
								{questions.map((q) => {
									const row = answerBy.get(q.code);
									const fromControl = q.controlCode
										? (data.controlEvidence.get(q.controlCode) ?? [])
										: [];
									const own = (row?.evidenceIds ?? []).map((eid) => ({
										id: eid,
										title: data.evidence.get(eid)?.title ?? eid,
									}));
									const ownIds = new Set(own.map((d) => d.id));
									return (
										<QuestionCard
											key={q.code}
											assessmentId={a.id}
											question={q}
											na={
												subjectScoped || !q.controlCode
													? null
													: {
															allowed: naAllowed(q, catalog),
															...naImpactOf(q, catalog),
														}
											}
											initial={{
												answer: row?.answer ?? null,
												comment: row?.comment ?? null,
												naReason: row?.naReason ?? null,
												naConfirmation:
													data.naConfirmations.get(q.code) ?? null,
												documents: [
													...own,
													...fromControl
														.filter((d) => !ownIds.has(d.id))
														.map((d) => ({ ...d, fromControl: true })),
												],
											}}
											hint={
												q.controlCode && !subjectScoped
													? relationHint(
															q.controlCode,
															{
																frameworks: a.frameworks,
																applicability,
																catalog,
															},
															(topic) =>
																tes(
																	`topic_${topic.replace(":", "_")}` as "topic_retention",
																),
														)
													: undefined
											}
											statusLabel={statusLabel(q.controlCode)}
											frameworkNames={fwNames}
											members={data.members}
											existingEvidence={linkable.filter(
												(e) =>
													!ownIds.has(e.id) &&
													!fromControl.some((d) => d.id === e.id),
											)}
											canAnswer={canAnswer}
											canDelegate={canAnswer && canTasks}
											canImportDocument={allows(ctx, {
												document: ["create"],
											})}
										/>
									);
								})}
								<div className="flex flex-wrap justify-end gap-2">
									{next ? (
										<Link
											href={stepHref(
												"fragen",
												`&ansicht=liste&kapitel=${next.code}`,
											)}
											className={buttonVariants()}
										>
											{t("nextChapter", { title: next.title })}
										</Link>
									) : (
										<>
											{canAnswer && a.status === "in_progress" && (
												<SubmitButton assessmentId={a.id} />
											)}
											<Link
												href={stepHref("ergebnis")}
												className={buttonVariants()}
											>
												{t("toResult")}
											</Link>
										</>
									)}
								</div>
							</ChapterPane>
						</div>
					);
				})()}

			{step === "ergebnis" && (
				<div className="flex flex-col gap-8">
					<p className="text-muted-foreground text-subhead">
						{t("resultLead")}
					</p>
					<div className="grid grid-cols-1 gap-4 md:grid-cols-[auto_1fr]">
						<div className="flex flex-col gap-1 rounded-2xl bg-card p-4">
							<span className="font-medium text-footnote text-muted-foreground">
								{t("score")}
							</span>
							<span className="font-bold text-title-1 tabular-nums">
								{score.score ?? "—"}
							</span>
							<span className="max-w-48 text-muted-foreground text-footnote">
								{t("scoreHint")}
							</span>
						</div>
						<div className="flex flex-col gap-2 text-subhead">
							<p className="text-muted-foreground text-footnote">
								{t("counts", score.counts)}
							</p>
							{!subjectScoped && (
								<table className="w-full text-subhead">
									<thead>
										<tr className="text-left text-muted-foreground text-footnote">
											<th className="py-1 font-normal" />
											<th className="py-1 font-normal">{t("coverageNow")}</th>
											<th className="py-1 font-normal">{t("coverageAfter")}</th>
										</tr>
									</thead>
									<tbody>
										{a.frameworks.map((s) => (
											<tr key={s} className="border-t">
												<td className="py-1">
													{shortFrameworkName(s, catalog)}
												</td>
												<td className="py-1 tabular-nums">
													{Math.round(
														covNow.byFramework.get(s)?.coveragePct ?? 0,
													)}
													{" %"}
												</td>
												<td className="py-1 font-medium tabular-nums">
													{Math.round(
														covAfter.byFramework.get(s)?.coveragePct ?? 0,
													)}
													{" %"}
												</td>
											</tr>
										))}
									</tbody>
								</table>
							)}
							{canApply && productId && (
								<div className="flex flex-wrap gap-2">
									<CompleteChecklistButton
										assessmentId={a.id}
										productId={productId}
									/>
								</div>
							)}
							{canApply &&
								providerId &&
								allows(ctx, { provider: ["update"] }) && (
									<div className="flex flex-wrap gap-2">
										<CompleteSupplierDialog
											assessmentId={a.id}
											providerId={providerId}
											score={score.score}
											rating={score.rating}
											knockouts={score.knockouts}
											unanswered={
												score.progress.total - score.progress.answered
											}
										/>
										{canReview &&
											(a.status === "submitted" ||
												a.status === "in_review") && (
												<ReopenSupplierDialog assessmentId={a.id} />
											)}
									</div>
								)}
							{canApply && !subjectScoped && (
								<div className="flex flex-wrap gap-2">
									<ApplyDialog
										assessmentId={a.id}
										changes={changes.map((c) => ({
											controlCode: c.controlCode,
											title: CONTROL_BY_CODE.get(c.controlCode)?.title ?? "",
											from: ts(IMPL_KEY[c.from] as "notStarted"),
											to: ts(IMPL_KEY[c.to] as "notStarted"),
										}))}
										exclusions={exclusionInfo}
										naOpen={naOpen}
									/>
								</div>
							)}
						</div>
					</div>
					{(() => {
						const plan =
							cov && !subjectScoped
								? prioritizePlan(
										a.frameworks,
										synergyCatalogFor({
											sector: cov.profile.sector,
											licenceStage: cov.profile.licenceStage,
											caspServices: cov.profile.caspServices,
											frameworks: a.frameworks,
											tlptDesignated: cov.profile.tlptDesignated,
											frameworkVariants: cov.profile.frameworkVariants,
											issuesTokens: cov.profile.issuesTokens,
											productRoles: cov.profile.productRoles,
										}),
										a.appliedAt ? data.implStatus : after,
										300,
									)
								: {
										steps: [],
										applicable: 0,
										baselineCoveragePct: null,
										baselineProgressPct: null,
									};
						const measures = subjectScoped
							? productMeasures({ questions: a.questions, answers: states })
							: proposeMeasures({
									questions: a.questions,
									answers: states,
									plan,
								});
						return (
							<section id="massnahmen" className="flex flex-col gap-4">
								<h2 className="font-semibold text-title-3">
									{t("measuresTitle")}
								</h2>
								<p className="text-muted-foreground text-subhead">
									{t("measuresLead")}
								</p>
								<MeasuresForm
									assessmentId={a.id}
									measures={measures}
									members={data.members}
									defaultAssignee={ctx.userId}
									frameworkNames={fwNames}
									readOnly={!canTasks}
								/>
							</section>
						);
					})()}
					<section className="flex flex-col gap-6">
						<h2 className="font-semibold text-title-3">{t("summaryTitle")}</h2>
						<div className="flex flex-wrap items-end gap-6">
							<div>
								<p className="font-medium text-footnote text-muted-foreground">
									{t("score")}
								</p>
								<p className="font-semibold text-5xl text-primary tabular-nums">
									{a.score ?? score.score ?? "—"}
								</p>
							</div>
							<p className="max-w-xl text-muted-foreground text-subhead">
								{t("counts", score.counts)}
							</p>
							{a.rating && (
								<p className="text-subhead">
									{t("ratingLabel", { rating: a.rating })}
									{a.decision && ` · ${t(`decision_${a.decision}`)}`}
								</p>
							)}
						</div>
						{a.decisionNote && (
							<p className="max-w-2xl text-muted-foreground text-subhead">
								{a.decisionNote}
							</p>
						)}
						<section>
							<h2 className="mb-2 font-medium">{t("bySection")}</h2>
							<ul className="grid grid-cols-1 gap-2 text-subhead sm:grid-cols-2">
								{score.bySection.map((s) => (
									<li
										key={s.code}
										className="flex items-center justify-between rounded-xl bg-card px-3 py-1.5"
									>
										<span>{s.title}</span>
										<span className="tabular-nums">
											{s.score ?? "—"}{" "}
											<span className="text-muted-foreground text-footnote">
												({s.answered}/{s.total})
											</span>
										</span>
									</li>
								))}
							</ul>
						</section>
						<div className="flex flex-wrap gap-2">
							{allows(ctx, { export: ["create"] }) && (
								<a
									href={`/api/export/gap-analyse.md?id=${a.id}`}
									className={buttonVariants({ variant: "outline" })}
								>
									{t("export")}
								</a>
							)}
							{a.frameworks[0] && !providerId && (
								<Link
									href={`/rahmenwerke/${a.frameworks[0]}?tab=pruefungsreife`}
									className={buttonVariants({ variant: "outline" })}
								>
									{t("toReadiness")}
								</Link>
							)}
							{!subjectScoped && allows(ctx, { assessment: ["create"] }) && (
								<RepeatButton assessmentId={a.id} />
							)}
							{!closed && allows(ctx, { assessment: ["create"] }) && (
								<CancelButton assessmentId={a.id} />
							)}
						</div>
					</section>
					<details
						id="antworten"
						open={canReview || rawStep === "bewertung"}
						className="group"
					>
						<summary className="hit-area mb-3 cursor-pointer font-semibold text-title-3">
							{t("answersTitle", { n: a.questions.length })}
						</summary>
						<div className="flex flex-col gap-6">
							{sections.map((s) => (
								<section key={s.code}>
									<h2 className="mb-2 font-medium">{s.title}</h2>
									<ul className="flex flex-col list-inset overflow-hidden rounded-2xl bg-card text-subhead">
										{a.questions
											.filter((q) => q.sectionCode === s.code)
											.map((q) => {
												const st = states.get(q.code);
												const row = answerBy.get(q.code);
												const verdict = questionVerdict(q, st);
												return (
													<li
														key={q.code}
														className="flex flex-col gap-2 px-3 py-2 lg:flex-row lg:items-center lg:gap-4"
													>
														<span className="flex min-w-0 flex-1 flex-col">
															<Link
																href={stepHref(
																	"fragen",
																	`&ansicht=liste&kapitel=${q.sectionCode}#q-${q.code}`,
																)}
																className="min-w-0 truncate hover:underline"
															>
																<span
																	className="font-mono text-footnote"
																	translate="no"
																>
																	{q.code}
																</span>{" "}
																{q.text}
															</Link>
															<span className="text-muted-foreground text-footnote">
																{row?.answeredBy === "supplier"
																	? t("supplierAnswer")
																	: t("selfAnswer")}
																:{" "}
																{row?.answer ? t(`answer_${row.answer}`) : "—"}{" "}
																· {t("documents")}: {st?.evidenceCount ?? 0}
																{row?.comment ? ` · ${row.comment}` : ""}
															</span>
														</span>
														<Badge
															variant={VERDICT_TONE[verdict]}
															className="w-fit"
														>
															{t(`verdict_${verdict}`)}
														</Badge>
														{canReview && (
															<ReviewCell
																assessmentId={a.id}
																questionCode={q.code}
																verdict={row?.reviewerVerdict ?? null}
																reviewerAnswer={row?.reviewerAnswer ?? null}
															/>
														)}
													</li>
												);
											})}
									</ul>
								</section>
							))}
						</div>
					</details>
				</div>
			)}
		</div>
	);
}

export default withMessages(AssessmentPage, [
	"Approvals",
	"Assessment",
	"Common",
	"Dlp",
	"Evidence",
	"Relations",
	"Suppliers",
]);
