"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState, useTransition } from "react";
import { updateRiskMethod } from "@/app/actions/settings";
import { withStepUp } from "@/components/auth/step-up-dialog";
import { MethodMatrix, ZONE_CELL } from "@/components/risks/method-matrix";
import { Button } from "@/components/ui/button";
import { errorText } from "@/components/ui/error-text";
import { FormAlert } from "@/components/ui/form-alert";
import { Input, nativeSelectClass } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import type {
	RiskAcceptanceStep,
	RiskClass,
	RiskDimension,
	RiskMethod,
	RiskZone,
} from "@/db/schema/platform";
import {
	defaultMatrix,
	levelCount,
	methodChangePreview,
	RISK_METHOD_PRESETS,
	type RiskMethodPreset,
	rescaleClasses,
	scoreRange,
	validateRiskMethod,
} from "@/lib/compliance/risk-method";
import { cn } from "@/lib/utils";
import { RISK_METHOD_ISSUE_TEXT } from "@/lib/validation/risk-method";

type RiskPoint = {
	likelihood: number;
	impact: number;
	residualLikelihood: number | null;
	residualImpact: number | null;
};

const ZONES: RiskZone[] = ["acceptable", "tolerable", "unacceptable"];
const AGGREGATIONS = ["sum", "product", "matrix"] as const;

// Wer gibt eine Akzeptanz frei (B4): „legacy“ = wie bisher nur über dem
// Appetit (Workflow risk_acceptance), sonst feste Stufen je Klasse.
const ACCEPTANCE_OPTIONS = {
	legacy: null,
	owner: [],
	department: ["department_head"],
	management: ["management_body"],
	both: ["department_head", "management_body"],
} as const satisfies Record<string, readonly RiskAcceptanceStep[] | null>;
type AcceptanceOption = keyof typeof ACCEPTANCE_OPTIONS;

function acceptanceValue(a: RiskClass["acceptance"]): AcceptanceOption {
	if (!a) return "legacy";
	if (a.length === 0) return "owner";
	if (a.length === 2) return "both";
	return a[0] === "management_body" ? "management" : "department";
}

function clone(m: RiskMethod): RiskMethod {
	return JSON.parse(JSON.stringify(m)) as RiskMethod;
}

// Klassen-„von“ ergibt sich aus der Vorgängerklasse; die letzte endet am
// Maximum des Rechenwegs. So bleiben die Klassen lückenlos. Bei der Matrix
// ist jede Klasse genau eine Stufe (Reihenfolge = Rang).
function normalizeClasses(classes: RiskClass[], m: RiskMethod): RiskClass[] {
	if (m.aggregation === "matrix")
		return classes.map((c, i) => ({ ...c, min: i + 1, max: i + 1 }));
	const range = scoreRange({ ...m, classes });
	return classes.map((c, i) => {
		const min = i === 0 ? range.min : (classes[i - 1]?.max ?? range.min) + 1;
		const max = i === classes.length - 1 ? range.max : c.max;
		return { ...c, min, max };
	});
}

// Felder der Matrix, deren Klasse es nicht mehr gibt, bekommen die letzte
// Klasse (die strengste); so bleibt die Matrix vollständig.
function repairMatrix(
	matrix: string[][] | undefined,
	classes: readonly RiskClass[],
	levels: number,
): string[][] {
	const keys = new Set(classes.map((c) => c.key));
	const fallback = classes.at(-1)?.key ?? "";
	const base =
		matrix && matrix.length === levels
			? matrix
			: defaultMatrix(levels, classes);
	return base.map((row) => row.map((k) => (keys.has(k) ? k : fallback)));
}

export function RiskMethodPanel({
	method,
	stored,
	template,
	presets,
	risks,
	allowSelfApproval,
	canEdit,
}: {
	method: RiskMethod;
	stored: boolean;
	template: RiskMethod;
	// Vorlagen mit den Schadensarten der aktiven Rahmenwerke
	presets: Record<RiskMethodPreset, RiskMethod>;
	risks: RiskPoint[];
	allowSelfApproval: boolean;
	canEdit: boolean;
}) {
	const t = useTranslations("RiskMethod");
	const ta = useTranslations("Approvals");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [pending, start] = useTransition();
	const [formError, setFormError] = useState<string | null>(null);
	const [draft, setDraft] = useState<RiskMethod>(() => clone(method));
	const [solo, setSolo] = useState(allowSelfApproval);
	const range = scoreRange(draft);
	const issues = validateRiskMethod(draft);
	const n = levelCount(draft);
	const LEVELS = Array.from({ length: n }, (_, k) => k + 1);
	const isMatrix = draft.aggregation === "matrix";
	const levelsChanged = levelCount(method) !== n;
	// Schadensarten der Vorlage mit gleicher Stufenzahl
	const dimTemplate = n === 4 ? presets["bsi-200-3"] : template;
	const preview = useMemo(
		() => methodChangePreview(risks, method, draft),
		[risks, method, draft],
	);
	const dirty = JSON.stringify(draft) !== JSON.stringify(method) || !stored;
	const changed = JSON.stringify(draft) !== JSON.stringify(method);
	useEffect(() => {
		if (!changed || pending || !canEdit) return;
		const warn = (e: BeforeUnloadEvent) => e.preventDefault();
		window.addEventListener("beforeunload", warn);
		return () => window.removeEventListener("beforeunload", warn);
	}, [changed, pending, canEdit]);

	const setClasses = (classes: RiskClass[]) =>
		setDraft((d) => {
			const next = normalizeClasses(classes, d);
			return d.aggregation === "matrix"
				? {
						...d,
						classes: next,
						matrix: repairMatrix(d.matrix, next, levelCount(d)),
					}
				: { ...d, classes: next };
		});
	const setDim = (idx: number, patch: Partial<RiskDimension>) =>
		setDraft((d) => ({
			...d,
			dimensions: d.dimensions.map((x, k) =>
				k === idx ? { ...x, ...patch } : x,
			),
		}));
	const templateKeys = new Set(dimTemplate.dimensions.map((d) => d.key));

	const save = () =>
		start(async () => {
			setFormError(null);
			const res = await withStepUp(() =>
				updateRiskMethod({ method: draft, allowSelfApproval: solo }),
			);
			if (!res.ok)
				setFormError(
					res.error === "step_up_required"
						? t("stepUp")
						: res.fieldErrors
							? [...new Set(Object.values(res.fieldErrors).flat())].join(" ")
							: errorText(tc, res),
				);
			else {
				toast.success(t("saved"));
				router.refresh();
			}
		});

	return (
		<form
			className="flex flex-col gap-8 text-subhead"
			onSubmit={(e) => {
				e.preventDefault();
				save();
			}}
		>
			<div className="flex flex-col gap-2">
				<p className="text-muted-foreground">{t("lead")}</p>
				{!stored && (
					<div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-warning/12 p-3">
						<p>{t("legacyHint")}</p>
						{canEdit && (
							<Button
								type="button"
								size="sm"
								variant="outline"
								onClick={() => setDraft(clone(template))}
							>
								{t("loadTemplate")}
							</Button>
						)}
					</div>
				)}
			</div>

			{/* Vorlage */}
			{canEdit && (
				<section className="flex flex-col gap-3" aria-labelledby="rm-preset">
					<h3 id="rm-preset" className="font-medium">
						{t("presetTitle")}
					</h3>
					<p className="text-muted-foreground text-footnote">
						{t("presetLead")}
					</p>
					<div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
						{RISK_METHOD_PRESETS.map((p) => (
							<button
								key={p.key}
								type="button"
								className="flex flex-col gap-1 rounded-2xl bg-card p-3 text-left transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring/50"
								onClick={() => setDraft(clone(presets[p.key]))}
							>
								<span className="font-medium">{p.label}</span>
								<span className="text-muted-foreground text-footnote">
									{p.hint}
								</span>
							</button>
						))}
					</div>
				</section>
			)}

			{/* 1 · Rechenweg */}
			<section className="flex flex-col gap-3" aria-labelledby="rm-agg">
				<h3 id="rm-agg" className="font-medium">
					1 · {t("aggregationTitle")}
				</h3>
				<div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[1fr_auto]">
					<fieldset className="grid grid-cols-1 gap-2 sm:grid-cols-3">
						<legend className="sr-only">{t("aggregationTitle")}</legend>
						{AGGREGATIONS.map((agg) => (
							<label
								key={agg}
								className={cn(
									"flex cursor-pointer flex-col gap-1 rounded-2xl bg-card p-3 has-[:checked]:border-primary has-[:checked]:bg-primary/5 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring/50",
									!canEdit && "cursor-default opacity-80",
								)}
							>
								<span className="flex items-center gap-2 font-medium">
									<input
										type="radio"
										name="aggregation"
										value={agg}
										checked={draft.aggregation === agg}
										disabled={!canEdit}
										onChange={() =>
											setDraft((d) => {
												const to = { ...d, aggregation: agg };
												const classes = rescaleClasses(d.classes, d, to);
												return agg === "matrix"
													? {
															...to,
															classes,
															matrix: repairMatrix(
																d.matrix,
																classes,
																levelCount(d),
															),
														}
													: { ...to, classes, matrix: undefined };
											})
										}
									/>
									{t(`agg_${agg}`)}
								</span>
								<span className="text-muted-foreground text-footnote">
									{t(`agg_${agg}_hint`)}
								</span>
							</label>
						))}
					</fieldset>
					<MethodMatrix method={draft} />
				</div>
			</section>

			{/* 2 · Eintrittswahrscheinlichkeit */}
			<section className="flex flex-col gap-3" aria-labelledby="rm-ew">
				<h3 id="rm-ew" className="font-medium">
					2 · {t("likelihoodTitle")}
				</h3>
				<p className="text-muted-foreground text-footnote">
					{t("likelihoodLead")}
				</p>
				<ol className="flex flex-col gap-3">
					{LEVELS.map((level) => {
						const row = draft.likelihood[level - 1];
						return (
							<li
								key={level}
								className="grid grid-cols-1 gap-2 sm:grid-cols-[2rem_12rem_1fr]"
							>
								<span className="pt-2 text-muted-foreground tabular-nums">
									{level}
								</span>
								<Input
									aria-label={t("levelLabel", { level })}
									value={row?.label ?? ""}
									maxLength={40}
									disabled={!canEdit}
									onChange={(e) =>
										setDraft((d) => ({
											...d,
											likelihood: d.likelihood.map((x, k) =>
												k === level - 1 ? { ...x, label: e.target.value } : x,
											) as RiskMethod["likelihood"],
										}))
									}
								/>
								<Textarea
									aria-label={t("levelAnchor", { level })}
									className="min-h-14"
									value={row?.anchor ?? ""}
									maxLength={600}
									disabled={!canEdit}
									onChange={(e) =>
										setDraft((d) => ({
											...d,
											likelihood: d.likelihood.map((x, k) =>
												k === level - 1 ? { ...x, anchor: e.target.value } : x,
											) as RiskMethod["likelihood"],
										}))
									}
								/>
							</li>
						);
					})}
				</ol>
			</section>

			{/* 3 · Schadenshöhe + Schadensarten */}
			<section className="flex flex-col gap-3" aria-labelledby="rm-sh">
				<h3 id="rm-sh" className="font-medium">
					3 · {t("impactTitle")}
				</h3>
				<p className="text-muted-foreground text-footnote">{t("impactLead")}</p>
				<div
					className={cn(
						"grid grid-cols-1 gap-2",
						n === 4 ? "sm:grid-cols-4" : "sm:grid-cols-5",
					)}
				>
					{LEVELS.map((level) => (
						<div key={level} className="flex flex-col gap-1">
							<Label
								htmlFor={`rm-imp-${level}`}
								className="text-muted-foreground text-footnote"
							>
								{t("level", { level })}
							</Label>
							<Input
								id={`rm-imp-${level}`}
								value={draft.impact[level - 1] ?? ""}
								maxLength={40}
								disabled={!canEdit}
								onChange={(e) =>
									setDraft((d) => ({
										...d,
										impact: d.impact.map((x, k) =>
											k === level - 1 ? e.target.value : x,
										),
									}))
								}
							/>
						</div>
					))}
				</div>
				<ul className="flex flex-col gap-2">
					{draft.dimensions.map((dim, idx) => (
						<li key={dim.key} className="rounded-xl bg-muted/50">
							<details>
								<summary className="flex cursor-pointer items-center gap-3 px-3 py-2">
									<span
										className={cn(
											"flex-1 font-medium",
											!dim.enabled && "text-muted-foreground line-through",
										)}
									>
										{dim.label || t("dimensionUnnamed")}
									</span>
									<span className="text-muted-foreground text-footnote">
										{dim.enabled ? t("active") : t("inactive")}
									</span>
								</summary>
								<div className="flex flex-col gap-3 border-t p-3">
									<div className="flex flex-wrap items-end gap-3">
										<div className="flex min-w-60 flex-1 flex-col gap-1">
											<Label htmlFor={`rm-dim-${dim.key}`}>
												{t("dimensionName")}
											</Label>
											<Input
												id={`rm-dim-${dim.key}`}
												value={dim.label}
												maxLength={80}
												disabled={!canEdit}
												onChange={(e) => setDim(idx, { label: e.target.value })}
											/>
										</div>
										<label className="flex items-center gap-2 pb-2">
											<Switch
												checked={dim.enabled}
												disabled={!canEdit}
												onCheckedChange={(v) => setDim(idx, { enabled: v })}
											/>
											{t("dimensionEnabled")}
										</label>
										{canEdit && !templateKeys.has(dim.key) && (
											<Button
												type="button"
												size="sm"
												variant="ghost"
												onClick={() =>
													setDraft((d) => ({
														...d,
														dimensions: d.dimensions.filter(
															(_, k) => k !== idx,
														),
													}))
												}
											>
												{t("remove")}
											</Button>
										)}
									</div>
									<ol className="flex flex-col gap-2">
										{LEVELS.map((level) => (
											<li
												key={level}
												className="grid grid-cols-1 gap-2 sm:grid-cols-[8rem_1fr]"
											>
												<span className="pt-2 text-muted-foreground text-footnote">
													{level} · {draft.impact[level - 1]}
												</span>
												<Textarea
													aria-label={`${dim.label} – ${t("level", { level })}`}
													className="min-h-12"
													value={dim.anchors[level - 1] ?? ""}
													maxLength={600}
													disabled={!canEdit}
													onChange={(e) =>
														setDim(idx, {
															anchors: dim.anchors.map((x, k) =>
																k === level - 1 ? e.target.value : x,
															),
														})
													}
												/>
											</li>
										))}
									</ol>
								</div>
							</details>
						</li>
					))}
				</ul>
				<div className="flex flex-wrap gap-2">
					{canEdit && draft.dimensions.length < 15 && (
						<Button
							type="button"
							size="sm"
							variant="outline"
							onClick={() =>
								setDraft((d) => {
									let n = 1;
									while (d.dimensions.some((x) => x.key === `eigene${n}`)) n++;
									return {
										...d,
										dimensions: [
											...d.dimensions,
											{
												key: `eigene${n}`,
												label: t("dimensionNew"),
												enabled: true,
												anchors: Array.from(
													{ length: levelCount(d) },
													() => "",
												),
											},
										],
									};
								})
							}
						>
							{t("addDimension")}
						</Button>
					)}
					{canEdit &&
						dimTemplate.dimensions
							.filter((x) => !draft.dimensions.some((d) => d.key === x.key))
							.map((x) => (
								<Button
									key={x.key}
									type="button"
									size="sm"
									variant="ghost"
									onClick={() =>
										setDraft((d) => ({
											...d,
											dimensions: [...d.dimensions, { ...x }],
										}))
									}
								>
									+ {x.label}
								</Button>
							))}
				</div>
			</section>

			{/* 4 · Risikoklassen */}
			<section className="flex flex-col gap-3" aria-labelledby="rm-rk">
				<h3 id="rm-rk" className="font-medium">
					4 · {t("classesTitle")}
				</h3>
				<p className="text-muted-foreground text-footnote">
					{isMatrix
						? t("classesLeadMatrix")
						: t("classesLead", { min: range.min, max: range.max })}
				</p>
				<ol className="flex flex-col gap-3">
					{draft.classes.map((c, idx) => {
						const last = idx === draft.classes.length - 1;
						return (
							<li
								key={c.key}
								className={cn(
									"grid grid-cols-1 gap-3 rounded-2xl bg-card p-3 sm:grid-cols-2 2xl:grid-cols-[10rem_9rem_12rem_minmax(0,1fr)_auto]",
									ZONE_CELL[c.zone],
								)}
							>
								<div className="flex flex-col gap-1">
									<Label htmlFor={`rm-cl-${c.key}`} className="text-footnote">
										{t("className")}
									</Label>
									<Input
										id={`rm-cl-${c.key}`}
										value={c.label}
										maxLength={40}
										disabled={!canEdit}
										onChange={(e) =>
											setClasses(
												draft.classes.map((x, k) =>
													k === idx ? { ...x, label: e.target.value } : x,
												),
											)
										}
									/>
								</div>
								{isMatrix ? (
									<div className="flex flex-col gap-1">
										<span className="font-medium text-footnote">
											{t("classRank")}
										</span>
										<span className="pt-2 tabular-nums">{idx + 1}</span>
									</div>
								) : (
									<div className="flex flex-col gap-1">
										<Label
											htmlFor={`rm-cmax-${c.key}`}
											className="text-footnote"
										>
											{t("classRange")}
										</Label>
										<span className="flex items-center gap-1.5 tabular-nums">
											{c.min} –
											<Input
												id={`rm-cmax-${c.key}`}
												type="number"
												inputMode="numeric"
												className="w-16"
												min={c.min}
												max={range.max}
												value={c.max}
												disabled={!canEdit || last}
												onChange={(e) =>
													setClasses(
														draft.classes.map((x, k) =>
															k === idx
																? { ...x, max: Number(e.target.value) || x.max }
																: x,
														),
													)
												}
											/>
										</span>
									</div>
								)}
								<div className="flex flex-col gap-1">
									<Label htmlFor={`rm-cz-${c.key}`} className="text-footnote">
										{t("classZone")}
									</Label>
									<select
										id={`rm-cz-${c.key}`}
										className={nativeSelectClass}
										value={c.zone}
										disabled={!canEdit}
										onChange={(e) =>
											setClasses(
												draft.classes.map((x, k) =>
													k === idx
														? { ...x, zone: e.target.value as RiskZone }
														: x,
												),
											)
										}
									>
										{ZONES.map((z) => (
											<option key={z} value={z}>
												{t(`zone_${z}`)}
											</option>
										))}
									</select>
								</div>
								<div className="flex flex-col gap-1">
									<Label htmlFor={`rm-ca-${c.key}`} className="text-footnote">
										{t("classAcceptance")}
									</Label>
									<select
										id={`rm-ca-${c.key}`}
										className={nativeSelectClass}
										value={acceptanceValue(c.acceptance)}
										disabled={!canEdit}
										onChange={(e) =>
											setClasses(
												draft.classes.map((x, k) =>
													k === idx
														? {
																...x,
																acceptance: ACCEPTANCE_OPTIONS[
																	e.target.value as AcceptanceOption
																]
																	? [
																			...(ACCEPTANCE_OPTIONS[
																				e.target.value as AcceptanceOption
																			] ?? []),
																		]
																	: undefined,
															}
														: x,
												),
											)
										}
									>
										{(
											Object.keys(ACCEPTANCE_OPTIONS) as AcceptanceOption[]
										).map((o) => (
											<option key={o} value={o}>
												{t(`acceptance_${o}`)}
											</option>
										))}
									</select>
								</div>
								<div className="flex flex-col gap-1">
									<Label htmlFor={`rm-cm-${c.key}`} className="text-footnote">
										{t("classMeaning")}
									</Label>
									<Textarea
										id={`rm-cm-${c.key}`}
										className="min-h-14 bg-background"
										value={c.meaning}
										maxLength={1000}
										disabled={!canEdit}
										onChange={(e) =>
											setClasses(
												draft.classes.map((x, k) =>
													k === idx ? { ...x, meaning: e.target.value } : x,
												),
											)
										}
									/>
								</div>
								{canEdit && draft.classes.length > 2 && (
									<Button
										type="button"
										size="sm"
										variant="ghost"
										className="self-end"
										onClick={() =>
											setClasses(draft.classes.filter((_, k) => k !== idx))
										}
									>
										{t("remove")}
									</Button>
								)}
							</li>
						);
					})}
				</ol>
				{canEdit && draft.classes.length < 5 && (
					<div>
						<Button
							type="button"
							size="sm"
							variant="outline"
							onClick={() => {
								const lastCls = draft.classes.at(-1);
								if (isMatrix) {
									let k = draft.classes.length + 1;
									while (draft.classes.some((x) => x.key === `rk${k}`)) k++;
									setClasses([
										...draft.classes,
										{
											key: `rk${k}`,
											label: t("classNew"),
											min: 0,
											max: 0,
											zone: "unacceptable",
											meaning: "",
										},
									]);
									return;
								}
								if (!lastCls || lastCls.max - lastCls.min < 1) {
									toast.error(t("classNoRoom"));
									return;
								}
								const split = Math.floor((lastCls.min + lastCls.max) / 2);
								let n = draft.classes.length + 1;
								while (draft.classes.some((x) => x.key === `rk${n}`)) n++;
								setClasses([
									...draft.classes.slice(0, -1),
									{ ...lastCls, max: split },
									{
										key: `rk${n}`,
										label: t("classNew"),
										min: split + 1,
										max: range.max,
										zone: "unacceptable",
										meaning: "",
									},
								]);
							}}
						>
							{t("addClass")}
						</Button>
					</div>
				)}
				{isMatrix && (
					<MatrixEditor
						draft={draft}
						disabled={!canEdit}
						label={t("matrixTitle")}
						hint={t("matrixHint")}
						onChange={(matrix) => setDraft((d) => ({ ...d, matrix }))}
					/>
				)}
				{issues.length > 0 && (
					<ul
						className="list-disc pl-5 text-destructive text-footnote"
						aria-live="polite"
					>
						{issues.map((i) => (
							<li key={i}>{RISK_METHOD_ISSUE_TEXT[i]}</li>
						))}
					</ul>
				)}
			</section>

			{/* 5 · Freigabe & Beschluss */}
			<section className="flex flex-col gap-3" aria-labelledby="rm-fg">
				<h3 id="rm-fg" className="font-medium">
					5 · {t("approvalTitle")}
				</h3>
				<p className="text-muted-foreground text-footnote">
					{t("approvalLead")}{" "}
					<Link href="/beschluesse" className="text-primary hover:underline">
						{t("resolutionLink")}
					</Link>
				</p>
				<div className="flex items-center justify-between gap-3 rounded-2xl bg-card p-3">
					<div>
						<Label htmlFor="rm-solo">{ta("selfApproved")}</Label>
						<p className="text-muted-foreground text-footnote">
							{ta("soloHint")}
						</p>
					</div>
					<Switch
						id="rm-solo"
						checked={solo}
						disabled={!canEdit}
						onCheckedChange={setSolo}
					/>
				</div>
			</section>

			{canEdit && (
				<div className="sticky bottom-(--bar-offset) flex flex-wrap items-center justify-between gap-3 border-t material-bar py-3">
					<p className="text-muted-foreground text-footnote" aria-live="polite">
						{levelsChanged && risks.length > 0 && (
							<>
								{t("levelsChanged", {
									from: levelCount(method),
									to: n,
									count: risks.length,
								})}{" "}
							</>
						)}
						{risks.length > 0 && stored
							? t("preview", {
									changed: preview.changed,
									up: preview.nowUnacceptable,
								})
							: risks.length > 0
								? t("previewLegacy", { changed: preview.changed })
								: t("previewNone")}
					</p>
					<span className="flex gap-2">
						<Button
							type="button"
							size="sm"
							variant="ghost"
							onClick={() => setDraft(clone(template))}
						>
							{t("loadTemplate")}
						</Button>
						<Button
							type="submit"
							size="sm"
							disabled={pending || issues.length > 0 || !dirty}
						>
							{t("save")}
						</Button>
					</span>
				</div>
			)}
			<FormAlert message={formError} />
		</form>
	);
}

// Matrix der Risikoklassen: Zeilen Eintrittswahrscheinlichkeit (oben die
// höchste), Spalten Schadenshöhe; je Feld eine Klasse.
function MatrixEditor({
	draft,
	disabled,
	label,
	hint,
	onChange,
}: {
	draft: RiskMethod;
	disabled: boolean;
	label: string;
	hint: string;
	onChange: (matrix: string[][]) => void;
}) {
	const n = levelCount(draft);
	const matrix = repairMatrix(draft.matrix, draft.classes, n);
	const byKey = new Map(draft.classes.map((c) => [c.key, c]));
	const cols = Array.from({ length: n }, (_, k) => k + 1);
	const rows = [...cols].reverse();
	return (
		<div className="flex flex-col gap-2">
			<h4 className="font-medium">{label}</h4>
			<p className="text-muted-foreground text-footnote">{hint}</p>
			<div className="overflow-x-auto">
				<table className="border-separate border-spacing-1 text-footnote">
					<thead>
						<tr>
							<th className="text-left font-normal text-muted-foreground">
								<span className="sr-only">{label}</span>
							</th>
							{cols.map((i) => (
								<th
									key={i}
									scope="col"
									className="min-w-28 px-1 text-left font-normal text-muted-foreground"
								>
									{i} · {draft.impact[i - 1]}
								</th>
							))}
						</tr>
					</thead>
					<tbody>
						{rows.map((l) => (
							<tr key={l}>
								<th
									scope="row"
									className="pr-2 text-right font-normal text-muted-foreground"
								>
									{l} · {draft.likelihood[l - 1]?.label}
								</th>
								{cols.map((i) => {
									const key = matrix[l - 1]?.[i - 1] ?? "";
									const cls = byKey.get(key);
									return (
										<td
											key={i}
											className={cn(
												"rounded-sm p-1",
												cls ? ZONE_CELL[cls.zone] : undefined,
											)}
										>
											<select
												aria-label={`${draft.likelihood[l - 1]?.label}, ${draft.impact[i - 1]}`}
												className={cn(nativeSelectClass, "bg-background/80")}
												value={key}
												disabled={disabled}
												onChange={(e) =>
													onChange(
														matrix.map((row, r) =>
															r === l - 1
																? row.map((k, c) =>
																		c === i - 1 ? e.target.value : k,
																	)
																: row,
														),
													)
												}
											>
												{draft.classes.map((c) => (
													<option key={c.key} value={c.key}>
														{c.label}
													</option>
												))}
											</select>
										</td>
									);
								})}
							</tr>
						))}
					</tbody>
				</table>
			</div>
		</div>
	);
}
