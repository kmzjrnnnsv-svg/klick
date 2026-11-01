"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState, useTransition } from "react";
import { createRiskGuided, reassessRisk } from "@/app/actions/risks";
import { useGateFeedback } from "@/components/approvals/use-gate-feedback";
import { LevelChoice } from "@/components/entity/level-choice";
import type { MemberOption } from "@/components/entity/owner-assignee";
import { useResponsibleOptions } from "@/components/entity/responsible-context";
import {
	ResponsibleLabel,
	ResponsibleSelect,
} from "@/components/entity/responsible-select";
import { MethodMatrix, ZONE_CELL } from "@/components/risks/method-matrix";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, nativeSelectClass } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { RISK_CATEGORIES } from "@/db/schema/enums";
import type { RiskMethod } from "@/db/schema/platform";
import {
	PROTECTION_GOALS,
	type ProtectionGoal,
	type RiskCategory,
	type RiskScenario,
	SCENARIO_GROUPS,
} from "@/lib/compliance/catalog/risk-scenarios";
import { assessRisk } from "@/lib/compliance/risk";
import {
	damageFrom,
	decisiveDimensions,
	pointLabel,
	ZONE_TONE,
} from "@/lib/compliance/risk-method";
import { cn } from "@/lib/utils";
import { functionOfRef } from "@/lib/validation/responsible-ref";

export type WizardScenario = Pick<
	RiskScenario,
	| "code"
	| "group"
	| "title"
	| "impactHint"
	| "category"
	| "protectionGoals"
	| "dimensions"
	| "controls"
	| "bsiRef"
> & { applicable: boolean };

type Treatment = "mitigate" | "accept" | "transfer" | "avoid";
type Measure = {
	key: number;
	title: string;
	ownerUserId: string;
	dueAt: string;
	costEur: string;
};

export type RiskDraft = {
	scenarioCode: string | null;
	title: string;
	category: RiskCategory;
	impactDescription: string;
	existingMeasures: string;
	protectionGoals: ProtectionGoal[];
	controlCodes: string[];
	assetIds: string[];
	processIds: string[];
	providerId: string;
	impactDetail: Record<string, number>;
	likelihood: number | null;
	treatment: Treatment;
	treatmentNote: string;
	measures: Measure[];
	residualLikelihood: number | null;
	residualImpact: number | null;
	residualNote: string;
	ownerUserId: string;
	reviewAt: string;
	// Herkunft (B1), nur beim Anlegen
	source?: { kind: string; id: string; label: string; href: string } | null;
};

const STEPS = [
	"scenario",
	"context",
	"damage",
	"likelihood",
	"result",
	"treatment",
	"summary",
] as const;
type Step = (typeof STEPS)[number];
const TREATMENTS: Treatment[] = ["mitigate", "transfer", "avoid", "accept"];
const selectCls = nativeSelectClass;

export function RiskWizard({
	mode,
	riskId,
	riskCode,
	method,
	scenarios,
	controls,
	processes,
	assets,
	providers,
	members,
	initial,
}: {
	mode: "create" | "reassess";
	riskId?: string;
	riskCode?: string;
	method: RiskMethod;
	scenarios: WizardScenario[];
	controls: { code: string; title: string; status: string | null }[];
	processes: { id: string; code: string; name: string }[];
	assets: { id: string; name: string }[];
	providers: { id: string; name: string }[];
	members: MemberOption[];
	initial: RiskDraft;
}) {
	const t = useTranslations("RiskWizard");
	const tr = useTranslations("Risks");
	const ts = useTranslations("Status");
	const functions = useResponsibleOptions();
	const gate = useGateFeedback();
	const router = useRouter();
	const [pending, start] = useTransition();
	const steps: Step[] =
		mode === "reassess" ? STEPS.filter((s) => s !== "scenario") : [...STEPS];
	const [step, setStep] = useState<Step>(steps[0] ?? "scenario");
	const [d, setD] = useState<RiskDraft>(initial);
	const [query, setQuery] = useState("");
	const [showAll, setShowAll] = useState(false);
	const [group, setGroup] = useState<string>("all");
	const [ctrlQuery, setCtrlQuery] = useState("");
	const [errors, setErrors] = useState<Record<string, string>>({});
	// Warnung beim Verlassen mit ungespeicherten Eingaben
	const dirty = JSON.stringify(d) !== JSON.stringify(initial);
	useEffect(() => {
		if (!dirty || pending) return;
		const warn = (e: BeforeUnloadEvent) => e.preventDefault();
		window.addEventListener("beforeunload", warn);
		return () => window.removeEventListener("beforeunload", warn);
	}, [dirty, pending]);
	const set = <K extends keyof RiskDraft>(k: K, v: RiskDraft[K]) =>
		setD((x) => ({ ...x, [k]: v }));

	const scenario = scenarios.find((s) => s.code === d.scenarioCode) ?? null;
	const ctrlByCode = useMemo(
		() => new Map(controls.map((c) => [c.code, c])),
		[controls],
	);
	const activeDims = method.dimensions.filter((x) => x.enabled);
	const typical = new Set(scenario?.dimensions ?? []);
	const firstDims = activeDims.filter(
		(x) => typical.has(x.key) || x.key in d.impactDetail,
	);
	const moreDims = activeDims.filter((x) => !firstDims.includes(x));
	const impact = damageFrom(d.impactDetail, method);
	const decisive = decisiveDimensions(d.impactDetail, method);
	const assessed =
		impact !== null && d.likelihood !== null
			? assessRisk(
					{
						id: "x",
						likelihood: d.likelihood,
						impact,
						residualLikelihood: d.residualLikelihood,
						residualImpact: d.residualImpact,
					},
					method,
				)
			: null;
	const idx = steps.indexOf(step);

	function validate(s: Step): Record<string, string> {
		const e: Record<string, string> = {};
		if (s === "scenario" && !d.title.trim()) e.title = t("errTitle");
		if (s === "damage" && impact === null) e.damage = t("errDamage");
		if (s === "likelihood" && d.likelihood === null)
			e.likelihood = t("errLikelihood");
		if (s === "treatment") {
			if (
				d.treatment === "accept" &&
				assessed &&
				assessed.effective.zone !== "acceptable" &&
				d.treatmentNote.trim().length < 10
			)
				e.treatmentNote = t("errAcceptNote");
			if (d.measures.some((m) => !m.title.trim()))
				e.measures = t("errMeasureTitle");
			if ((d.residualLikelihood === null) !== (d.residualImpact === null))
				e.residual = t("errResidual");
		}
		return e;
	}
	function go(to: Step) {
		const target = steps.indexOf(to);
		if (target > idx) {
			for (const s of steps.slice(0, target)) {
				const e = validate(s);
				if (Object.keys(e).length > 0) {
					setErrors(e);
					setStep(s);
					return;
				}
			}
		}
		setErrors({});
		setStep(to);
		if (typeof window !== "undefined")
			window.scrollTo({
				top: 0,
				behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
					? "auto"
					: "smooth",
			});
	}

	function pickScenario(s: WizardScenario | null) {
		if (!s) {
			setD((x) => ({ ...x, scenarioCode: null }));
			return;
		}
		setD((x) => ({
			...x,
			scenarioCode: s.code,
			title: s.title,
			category: s.category,
			impactDescription: x.impactDescription.trim()
				? x.impactDescription
				: s.impactHint,
			protectionGoals: [...s.protectionGoals],
			controlCodes: [...new Set([...x.controlCodes, ...s.controls])],
		}));
	}

	function submit() {
		for (const s of steps) {
			const e = validate(s);
			if (Object.keys(e).length > 0) {
				setErrors(e);
				setStep(s);
				return;
			}
		}
		start(async () => {
			const payload = {
				riskId,
				scenarioCode: d.scenarioCode,
				title: d.title,
				category: d.category,
				impactDescription: d.impactDescription,
				existingMeasures: d.existingMeasures,
				protectionGoals: d.protectionGoals,
				controlCodes: d.controlCodes,
				assetIds: d.assetIds,
				processIds: d.processIds,
				providerId: d.providerId || null,
				sourceEntityType: d.source?.kind ?? null,
				sourceEntityId: d.source?.id ?? null,
				impactDetail: d.impactDetail,
				likelihood: d.likelihood,
				treatment: d.treatment,
				treatmentNote: d.treatmentNote,
				// Akzeptieren: keine Maßnahmen, Restrisiko = Ausgangsrisiko
				measures:
					d.treatment === "accept"
						? []
						: d.measures.map((m) => ({
								title: m.title,
								ownerUserId: m.ownerUserId || null,
								dueAt: m.dueAt || null,
								costEur: m.costEur ? Number(m.costEur) : null,
							})),
				residualLikelihood:
					d.treatment === "accept" ? null : d.residualLikelihood,
				residualImpact: d.treatment === "accept" ? null : d.residualImpact,
				residualNote: d.residualNote,
				ownerUserId: d.ownerUserId || null,
				reviewAt: d.reviewAt || null,
			};
			const res =
				mode === "reassess"
					? await reassessRisk(payload)
					: await createRiskGuided(payload);
			if (!res.ok) {
				const fe = res.fieldErrors ?? {};
				const mapped: Record<string, string> = {};
				for (const [k, v] of Object.entries(fe))
					mapped[k.split(".")[0] ?? k] = v.join(" ");
				setErrors(mapped);
				toast.error(
					Object.values(mapped)[0] ??
						gate.errorText(res.error) ??
						(res.error || t("errSave")),
				);
				if (mapped.treatmentNote || mapped.measures) setStep("treatment");
				else if (mapped.impactDetail) setStep("damage");
				return;
			}
			const { id, code, acceptance, acceptanceError, intakePending } = res.data;
			toast.success(
				mode === "reassess"
					? t("savedReassess", { code })
					: t("saved", { code }),
			);
			if (intakePending) toast.info(gate.pendingText());
			if (acceptance === "pending") toast.info(t("acceptPending"));
			if (acceptance === "failed")
				toast.warning(
					t("acceptFailed", {
						error:
							acceptanceError === "no_approver" ||
							acceptanceError === "solo_reason_required" ||
							acceptanceError === "solo_not_allowed" ||
							acceptanceError === "workflow_disabled"
								? ts(`approvalError_${acceptanceError}`)
								: (acceptanceError ?? ""),
					}),
					{ duration: 12000 },
				);
			router.push(`/risiken/${id}`);
		});
	}

	const zoneText = (zone: string) =>
		t(`zoneMeans_${zone}` as "zoneMeans_acceptable");
	const err = (k: string) =>
		errors[k] ? (
			<p className="text-destructive text-footnote" role="alert">
				{errors[k]}
			</p>
		) : null;

	// ── Schritte ─────────────────────────────────────────────────────────
	const q = query.trim().toLowerCase();
	const visible = scenarios.filter(
		(s) =>
			(showAll || s.applicable) &&
			(!q ||
				`${s.bsiRef ?? ""} ${s.title} ${s.impactHint}`
					.toLowerCase()
					.includes(q)),
	);
	const hiddenCount = scenarios.filter((s) => !s.applicable).length;

	return (
		<div className="flex flex-col gap-6">
			{d.source && (
				<p className="rounded-xl bg-muted px-3 py-2 text-subhead">
					{t("fromSource")}{" "}
					<a href={d.source.href} className="text-primary hover:underline">
						{d.source.label}
					</a>
				</p>
			)}
			<nav aria-label={t("stepsLabel")}>
				<ol className="flex flex-wrap gap-1.5 text-footnote">
					{steps.map((s, i) => (
						<li key={s}>
							<button
								type="button"
								aria-current={s === step ? "step" : undefined}
								onClick={() => go(s)}
								className={cn(
									"inline-flex min-h-(--control-h-sm) items-center rounded-full px-3 transition-colors",
									s === step
										? "bg-primary-fill text-white"
										: i < idx
											? "bg-primary/12 text-foreground hover:bg-primary/20"
											: "bg-muted text-muted-foreground hover:bg-foreground/12",
								)}
							>
								{i + 1} · {t(`step_${s}`)}
							</button>
						</li>
					))}
				</ol>
			</nav>

			<section aria-labelledby="rw-h" className="flex flex-col gap-4">
				<header className="flex flex-col gap-1">
					<h2 id="rw-h" className="font-semibold text-title-3">
						{t(`q_${step}`)}
					</h2>
					<p className="text-muted-foreground text-subhead">
						{t(`lead_${step}`)}
					</p>
				</header>

				{step === "scenario" && (
					<div className="flex flex-col gap-4">
						<div className="flex flex-wrap items-end gap-3">
							<div className="flex min-w-60 flex-1 flex-col gap-1">
								<Label htmlFor="rw-q">{t("search")}</Label>
								<Input
									id="rw-q"
									type="search"
									value={query}
									onChange={(e) => setQuery(e.target.value)}
									placeholder={t("searchPlaceholder")}
									autoComplete="off"
								/>
							</div>
							{hiddenCount > 0 && (
								<label className="flex items-center gap-2 pb-2 text-subhead">
									<input
										type="checkbox"
										checked={showAll}
										onChange={(e) => setShowAll(e.target.checked)}
										className="accent-primary"
									/>
									{t("showAll", { n: hiddenCount })}
								</label>
							)}
						</div>
						<div className="grid grid-cols-1 gap-3 rounded-2xl bg-card p-3 sm:grid-cols-[1fr_16rem]">
							<div className="flex flex-col gap-1">
								<Label htmlFor="rw-title">{t("title")}</Label>
								<Input
									id="rw-title"
									value={d.title}
									maxLength={200}
									aria-invalid={Boolean(errors.title)}
									onChange={(e) => set("title", e.target.value)}
								/>
								{err("title")}
							</div>
							<div className="flex flex-col gap-1">
								<Label htmlFor="rw-cat">{tr("category")}</Label>
								<select
									id="rw-cat"
									className={selectCls}
									value={d.category}
									onChange={(e) =>
										set("category", e.target.value as RiskCategory)
									}
								>
									{RISK_CATEGORIES.map((c) => (
										<option key={c} value={c}>
											{tr(`category_${c}`)}
										</option>
									))}
								</select>
							</div>
						</div>
						<fieldset className="flex flex-wrap gap-1.5">
							<legend className="sr-only">{t("groupFilter")}</legend>
							{[{ key: "all", label: t("groupAll") }, ...SCENARIO_GROUPS]
								.filter(
									(g) =>
										g.key === "all" || visible.some((s) => s.group === g.key),
								)
								.map((g) => (
									<button
										key={g.key}
										type="button"
										aria-pressed={group === g.key}
										onClick={() => setGroup(g.key)}
										className={cn(
											"inline-flex min-h-(--control-h-sm) items-center rounded-full px-3 text-footnote transition-colors",
											group === g.key
												? "bg-primary-fill text-white"
												: "bg-muted text-muted-foreground hover:bg-foreground/12",
										)}
									>
										{g.label}
										{g.key !== "all" && (
											<span className="ml-1 tabular-nums">
												{visible.filter((s) => s.group === g.key).length}
											</span>
										)}
									</button>
								))}
						</fieldset>
						<button
							type="button"
							onClick={() => pickScenario(null)}
							aria-pressed={d.scenarioCode === null}
							className={cn(
								"rounded-2xl bg-card p-3 text-left text-subhead hover:border-foreground/40",
								d.scenarioCode === null && "border-primary bg-primary/5",
							)}
						>
							<span className="font-medium">{t("ownScenario")}</span>
							<span className="block text-muted-foreground text-footnote">
								{t("ownScenarioHint")}
							</span>
						</button>
						{SCENARIO_GROUPS.filter(
							(g) => group === "all" || g.key === group,
						).map((g) => {
							const list = visible.filter((s) => s.group === g.key);
							if (list.length === 0) return null;
							return (
								<div key={g.key} className="flex flex-col gap-2">
									<h3 className="font-medium text-footnote text-muted-foreground">
										{g.label}
									</h3>
									<div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
										{list.map((s) => (
											<button
												key={s.code}
												type="button"
												aria-pressed={d.scenarioCode === s.code}
												onClick={() => pickScenario(s)}
												className={cn(
													"flex flex-col gap-1 rounded-2xl bg-card p-3 text-left text-subhead transition-colors hover:border-foreground/40",
													d.scenarioCode === s.code &&
														"border-primary bg-primary/5",
												)}
											>
												<span className="font-medium">
													{s.bsiRef && (
														<span className="text-muted-foreground tabular-nums">
															{s.bsiRef}{" "}
														</span>
													)}
													{s.title}
												</span>
												<span className="line-clamp-2 text-muted-foreground text-footnote">
													{s.impactHint}
												</span>
											</button>
										))}
									</div>
								</div>
							);
						})}
						{visible.length === 0 && (
							<p className="text-muted-foreground text-subhead">
								{t("noScenario")}
							</p>
						)}
					</div>
				)}

				{step === "context" && (
					<div className="flex flex-col gap-5">
						{mode === "reassess" && (
							<div className="flex flex-col gap-1">
								<Label htmlFor="rw-title2">{t("title")}</Label>
								<Input
									id="rw-title2"
									value={d.title}
									maxLength={200}
									onChange={(e) => set("title", e.target.value)}
								/>
							</div>
						)}
						<div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
							<CheckList
								label={t("processes")}
								empty={t("noneYet")}
								items={processes.map((p) => ({
									id: p.id,
									label: `${p.code} · ${p.name}`,
								}))}
								value={d.processIds}
								onChange={(v) => set("processIds", v)}
							/>
							<CheckList
								label={t("assets")}
								empty={t("noneYet")}
								items={assets.map((a) => ({ id: a.id, label: a.name }))}
								value={d.assetIds}
								onChange={(v) => set("assetIds", v)}
							/>
							<div className="flex flex-col gap-1">
								<Label htmlFor="rw-prov">{t("provider")}</Label>
								<select
									id="rw-prov"
									className={selectCls}
									value={d.providerId}
									onChange={(e) => set("providerId", e.target.value)}
								>
									<option value="">{t("none")}</option>
									{providers.map((p) => (
										<option key={p.id} value={p.id}>
											{p.name}
										</option>
									))}
								</select>
							</div>
						</div>
						<div className="flex flex-col gap-1">
							<Label htmlFor="rw-impact">{t("impactDescription")}</Label>
							<p className="text-muted-foreground text-footnote">
								{t("impactDescriptionHint")}
							</p>
							<Textarea
								id="rw-impact"
								value={d.impactDescription}
								maxLength={20000}
								onChange={(e) => set("impactDescription", e.target.value)}
							/>
						</div>
						<fieldset className="flex flex-col gap-2">
							<legend className="mb-1 font-medium text-subhead">
								{t("protectionGoals")}
							</legend>
							<div className="flex flex-wrap gap-2">
								{PROTECTION_GOALS.map((g) => (
									<label
										key={g}
										className="flex min-h-(--control-h-sm) cursor-pointer items-center gap-2 rounded-full bg-muted px-3 text-subhead has-[:checked]:bg-primary/12 has-[:checked]:ring-1 has-[:checked]:ring-primary/50"
									>
										<input
											type="checkbox"
											className="accent-primary"
											checked={d.protectionGoals.includes(g)}
											onChange={(e) =>
												set(
													"protectionGoals",
													e.target.checked
														? [...d.protectionGoals, g]
														: d.protectionGoals.filter((x) => x !== g),
												)
											}
										/>
										{t(`goal_${g}`)}
									</label>
								))}
							</div>
						</fieldset>
						<div className="flex flex-col gap-1">
							<Label htmlFor="rw-existing">{t("existingMeasures")}</Label>
							<p className="text-muted-foreground text-footnote">
								{t("existingMeasuresHint")}
							</p>
							<Textarea
								id="rw-existing"
								value={d.existingMeasures}
								maxLength={20000}
								onChange={(e) => set("existingMeasures", e.target.value)}
							/>
						</div>
						<fieldset className="flex flex-col gap-2">
							<legend className="mb-1 font-medium text-subhead">
								{t("controls")}
							</legend>
							<p className="-mt-1 text-muted-foreground text-footnote">
								{t("controlsHint")}
							</p>
							<ul className="flex flex-col gap-1">
								{d.controlCodes.map((code) => {
									const c = ctrlByCode.get(code);
									return (
										<li
											key={code}
											className="flex items-center gap-2 rounded-xl bg-card px-2 py-1.5 text-subhead"
										>
											<span className="font-mono text-footnote" translate="no">
												{code}
											</span>
											<span className="min-w-0 flex-1 truncate">
												{c?.title ?? "—"}
											</span>
											<Badge
												variant={
													c?.status === "implemented" ? "success" : "muted"
												}
											>
												{c?.status
													? ts(
															{
																not_started: "notStarted",
																planned: "planned",
																in_progress: "inProgress",
																implemented: "implemented",
																not_applicable: "notApplicable",
															}[c.status] as "notStarted",
														)
													: ts("notStarted")}
											</Badge>
											<Button
												type="button"
												size="sm"
												variant="ghost"
												aria-label={t("removeControl", { code })}
												onClick={() =>
													set(
														"controlCodes",
														d.controlCodes.filter((x) => x !== code),
													)
												}
											>
												×
											</Button>
										</li>
									);
								})}
							</ul>
							<div className="flex flex-col gap-1">
								<Label htmlFor="rw-cq" className="text-footnote">
									{t("addControl")}
								</Label>
								<Input
									id="rw-cq"
									type="search"
									value={ctrlQuery}
									onChange={(e) => setCtrlQuery(e.target.value)}
									placeholder={t("addControlPlaceholder")}
									autoComplete="off"
								/>
								{ctrlQuery.trim().length >= 2 && (
									<ul className="max-h-48 overflow-y-auto rounded-2xl bg-card text-subhead">
										{controls
											.filter(
												(c) =>
													!d.controlCodes.includes(c.code) &&
													`${c.code} ${c.title}`
														.toLowerCase()
														.includes(ctrlQuery.trim().toLowerCase()),
											)
											.slice(0, 20)
											.map((c) => (
												<li key={c.code}>
													<button
														type="button"
														className="flex w-full gap-2 px-2 py-1.5 text-left hover:bg-muted"
														onClick={() => {
															set("controlCodes", [...d.controlCodes, c.code]);
															setCtrlQuery("");
														}}
													>
														<span
															className="font-mono text-footnote"
															translate="no"
														>
															{c.code}
														</span>
														<span className="truncate">{c.title}</span>
													</button>
												</li>
											))}
									</ul>
								)}
							</div>
						</fieldset>
					</div>
				)}

				{step === "damage" && (
					<div className="flex flex-col gap-5">
						{firstDims.map((dim) => (
							<DimChoice
								key={dim.key}
								dim={dim}
								method={method}
								value={d.impactDetail[dim.key]}
								onChange={(v) =>
									set("impactDetail", { ...d.impactDetail, [dim.key]: v })
								}
								onClear={() => {
									const { [dim.key]: _x, ...rest } = d.impactDetail;
									set("impactDetail", rest);
								}}
								clearLabel={t("notAffected")}
							/>
						))}
						{moreDims.length > 0 && (
							<details
								className="rounded-2xl bg-card p-3"
								open={firstDims.length === 0}
							>
								<summary className="cursor-pointer text-subhead">
									{t("moreDimensions", { n: moreDims.length })}
								</summary>
								<div className="mt-4 flex flex-col gap-5">
									{moreDims.map((dim) => (
										<DimChoice
											key={dim.key}
											dim={dim}
											method={method}
											value={d.impactDetail[dim.key]}
											onChange={(v) =>
												set("impactDetail", {
													...d.impactDetail,
													[dim.key]: v,
												})
											}
											onClear={() => {
												const { [dim.key]: _x, ...rest } = d.impactDetail;
												set("impactDetail", rest);
											}}
											clearLabel={t("notAffected")}
										/>
									))}
								</div>
							</details>
						)}
						<p
							className="rounded-xl bg-muted p-3 text-subhead"
							aria-live="polite"
						>
							{impact === null
								? t("damageNone")
								: t("damageResult", {
										level: impact,
										label: method.impact[impact - 1] ?? "",
										dims: decisive.map((x) => x.label).join(", "),
									})}
						</p>
						{err("damage")}
					</div>
				)}

				{step === "likelihood" && (
					<div className="flex flex-col gap-4">
						<LevelChoice
							name="likelihood"
							legend={t("likelihoodLegend")}
							hint={t("likelihoodHint")}
							options={method.likelihood.map((l, i) => ({
								value: i + 1,
								label: l.label,
								anchor: l.anchor,
							}))}
							value={d.likelihood}
							onChange={(v) => set("likelihood", v)}
						/>
						{err("likelihood")}
					</div>
				)}

				{step === "result" && assessed && impact !== null && (
					<div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_auto]">
						<div
							className={cn(
								"flex flex-col gap-3 rounded-2xl bg-card p-4",
								ZONE_CELL[assessed.inherent.zone],
							)}
						>
							<p className="text-subhead">
								{t("resultCalc", {
									l: d.likelihood ?? 0,
									i: impact,
									op: method.aggregation === "sum" ? "+" : "×",
									score: assessed.inherent.score,
								})}
							</p>
							<p className="font-semibold text-title-2">
								{t("resultClass", { label: assessed.inherent.cls.label })}
							</p>
							<Badge
								variant={ZONE_TONE[assessed.inherent.zone]}
								className="w-fit"
							>
								{tr(`zone_${assessed.inherent.zone}`)}
							</Badge>
							{assessed.inherent.cls.meaning && (
								<p className="text-subhead">{assessed.inherent.cls.meaning}</p>
							)}
							<p className="text-muted-foreground text-subhead">
								{zoneText(assessed.inherent.zone)}
							</p>
						</div>
						<MethodMatrix
							method={method}
							mark={{ likelihood: d.likelihood ?? 0, impact }}
						/>
					</div>
				)}

				{step === "treatment" && assessed && (
					<div className="flex flex-col gap-6">
						<fieldset className="flex flex-col gap-2">
							<legend className="mb-1 font-medium text-subhead">
								{t("treatmentLegend")}
							</legend>
							<div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
								{TREATMENTS.map((o) => (
									<label
										key={o}
										className="flex cursor-pointer flex-col gap-1 rounded-2xl bg-card p-3 text-subhead has-[:checked]:border-primary has-[:checked]:bg-primary/5 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring/50"
									>
										<span className="flex items-center gap-2 font-medium">
											<input
												type="radio"
												name="treatment"
												value={o}
												checked={d.treatment === o}
												onChange={() => set("treatment", o)}
												className="accent-primary"
											/>
											{tr(`treatment_${o}`)}
										</span>
										<span className="text-muted-foreground text-footnote">
											{t(`treatmentHint_${o}`)}
										</span>
									</label>
								))}
							</div>
							{d.treatment === "accept" && (
								<p className="rounded-xl bg-warning/12 p-2 text-subhead">
									{t(
										`acceptHint_${assessed.inherent.zone}` as "acceptHint_acceptable",
									)}
								</p>
							)}
						</fieldset>

						{d.treatment !== "accept" && (
							<div className="flex flex-col gap-2">
								<h3 className="font-medium text-subhead">{t("measures")}</h3>
								<p className="text-muted-foreground text-footnote">
									{t("measuresHint")}
								</p>
								<ul className="flex flex-col gap-2">
									{d.measures.map((m, i) => (
										<li
											key={m.key}
											className="grid grid-cols-1 gap-2 rounded-2xl bg-card p-2 md:grid-cols-[1fr_12rem_10rem_8rem_auto]"
										>
											<Input
												aria-label={t("measureTitle")}
												placeholder={t("measurePlaceholder")}
												value={m.title}
												maxLength={200}
												onChange={(e) =>
													set(
														"measures",
														d.measures.map((x, k) =>
															k === i ? { ...x, title: e.target.value } : x,
														),
													)
												}
											/>
											<select
												aria-label={t("measureOwner")}
												className={selectCls}
												value={m.ownerUserId}
												onChange={(e) =>
													set(
														"measures",
														d.measures.map((x, k) =>
															k === i
																? { ...x, ownerUserId: e.target.value }
																: x,
														),
													)
												}
											>
												<option value="">{t("riskOwner")}</option>
												{members.map((u) => (
													<option key={u.userId} value={u.userId}>
														{u.name || u.email}
													</option>
												))}
											</select>
											<Input
												type="date"
												aria-label={t("measureDue")}
												value={m.dueAt}
												onChange={(e) =>
													set(
														"measures",
														d.measures.map((x, k) =>
															k === i ? { ...x, dueAt: e.target.value } : x,
														),
													)
												}
											/>
											<Input
												type="number"
												inputMode="numeric"
												min={0}
												aria-label={t("measureCost")}
												placeholder={t("measureCostPlaceholder")}
												value={m.costEur}
												onChange={(e) =>
													set(
														"measures",
														d.measures.map((x, k) =>
															k === i ? { ...x, costEur: e.target.value } : x,
														),
													)
												}
											/>
											<Button
												type="button"
												variant="ghost"
												size="sm"
												onClick={() =>
													set(
														"measures",
														d.measures.filter((_, k) => k !== i),
													)
												}
											>
												{t("remove")}
											</Button>
										</li>
									))}
								</ul>
								{err("measures")}
								{d.measures.length < 20 && (
									<div>
										<Button
											type="button"
											variant="outline"
											size="sm"
											onClick={() =>
												set("measures", [
													...d.measures,
													{
														key: Date.now(),
														title: "",
														ownerUserId: "",
														dueAt: "",
														costEur: "",
													},
												])
											}
										>
											{t("addMeasure")}
										</Button>
									</div>
								)}
							</div>
						)}

						<div className="flex flex-col gap-1">
							<Label htmlFor="rw-tnote">
								{d.treatment === "accept"
									? t("acceptNote")
									: t("treatmentNote")}
							</Label>
							<Textarea
								id="rw-tnote"
								value={d.treatmentNote}
								maxLength={20000}
								aria-invalid={Boolean(errors.treatmentNote)}
								onChange={(e) => set("treatmentNote", e.target.value)}
							/>
							{err("treatmentNote")}
						</div>

						{d.treatment !== "accept" && (
							<div className="flex flex-col gap-3 rounded-2xl bg-card p-3">
								<h3 className="font-medium text-subhead">
									{t("residualTitle")}
								</h3>
								<p className="text-muted-foreground text-footnote">
									{t("residualHint")}
								</p>
								<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
									<div className="flex flex-col gap-1">
										<Label htmlFor="rw-rl">{t("residualLikelihood")}</Label>
										<select
											id="rw-rl"
											className={selectCls}
											value={d.residualLikelihood ?? ""}
											onChange={(e) =>
												set(
													"residualLikelihood",
													e.target.value ? Number(e.target.value) : null,
												)
											}
										>
											<option value="">{t("residualOpen")}</option>
											{method.likelihood.map((l, i) => (
												<option key={l.label} value={i + 1}>
													{i + 1} · {l.label}
												</option>
											))}
										</select>
									</div>
									<div className="flex flex-col gap-1">
										<Label htmlFor="rw-ri">{t("residualImpact")}</Label>
										<select
											id="rw-ri"
											className={selectCls}
											value={d.residualImpact ?? ""}
											onChange={(e) =>
												set(
													"residualImpact",
													e.target.value ? Number(e.target.value) : null,
												)
											}
										>
											<option value="">{t("residualOpen")}</option>
											{method.impact.map((l, i) => (
												<option key={l} value={i + 1}>
													{i + 1} · {l}
												</option>
											))}
										</select>
									</div>
								</div>
								{assessed.residual && (
									<p className="text-subhead" aria-live="polite">
										{t("residualResult", {
											score: assessed.residual.score,
											label: assessed.residual.cls.label,
										})}{" "}
										<Badge variant={ZONE_TONE[assessed.residual.zone]}>
											{tr(`zone_${assessed.residual.zone}`)}
										</Badge>
									</p>
								)}
								{err("residual")}
								<div className="flex flex-col gap-1">
									<Label htmlFor="rw-rnote">{t("residualNote")}</Label>
									<Textarea
										id="rw-rnote"
										className="min-h-16"
										value={d.residualNote}
										maxLength={20000}
										onChange={(e) => set("residualNote", e.target.value)}
									/>
								</div>
							</div>
						)}

						<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
							<div className="flex flex-col gap-1">
								<Label htmlFor="rw-owner">{t("owner")}</Label>
								<ResponsibleSelect
									id="rw-owner"
									value={d.ownerUserId || null}
									onChange={(v) => set("ownerUserId", v ?? "")}
									members={members.map((u) => ({
										userId: u.userId,
										name: u.name || u.email,
									}))}
									allowNone={false}
								/>
							</div>
							<div className="flex flex-col gap-1">
								<Label htmlFor="rw-review">{t("reviewAt")}</Label>
								<Input
									id="rw-review"
									type="date"
									value={d.reviewAt}
									onChange={(e) => set("reviewAt", e.target.value)}
								/>
							</div>
						</div>
					</div>
				)}

				{step === "summary" && assessed && impact !== null && (
					<dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-subhead sm:grid-cols-[14rem_1fr]">
						<dt className="text-muted-foreground">{t("title")}</dt>
						<dd className="font-medium">
							{riskCode ? `${riskCode} · ` : ""}
							{d.title}
						</dd>
						<dt className="text-muted-foreground">{tr("category")}</dt>
						<dd>{tr(`category_${d.category}`)}</dd>
						{d.impactDescription && (
							<>
								<dt className="text-muted-foreground">
									{t("impactDescription")}
								</dt>
								<dd className="whitespace-pre-line">{d.impactDescription}</dd>
							</>
						)}
						<dt className="text-muted-foreground">{t("protectionGoals")}</dt>
						<dd>
							{d.protectionGoals.map((g) => t(`goal_${g}`)).join(", ") || "—"}
						</dd>
						<dt className="text-muted-foreground">{t("damageSummary")}</dt>
						<dd>
							<ul className="flex flex-col gap-0.5">
								{activeDims
									.filter((x) => x.key in d.impactDetail)
									.map((x) => (
										<li key={x.key}>
											{x.label}: {d.impactDetail[x.key]} ·{" "}
											{method.impact[(d.impactDetail[x.key] ?? 1) - 1]}
										</li>
									))}
							</ul>
						</dd>
						<dt className="text-muted-foreground">{t("riskBefore")}</dt>
						<dd>
							<Badge variant={ZONE_TONE[assessed.inherent.zone]}>
								{pointLabel(assessed.inherent, method)}
							</Badge>{" "}
							({t("l")} {d.likelihood} · {t("i")} {impact})
						</dd>
						<dt className="text-muted-foreground">{t("treatmentLegend")}</dt>
						<dd>
							{tr(`treatment_${d.treatment}`)}
							{d.measures.length > 0 &&
								` · ${t("measuresCount", { n: d.measures.length })}`}
						</dd>
						{assessed.residual && (
							<>
								<dt className="text-muted-foreground">{t("riskAfter")}</dt>
								<dd>
									<Badge variant={ZONE_TONE[assessed.residual.zone]}>
										{pointLabel(assessed.residual, method)}
									</Badge>
								</dd>
							</>
						)}
						<dt className="text-muted-foreground">{t("controls")}</dt>
						<dd className="font-mono text-footnote" translate="no">
							{d.controlCodes.join(", ") || "—"}
						</dd>
						<dt className="text-muted-foreground">{t("owner")}</dt>
						<dd>
							{(() => {
								const fn = functionOfRef(d.ownerUserId);
								const holder = fn
									? (functions.find((f) => f.function === fn)?.holder ?? null)
									: null;
								const m = members.find((x) => x.userId === d.ownerUserId);
								return (
									<ResponsibleLabel
										ownerFunction={fn}
										ownerName={fn ? holder : m ? m.name || m.email : null}
									/>
								);
							})()}
						</dd>
					</dl>
				)}
			</section>

			<footer className="sticky bottom-(--bar-offset) flex items-center justify-between gap-3 border-t material-bar py-3">
				<Button
					type="button"
					variant="ghost"
					disabled={idx === 0 || pending}
					onClick={() => go(steps[idx - 1] ?? step)}
				>
					{t("back")}
				</Button>
				{step === "summary" ? (
					<Button type="button" onClick={submit} disabled={pending}>
						{mode === "reassess" ? t("submitReassess") : t("submit")}
					</Button>
				) : (
					<Button
						type="button"
						onClick={() => go(steps[idx + 1] ?? step)}
						disabled={pending}
					>
						{t("next")}
					</Button>
				)}
			</footer>
		</div>
	);
}

function DimChoice({
	dim,
	method,
	value,
	onChange,
	onClear,
	clearLabel,
}: {
	dim: RiskMethod["dimensions"][number];
	method: RiskMethod;
	value: number | undefined;
	onChange: (v: number) => void;
	onClear: () => void;
	clearLabel: string;
}) {
	return (
		<div className="flex flex-col gap-1">
			<LevelChoice
				name={`dim-${dim.key}`}
				legend={dim.label}
				options={method.impact.map((label, i) => ({
					value: i + 1,
					label,
					anchor: dim.anchors[i] || undefined,
				}))}
				value={value}
				onChange={onChange}
			/>
			{value !== undefined && (
				<button
					type="button"
					onClick={onClear}
					className="w-fit text-muted-foreground text-footnote underline-offset-4 hover:underline"
				>
					{clearLabel}
				</button>
			)}
		</div>
	);
}

function CheckList({
	label,
	empty,
	items,
	value,
	onChange,
}: {
	label: string;
	empty: string;
	items: { id: string; label: string }[];
	value: string[];
	onChange: (v: string[]) => void;
}) {
	return (
		<fieldset className="flex flex-col gap-1">
			<legend className="mb-1 font-medium text-subhead">{label}</legend>
			{items.length === 0 ? (
				<p className="text-muted-foreground text-footnote">{empty}</p>
			) : (
				<ul className="max-h-44 overflow-y-auto rounded-2xl bg-card p-1 text-subhead">
					{items.map((it) => (
						<li key={it.id}>
							<label className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 hover:bg-muted">
								<input
									type="checkbox"
									className="accent-primary"
									checked={value.includes(it.id)}
									onChange={(e) =>
										onChange(
											e.target.checked
												? [...value, it.id]
												: value.filter((x) => x !== it.id),
										)
									}
								/>
								<span className="truncate">{it.label}</span>
							</label>
						</li>
					))}
				</ul>
			)}
		</fieldset>
	);
}
