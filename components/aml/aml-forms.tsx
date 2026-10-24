"use client";

import { Sparkles, Upload } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
	applyCorridorTemplate,
	applyJurisdictionSeed,
	importJurisdictionsCsv,
	requestAmlRiskAnalysisApproval,
	transitionSuspiciousReport,
	upsertAmlRiskAnalysis,
	upsertJurisdiction,
	upsertMonitoringRule,
	upsertSuspiciousReport,
} from "@/app/actions/aml";
import { LevelChoice } from "@/components/entity/level-choice";
import type { MemberOption } from "@/components/entity/owner-assignee";
import {
	EditTrigger,
	Field,
	FormDialog,
	NewTrigger,
	UserSelect,
} from "@/components/organisation/governance-forms";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
	EMPTY_DIMENSIONS,
	overallAmlRisk,
	type RiskDimensions,
} from "@/lib/compliance/aml";
import {
	AML_SCORE_LABELS,
	applicableAmlFactors,
	suggestDimensionScore,
} from "@/lib/compliance/catalog/aml-risk-factors";
import { cn } from "@/lib/utils";
import {
	CORRIDOR_STATUSES,
	FATF_STATUSES,
	MONITORING_RULE_STATUSES,
	ORG_STANCES,
	SUSPICIOUS_KINDS,
} from "@/lib/validation/casp";

function today(): string {
	return new Date().toISOString().slice(0, 10);
}
function nowLocal(): string {
	const d = new Date();
	d.setSeconds(0, 0);
	return new Date(d.getTime() - d.getTimezoneOffset() * 60_000)
		.toISOString()
		.slice(0, 16);
}

function EnumSelect<T extends string>({
	label,
	value,
	options,
	onChange,
	labelFor,
}: {
	label: string;
	value: T;
	options: readonly T[];
	onChange: (v: T) => void;
	labelFor: (v: T) => string;
}) {
	return (
		<div className="flex flex-col gap-1.5">
			<Label>{label}</Label>
			<Select value={value} onValueChange={(v) => onChange(v as T)}>
				<SelectTrigger className="w-full">
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					{options.map((o) => (
						<SelectItem key={o} value={o}>
							{labelFor(o)}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
		</div>
	);
}

// ── Risikoanalyse ──────────────────────────────────────────────────────────

export type RiskAnalysisDraft = {
	id?: string;
	version?: string;
	dimensions: RiskDimensions;
	summary?: string | null;
	ownerUserId?: string | null;
	nextReviewAt?: string | null;
};

const DIMENSIONS = ["customer", "product", "country", "channel"] as const;
const AML_STEPS = [...DIMENSIONS, "summary"] as const;

// Geführte Geldwäsche-Risikoanalyse: je Dimension Faktoren aus dem Katalog
// ankreuzen (erhöhend/mindernd), Vorschlag ansehen, Wert bestätigen oder
// begründet abweichen; zum Schluss Zusammenfassung und Gesamtrisiko.
export function RiskAnalysisForm({
	initial,
	members,
	frameworks = [],
}: {
	initial?: RiskAnalysisDraft;
	members: MemberOption[];
	frameworks?: readonly string[];
}) {
	const t = useTranslations("Aml");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [pending, start] = useTransition();
	const [step, setStep] = useState<(typeof AML_STEPS)[number]>("customer");
	const [d, setD] = useState<RiskAnalysisDraft>(
		initial ?? { dimensions: EMPTY_DIMENSIONS },
	);
	const factors = applicableAmlFactors(frameworks);
	const overall = overallAmlRisk(d.dimensions);
	const setDim = (
		key: (typeof DIMENSIONS)[number],
		patch: Partial<RiskDimensions["customer"]>,
	) =>
		setD((x) => ({
			...x,
			dimensions: {
				...x.dimensions,
				[key]: { ...x.dimensions[key], ...patch },
			},
		}));
	const idx = AML_STEPS.indexOf(step);
	return (
		<FormDialog
			title={initial ? t("editAnalysis") : t("newAnalysis")}
			lead={t("analysisFormLead")}
			trigger={
				initial ? <EditTrigger /> : <NewTrigger label={t("newAnalysis")} />
			}
			open={open}
			setOpen={setOpen}
			pending={pending}
			wide
			onSubmit={() =>
				start(async () => {
					const res = await upsertAmlRiskAnalysis({
						id: d.id,
						version: d.version || undefined,
						dimensions: d.dimensions,
						summary: d.summary || undefined,
						ownerUserId: d.ownerUserId ?? null,
						nextReviewAt: d.nextReviewAt || null,
					});
					if (!res.ok)
						return void toast.error(
							res.error === "notDraft" ? t("notDraft") : tc("error"),
						);
					toast.success(t("analysisSaved", { version: res.data.version }));
					setOpen(false);
					router.refresh();
				})
			}
		>
			<nav aria-label={t("stepsLabel")}>
				<ol className="flex flex-wrap gap-1.5 text-footnote">
					{AML_STEPS.map((s, i) => (
						<li key={s}>
							<button
								type="button"
								aria-current={s === step ? "step" : undefined}
								onClick={() => setStep(s)}
								className={cn(
									"inline-flex min-h-(--control-h-sm) items-center rounded-full px-3",
									s === step
										? "bg-primary-fill text-white"
										: "bg-muted text-muted-foreground hover:bg-foreground/12",
								)}
							>
								{i + 1} · {s === "summary" ? t("stepSummary") : t(`dim_${s}`)}
								{s !== "summary" && (
									<span className="ml-1 tabular-nums">
										{d.dimensions[s].score}
									</span>
								)}
							</button>
						</li>
					))}
				</ol>
			</nav>
			{step !== "summary" &&
				(() => {
					const key = step;
					const dim = d.dimensions[key];
					const codes = dim.factorCodes ?? [];
					const sug = suggestDimensionScore(key, codes);
					const list = factors.filter((f) => f.dimension === key);
					return (
						<div className="flex flex-col gap-4">
							<p className="text-muted-foreground text-subhead">
								{t(`dimLead_${key}`)}
							</p>
							<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
								{(["higher", "lower"] as const).map((dir) => (
									<fieldset key={dir} className="flex min-w-0 flex-col gap-1.5">
										<legend className="mb-1 font-medium text-subhead">
											{t(`factors_${dir}`)}
										</legend>
										{list
											.filter((f) => f.direction === dir)
											.map((f) => (
												<label
													key={f.code}
													className="flex cursor-pointer items-start gap-2 rounded-2xl bg-card p-2 text-footnote has-[:checked]:border-primary has-[:checked]:bg-primary/5"
												>
													<input
														type="checkbox"
														className="mt-0.5 accent-primary"
														checked={codes.includes(f.code)}
														onChange={(e) =>
															setDim(key, {
																factorCodes: e.target.checked
																	? [...codes, f.code]
																	: codes.filter((c) => c !== f.code),
															})
														}
													/>
													<span>
														<span className="block">{f.text}</span>
														<span className="text-muted-foreground">
															{f.source}
														</span>
													</span>
												</label>
											))}
									</fieldset>
								))}
							</div>
							<div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-muted p-2 text-subhead">
								<span aria-live="polite">
									{t("suggestion", {
										score: sug.score,
										label: AML_SCORE_LABELS[sug.score - 1] ?? "",
									})}
								</span>
								{sug.score !== dim.score && (
									<Button
										type="button"
										size="sm"
										variant="outline"
										onClick={() => setDim(key, { score: sug.score })}
									>
										{t("takeSuggestion")}
									</Button>
								)}
							</div>
							<LevelChoice
								name={`aml-${key}`}
								legend={t("dimScore")}
								compact
								options={AML_SCORE_LABELS.map((label, i) => ({
									value: i + 1,
									label,
								}))}
								value={dim.score}
								onChange={(v) => setDim(key, { score: v })}
							/>
							<div className="flex flex-col gap-1">
								<Label htmlFor={`ra-f-${key}`}>{t("factorsNote")}</Label>
								<Textarea
									id={`ra-f-${key}`}
									rows={2}
									placeholder={
										sug.score !== dim.score
											? t("deviationPlaceholder")
											: t("factorsPlaceholder")
									}
									value={dim.factors}
									onChange={(e) => setDim(key, { factors: e.target.value })}
								/>
							</div>
							<div className="flex flex-col gap-1">
								<Label htmlFor={`ra-m-${key}`}>{t("measuresLabel")}</Label>
								<Textarea
									id={`ra-m-${key}`}
									rows={2}
									placeholder={t("measuresPlaceholder")}
									value={dim.measures ?? ""}
									onChange={(e) => setDim(key, { measures: e.target.value })}
								/>
							</div>
							{dim.score >= 4 && (
								<p className="text-subhead">
									<Link
										className="text-primary hover:underline"
										href={`/risiken/neu?szenario=${key === "country" ? "RS-AML-08" : key === "channel" ? "RS-AML-07" : "RS-AML-01"}`}
									>
										{t("toRiskRegister")}
									</Link>
								</p>
							)}
						</div>
					);
				})()}
			{step === "summary" && (
				<div className="flex flex-col gap-4">
					<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
						{!initial && (
							<Field
								id="ra-version"
								label={t("version")}
								value={d.version ?? ""}
								onChange={(v) => setD({ ...d, version: v })}
							/>
						)}
						<UserSelect
							label={t("owner")}
							value={d.ownerUserId}
							onChange={(v) => setD({ ...d, ownerUserId: v })}
							members={members}
						/>
						<Field
							id="ra-review"
							label={t("nextReviewAt")}
							type="date"
							value={d.nextReviewAt ?? ""}
							onChange={(v) => setD({ ...d, nextReviewAt: v })}
						/>
					</div>
					<ul className="grid grid-cols-1 gap-2 text-subhead sm:grid-cols-4">
						{DIMENSIONS.map((key) => (
							<li key={key} className="rounded-2xl bg-card p-2">
								<p className="text-muted-foreground text-footnote">
									{t(`dim_${key}`)}
								</p>
								<p className="font-medium">
									{d.dimensions[key].score} ·{" "}
									{AML_SCORE_LABELS[d.dimensions[key].score - 1]}
								</p>
								<p className="text-muted-foreground text-footnote">
									{t("factorCount", {
										n: (d.dimensions[key].factorCodes ?? []).length,
									})}
								</p>
							</li>
						))}
					</ul>
					<Field
						id="ra-summary"
						label={t("summary")}
						value={d.summary ?? ""}
						onChange={(v) => setD({ ...d, summary: v })}
						rows={3}
					/>
					<p className="font-medium text-subhead">
						{t("overallPreview", { risk: t(`risk_${overall}`) })}
					</p>
				</div>
			)}
			<div className="flex justify-between gap-2">
				<Button
					type="button"
					variant="ghost"
					size="sm"
					disabled={idx === 0}
					onClick={() => setStep(AML_STEPS[idx - 1] ?? step)}
				>
					{tc("back")}
				</Button>
				{step !== "summary" && (
					<Button
						type="button"
						variant="outline"
						size="sm"
						onClick={() => setStep(AML_STEPS[idx + 1] ?? step)}
					>
						{tc("next")}
					</Button>
				)}
			</div>
		</FormDialog>
	);
}

export function RiskAnalysisApproveButton({
	id,
	soloHint,
}: {
	id: string;
	soloHint?: boolean;
}) {
	const t = useTranslations("Aml");
	const ts = useTranslations("Status");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [pending, start] = useTransition();
	const [reason, setReason] = useState("");
	return (
		<div className="flex flex-wrap items-center gap-2">
			{soloHint && (
				<Input
					className="h-8 w-full min-w-0 max-w-64"
					placeholder={t("soloReason")}
					value={reason}
					onChange={(e) => setReason(e.target.value)}
				/>
			)}
			<Button
				size="sm"
				disabled={pending}
				onClick={() =>
					start(async () => {
						const res = await requestAmlRiskAnalysisApproval({
							id,
							selfApprovalReason: reason || undefined,
						});
						if (!res.ok)
							return void toast.error(
								res.error.startsWith("solo_") ||
									res.error === "no_approver" ||
									res.error === "workflow_disabled"
									? ts(
											`approvalError_${res.error}` as "approvalError_no_approver",
										)
									: res.error === "notDraft"
										? t("notDraft")
										: tc("error"),
							);
						toast.success(
							res.data.status === "approved"
								? t("analysisApproved")
								: ts("approvalRequested"),
						);
						router.refresh();
					})
				}
			>
				{t("requestApproval")}
			</Button>
		</div>
	);
}

// ── Monitoring-Regel ───────────────────────────────────────────────────────

export type RuleDraft = {
	id?: string;
	code: string;
	description: string;
	threshold?: string | null;
	rationale?: string | null;
	legalBasis?: string | null;
	ownerUserId?: string | null;
	lastTunedAt?: string | null;
	falsePositiveRate?: string | null;
	status: (typeof MONITORING_RULE_STATUSES)[number];
};

export function MonitoringRuleForm({
	initial,
	members,
}: {
	initial?: RuleDraft;
	members: MemberOption[];
}) {
	const t = useTranslations("Aml");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [pending, start] = useTransition();
	const [d, setD] = useState<RuleDraft>(
		initial ?? { code: "", description: "", status: "active" },
	);
	return (
		<FormDialog
			title={initial ? t("editRule") : t("newRule")}
			lead={t("ruleFormLead")}
			trigger={initial ? <EditTrigger /> : <NewTrigger label={t("newRule")} />}
			open={open}
			setOpen={setOpen}
			pending={pending}
			wide
			onSubmit={() =>
				start(async () => {
					const res = await upsertMonitoringRule({
						id: d.id,
						code: d.code.trim().toUpperCase(),
						description: d.description,
						threshold: d.threshold || undefined,
						rationale: d.rationale || undefined,
						legalBasis: d.legalBasis || undefined,
						ownerUserId: d.ownerUserId ?? null,
						lastTunedAt: d.lastTunedAt || null,
						falsePositiveRate:
							d.falsePositiveRate === "" || d.falsePositiveRate == null
								? null
								: Number(d.falsePositiveRate),
						status: d.status,
					});
					if (!res.ok)
						return void toast.error(
							res.error === "duplicate" ? t("duplicateCode") : tc("error"),
						);
					toast.success(t("saved"));
					setOpen(false);
					router.refresh();
				})
			}
		>
			<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
				<Field
					id="mr-code"
					label={t("code")}
					value={d.code}
					onChange={(v) => setD({ ...d, code: v })}
					required
				/>
				<EnumSelect
					label={t("status")}
					value={d.status}
					options={MONITORING_RULE_STATUSES}
					onChange={(v) => setD({ ...d, status: v })}
					labelFor={(v) => t(`rule_${v}`)}
				/>
			</div>
			<Field
				id="mr-desc"
				label={t("description")}
				value={d.description}
				onChange={(v) => setD({ ...d, description: v })}
				rows={2}
				required
			/>
			<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
				<Field
					id="mr-threshold"
					label={t("threshold")}
					value={d.threshold ?? ""}
					onChange={(v) => setD({ ...d, threshold: v })}
				/>
				<Field
					id="mr-legal"
					label={t("legalBasis")}
					value={d.legalBasis ?? ""}
					onChange={(v) => setD({ ...d, legalBasis: v })}
				/>
				<UserSelect
					label={t("owner")}
					value={d.ownerUserId}
					onChange={(v) => setD({ ...d, ownerUserId: v })}
					members={members}
				/>
				<Field
					id="mr-tuned"
					label={t("lastTunedAt")}
					type="date"
					value={d.lastTunedAt ?? ""}
					onChange={(v) => setD({ ...d, lastTunedAt: v })}
				/>
				<Field
					id="mr-fpr"
					label={t("falsePositiveRate")}
					type="number"
					value={d.falsePositiveRate ?? ""}
					onChange={(v) => setD({ ...d, falsePositiveRate: v })}
				/>
			</div>
			<Field
				id="mr-rationale"
				label={t("rationale")}
				value={d.rationale ?? ""}
				onChange={(v) => setD({ ...d, rationale: v })}
				rows={2}
			/>
		</FormDialog>
	);
}

// ── Verdachtsmeldung / STOR ────────────────────────────────────────────────

export type SuspiciousDraft = {
	id?: string;
	kind: (typeof SUSPICIOUS_KINDS)[number];
	detectedAt: string; // datetime-local
	category?: string | null;
	decisionNote?: string | null;
	ownerUserId?: string | null;
};

export function SuspiciousReportForm({
	initial,
	members,
}: {
	initial?: SuspiciousDraft;
	members: MemberOption[];
}) {
	const t = useTranslations("Aml");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [pending, start] = useTransition();
	const [d, setD] = useState<SuspiciousDraft>(
		initial ?? { kind: "gwg_sar", detectedAt: nowLocal() },
	);
	return (
		<FormDialog
			title={initial ? t("editReport") : t("newReport")}
			lead={t("reportFormLead")}
			trigger={
				initial ? <EditTrigger /> : <NewTrigger label={t("newReport")} />
			}
			open={open}
			setOpen={setOpen}
			pending={pending}
			onSubmit={() =>
				start(async () => {
					const res = await upsertSuspiciousReport({
						id: d.id,
						kind: d.kind,
						detectedAt: new Date(d.detectedAt),
						category: d.category || undefined,
						decisionNote:
							d.decisionNote === undefined ? undefined : d.decisionNote || null,
						ownerUserId: d.ownerUserId ?? null,
					});
					if (!res.ok) return void toast.error(tc("error"));
					toast.success(
						initial
							? t("saved")
							: t("reportCreated", { ref: res.data.internalRef }),
					);
					setOpen(false);
					router.refresh();
				})
			}
		>
			<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
				{!initial && (
					<>
						<EnumSelect
							label={t("kind")}
							value={d.kind}
							options={SUSPICIOUS_KINDS}
							onChange={(v) => setD({ ...d, kind: v })}
							labelFor={(v) => t(`kind_${v}`)}
						/>
						<Field
							id="sr-detected"
							label={t("detectedAt")}
							type="datetime-local"
							value={d.detectedAt}
							onChange={(v) => setD({ ...d, detectedAt: v })}
							required
						/>
					</>
				)}
				<Field
					id="sr-category"
					label={t("category")}
					value={d.category ?? ""}
					onChange={(v) => setD({ ...d, category: v })}
				/>
				<UserSelect
					label={t("owner")}
					value={d.ownerUserId}
					onChange={(v) => setD({ ...d, ownerUserId: v })}
					members={members}
				/>
			</div>
			<Field
				id="sr-note"
				label={t("decisionNote")}
				value={d.decisionNote ?? ""}
				onChange={(v) => setD({ ...d, decisionNote: v })}
				rows={3}
			/>
			<p className="text-muted-foreground text-footnote">{t("noPiiHint")}</p>
		</FormDialog>
	);
}

export function SuspiciousTransitionButtons({
	id,
	status,
	kind,
}: {
	id: string;
	status: "review" | "reported" | "dismissed";
	kind: (typeof SUSPICIOUS_KINDS)[number];
}) {
	const t = useTranslations("Aml");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [pending, start] = useTransition();
	const [ref, setRef] = useState("");
	const go = (to: "review" | "reported" | "dismissed") =>
		start(async () => {
			const res = await transitionSuspiciousReport({
				id,
				to,
				externalRef: ref || undefined,
			});
			if (!res.ok) return void toast.error(tc("error"));
			router.refresh();
		});
	if (status === "review")
		return (
			<span className="inline-flex flex-wrap items-center gap-1">
				<Input
					className="h-8 w-40"
					placeholder={kind === "micar_stor" ? t("bafinRef") : t("goAmlRef")}
					value={ref}
					onChange={(e) => setRef(e.target.value)}
				/>
				<Button size="sm" disabled={pending} onClick={() => go("reported")}>
					{t("markReported")}
				</Button>
				<Button
					size="sm"
					variant="outline"
					disabled={pending}
					onClick={() => go("dismissed")}
				>
					{t("dismiss")}
				</Button>
			</span>
		);
	return (
		<Button
			size="sm"
			variant="outline"
			disabled={pending}
			onClick={() => go("review")}
		>
			{t("reopen")}
		</Button>
	);
}

// ── Länder & Korridore ─────────────────────────────────────────────────────

export type JurisdictionDraft = {
	id?: string;
	iso2: string;
	name: string;
	euHighRisk: boolean;
	fatfStatus: (typeof FATF_STATUSES)[number];
	euSanctions: boolean;
	usSanctions: boolean;
	orgStance: (typeof ORG_STANCES)[number];
	corridorStatus: (typeof CORRIDOR_STATUSES)[number];
	corridorNotes?: string | null;
	legalNotes?: string | null;
	reviewedAt?: string | null;
};

export function JurisdictionForm({ initial }: { initial?: JurisdictionDraft }) {
	const t = useTranslations("Aml");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [pending, start] = useTransition();
	const [d, setD] = useState<JurisdictionDraft>(
		initial ?? {
			iso2: "",
			name: "",
			euHighRisk: false,
			fatfStatus: "none",
			euSanctions: false,
			usSanctions: false,
			orgStance: "allowed",
			corridorStatus: "none",
		},
	);
	const Flag = ({
		k,
		label,
	}: {
		k: "euHighRisk" | "euSanctions" | "usSanctions";
		label: string;
	}) => (
		<label className="flex items-center gap-2 text-subhead">
			<Checkbox
				checked={d[k]}
				onCheckedChange={(v) => setD({ ...d, [k]: Boolean(v) })}
			/>
			{label}
		</label>
	);
	return (
		<FormDialog
			title={initial ? t("editJurisdiction") : t("newJurisdiction")}
			lead={t("jurisdictionFormLead")}
			trigger={
				initial ? <EditTrigger /> : <NewTrigger label={t("newJurisdiction")} />
			}
			open={open}
			setOpen={setOpen}
			pending={pending}
			wide
			onSubmit={() =>
				start(async () => {
					const res = await upsertJurisdiction({
						id: d.id,
						iso2: d.iso2,
						name: d.name,
						euHighRisk: d.euHighRisk,
						fatfStatus: d.fatfStatus,
						euSanctions: d.euSanctions,
						usSanctions: d.usSanctions,
						orgStance: d.orgStance,
						corridorStatus: d.corridorStatus,
						corridorNotes: d.corridorNotes || undefined,
						legalNotes: d.legalNotes || undefined,
						reviewedAt: d.reviewedAt || today(),
					});
					if (!res.ok) return void toast.error(tc("error"));
					toast.success(t("saved"));
					setOpen(false);
					router.refresh();
				})
			}
		>
			<div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
				<Field
					id="j-iso"
					label={t("iso2")}
					value={d.iso2}
					onChange={(v) => setD({ ...d, iso2: v.toUpperCase() })}
					required
				/>
				<div className="sm:col-span-2">
					<Field
						id="j-name"
						label={t("name")}
						value={d.name}
						onChange={(v) => setD({ ...d, name: v })}
						required
					/>
				</div>
				<EnumSelect
					label={t("fatfStatus")}
					value={d.fatfStatus}
					options={FATF_STATUSES}
					onChange={(v) => setD({ ...d, fatfStatus: v })}
					labelFor={(v) => t(`fatf_${v}`)}
				/>
				<EnumSelect
					label={t("orgStance")}
					value={d.orgStance}
					options={ORG_STANCES}
					onChange={(v) => setD({ ...d, orgStance: v })}
					labelFor={(v) => t(`stance_${v}`)}
				/>
				<EnumSelect
					label={t("corridorStatus")}
					value={d.corridorStatus}
					options={CORRIDOR_STATUSES}
					onChange={(v) => setD({ ...d, corridorStatus: v })}
					labelFor={(v) => t(`corridor_${v}`)}
				/>
			</div>
			<div className="flex flex-wrap gap-4">
				<Flag k="euHighRisk" label={t("euHighRisk")} />
				<Flag k="euSanctions" label={t("euSanctions")} />
				<Flag k="usSanctions" label={t("usSanctions")} />
			</div>
			<Field
				id="j-legal"
				label={t("legalNotes")}
				value={d.legalNotes ?? ""}
				onChange={(v) => setD({ ...d, legalNotes: v })}
				rows={2}
			/>
			<Field
				id="j-corr"
				label={t("corridorNotes")}
				value={d.corridorNotes ?? ""}
				onChange={(v) => setD({ ...d, corridorNotes: v })}
				rows={2}
			/>
		</FormDialog>
	);
}

export function ApplyJurisdictionSeedButton() {
	const t = useTranslations("Aml");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [pending, start] = useTransition();
	return (
		<Button
			variant="outline"
			size="sm"
			disabled={pending}
			onClick={() =>
				start(async () => {
					const res = await applyJurisdictionSeed();
					if (!res.ok) return void toast.error(tc("error"));
					toast.success(t("seedApplied", { n: res.data.created }));
					router.refresh();
				})
			}
		>
			<Sparkles />
			{t("applySeed")}
		</Button>
	);
}

export function JurisdictionCsvImport() {
	const t = useTranslations("Aml");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [pending, start] = useTransition();
	const [csv, setCsv] = useState("");
	const [errors, setErrors] = useState<string[]>([]);
	return (
		<FormDialog
			title={t("csvImport")}
			lead={t("csvImportLead")}
			trigger={
				<Button variant="outline" size="sm">
					<Upload />
					{t("csvImport")}
				</Button>
			}
			open={open}
			setOpen={setOpen}
			pending={pending}
			wide
			onSubmit={() =>
				start(async () => {
					const res = await importJurisdictionsCsv({ csv });
					if (!res.ok) return void toast.error(res.error || tc("error"));
					setErrors(res.data.errors);
					toast.success(t("csvImported", { n: res.data.imported }));
					if (res.data.errors.length === 0) setOpen(false);
					router.refresh();
				})
			}
		>
			<Textarea
				rows={10}
				className="font-mono text-footnote"
				placeholder="iso2;name;euHighRisk;fatfStatus;euSanctions;usSanctions;orgStance;corridorStatus;legalNotes"
				value={csv}
				onChange={(e) => setCsv(e.target.value)}
			/>
			{errors.length > 0 && (
				<ul className="list-disc pl-5 text-destructive text-footnote">
					{errors.map((e) => (
						<li key={e}>{e}</li>
					))}
				</ul>
			)}
		</FormDialog>
	);
}

export function CorridorTemplateButton({ iso2 }: { iso2: string }) {
	const t = useTranslations("Aml");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [pending, start] = useTransition();
	return (
		<Button
			size="sm"
			variant="ghost"
			disabled={pending}
			title={t("corridorTemplate")}
			onClick={() =>
				start(async () => {
					const res = await applyCorridorTemplate({ iso2 });
					if (!res.ok) return void toast.error(tc("error"));
					toast.success(t("corridorApplied", { n: res.data.tasks }));
					router.refresh();
				})
			}
		>
			{t("corridorTemplateShort")}
		</Button>
	);
}
