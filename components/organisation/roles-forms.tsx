"use client";

import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import {
	addKpiMeasurement,
	requestScopeApproval,
	upsertObjective,
	upsertRoleAssignment,
	upsertScope,
} from "@/app/actions/organisation";
import { withStepUp } from "@/components/auth/step-up-dialog";
import type { MemberOption } from "@/components/entity/owner-assignee";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { errorText } from "@/components/ui/error-text";
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
import { toast } from "@/components/ui/toast";
import type { RoleFunction } from "@/db/schema/enums";
import type { MeasurementSuggestion } from "@/lib/compliance/indicator-sources";
import {
	INDICATOR_TEMPLATES,
	type IndicatorDirection,
	type IndicatorType,
} from "@/lib/compliance/indicators";
import type { FitProperChecklist } from "@/lib/validation/governance";
import {
	EditTrigger,
	Field,
	FormDialog,
	FunctionSelect,
	NewTrigger,
	ResponsibleField,
	UserSelect,
} from "./governance-forms";

// ── Rollen & Leitung ───────────────────────────────────────────────────────
export type RoleAssignmentDraft = {
	id?: string;
	function: RoleFunction;
	userId?: string | null;
	externalName?: string | null;
	appointedAt?: string | null;
	deputyUserId?: string | null;
	fitProperStatus: "not_required" | "pending" | "confirmed" | "rejected";
	fitProperChecklist?: FitProperChecklist | null;
	documentsValidUntil?: string | null;
	reviewAt?: string | null;
	reportsToFunction?: RoleFunction | null;
	appointmentNotes?: string | null;
};

const CHECKLIST_KEYS = [
	"cv",
	"criminalRecord",
	"gzr",
	"debtorRegister",
	"declarations",
	"timeBudget",
	"conflicts",
] as const;

const EMPTY_CHECKLIST: FitProperChecklist = {
	cv: false,
	criminalRecord: false,
	gzr: false,
	debtorRegister: false,
	declarations: false,
	timeBudget: false,
	conflicts: false,
};

export function RoleAssignmentForm({
	initial,
	members,
	functionLabels,
	presetFunction,
	triggerLabel,
	triggerVariant,
}: {
	initial?: RoleAssignmentDraft;
	members: MemberOption[];
	functionLabels: Record<string, string>;
	presetFunction?: RoleFunction;
	triggerLabel?: string;
	// in Tabellen schlicht, damit es je Ansicht nur einen Hauptknopf gibt
	triggerVariant?: "ghost";
}) {
	const t = useTranslations("Organisation");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [pending, start] = useTransition();
	const [d, setD] = useState<RoleAssignmentDraft>(
		initial ?? {
			function: presetFunction ?? "isb_ciso",
			fitProperStatus: "not_required",
		},
	);
	const [mode, setMode] = useState<"person" | "external">(
		initial?.externalName && !initial.userId ? "external" : "person",
	);
	const checklist = d.fitProperChecklist ?? EMPTY_CHECKLIST;
	const showFitProper = d.fitProperStatus !== "not_required";
	return (
		<FormDialog
			title={initial ? t("editAssignment") : t("newAssignment")}
			lead={t("rolesFormLead")}
			trigger={
				initial ? (
					<EditTrigger label={triggerLabel} />
				) : (
					<NewTrigger
						label={triggerLabel ?? t("newAssignment")}
						variant={triggerVariant}
					/>
				)
			}
			open={open}
			setOpen={setOpen}
			pending={pending}
			disabled={mode === "person" ? !d.userId : !d.externalName?.trim()}
			wide
			onSubmit={() =>
				start(async () => {
					const res = await withStepUp(() =>
						upsertRoleAssignment({
							...d,
							userId: mode === "person" ? d.userId : null,
							externalName: mode === "external" ? d.externalName : null,
							appointedAt: d.appointedAt || null,
							documentsValidUntil: d.documentsValidUntil || null,
							reviewAt: d.reviewAt || null,
							reportsToFunction:
								d.function === "management_body"
									? null
									: (d.reportsToFunction ?? null),
							appointmentNotes: d.appointmentNotes?.trim() || null,
							fitProperChecklist: showFitProper ? checklist : null,
						}),
					);
					if (!res.ok)
						return void toast.error(
							res.error === "step_up_required"
								? t("stepUp")
								: errorText(tc, res),
						);
					toast.success(t("saved"));
					setOpen(false);
					router.refresh();
				})
			}
		>
			<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
				<FunctionSelect
					label={t("function")}
					value={d.function}
					onChange={(v) => v && setD({ ...d, function: v })}
					labels={functionLabels}
				/>
				<div className="flex flex-col gap-1.5">
					<Label>{t("holderKind")}</Label>
					<Select
						value={mode}
						onValueChange={(v) => setMode(v as "person" | "external")}
					>
						<SelectTrigger className="w-full">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="person">{t("holderMember")}</SelectItem>
							<SelectItem value="external">{t("holderExternal")}</SelectItem>
						</SelectContent>
					</Select>
				</div>
				{mode === "person" ? (
					<UserSelect
						label={t("holder")}
						value={d.userId}
						onChange={(v) => setD({ ...d, userId: v })}
						members={members}
					/>
				) : (
					<Field
						id="ra-ext"
						label={t("externalName")}
						value={d.externalName ?? ""}
						onChange={(v) => setD({ ...d, externalName: v })}
						required
					/>
				)}
				<UserSelect
					label={t("deputy")}
					value={d.deputyUserId}
					onChange={(v) => setD({ ...d, deputyUserId: v })}
					members={members}
				/>
				<Field
					id="ra-app"
					label={t("appointedAt")}
					type="date"
					value={d.appointedAt ?? ""}
					onChange={(v) => setD({ ...d, appointedAt: v })}
				/>
				<Field
					id="ra-rev"
					label={t("reviewAt")}
					type="date"
					value={d.reviewAt ?? ""}
					onChange={(v) => setD({ ...d, reviewAt: v })}
				/>
				{d.function !== "management_body" && (
					<FunctionSelect
						label={t("reportsTo")}
						value={d.reportsToFunction}
						onChange={(v) => setD({ ...d, reportsToFunction: v })}
						labels={functionLabels}
						allowNone
						noneLabel={t("reportsToTop")}
						exclude={d.function}
					/>
				)}
				<div className="flex flex-col gap-1.5">
					<Label>{t("fitProper")}</Label>
					<Select
						value={d.fitProperStatus}
						onValueChange={(v) =>
							setD({
								...d,
								fitProperStatus: v as RoleAssignmentDraft["fitProperStatus"],
							})
						}
					>
						<SelectTrigger className="w-full">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{(
								["not_required", "pending", "confirmed", "rejected"] as const
							).map((s) => (
								<SelectItem key={s} value={s}>
									{t(`fp_${s}`)}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
				{showFitProper && (
					<Field
						id="ra-valid"
						label={t("documentsValidUntil")}
						type="date"
						value={d.documentsValidUntil ?? ""}
						onChange={(v) => setD({ ...d, documentsValidUntil: v })}
					/>
				)}
			</div>
			{d.function !== "management_body" && (
				<div className="flex flex-col gap-1.5">
					<Label htmlFor="ra-notes">{t("appointmentNotes")}</Label>
					<Textarea
						id="ra-notes"
						rows={3}
						maxLength={4000}
						placeholder={t("appointmentNotesPlaceholder")}
						value={d.appointmentNotes ?? ""}
						onChange={(e) => setD({ ...d, appointmentNotes: e.target.value })}
					/>
					<p className="text-muted-foreground text-footnote">
						{t("appointmentNotesHint")}
					</p>
				</div>
			)}
			{showFitProper && (
				<fieldset className="flex flex-col gap-2 rounded-2xl bg-card p-3">
					<legend className="font-medium text-footnote px-1 text-footnote text-muted-foreground">
						{t("fitProperChecklist")}
					</legend>
					<p className="text-muted-foreground text-footnote">
						{t("fitProperLead")}
					</p>
					<div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
						{CHECKLIST_KEYS.map((k) => (
							<label key={k} className="flex items-center gap-2 text-subhead">
								<Checkbox
									checked={checklist[k]}
									onCheckedChange={(v) =>
										setD({
											...d,
											fitProperChecklist: { ...checklist, [k]: Boolean(v) },
										})
									}
								/>
								{t(`fpc_${k}`)}
							</label>
						))}
					</div>
					<Textarea
						rows={2}
						placeholder={t("fpcNote")}
						value={checklist.note ?? ""}
						onChange={(e) =>
							setD({
								...d,
								fitProperChecklist: { ...checklist, note: e.target.value },
							})
						}
					/>
				</fieldset>
			)}
		</FormDialog>
	);
}

// ── Geltungsbereich ────────────────────────────────────────────────────────
export type ScopeDraft = {
	id?: string;
	frameworkSlug?: string | null;
	statement: string;
	boundaries?: string | null;
	locations?: string[];
	services?: string[];
	exclusions?: { what: string; justification: string }[];
	version?: string;
	ownerUserId?: string | null;
};

export function ScopeForm({
	initial,
	members,
	frameworks,
}: {
	initial?: ScopeDraft;
	members: MemberOption[];
	frameworks: { slug: string; name: string }[];
}) {
	const t = useTranslations("Organisation");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [pending, start] = useTransition();
	const [d, setD] = useState<ScopeDraft>(
		initial ?? { statement: "", exclusions: [] },
	);
	const [loc, setLoc] = useState((initial?.locations ?? []).join(", "));
	const [srv, setSrv] = useState((initial?.services ?? []).join(", "));
	const split = (s: string) =>
		s
			.split(",")
			.map((x) => x.trim())
			.filter(Boolean);
	const exclusions = d.exclusions ?? [];
	return (
		<FormDialog
			title={initial ? t("editScope") : t("newScope")}
			lead={t("scopeFormLead")}
			trigger={initial ? <EditTrigger /> : <NewTrigger label={t("newScope")} />}
			open={open}
			setOpen={setOpen}
			pending={pending}
			disabled={d.statement.trim().length < 10}
			wide
			onSubmit={() =>
				start(async () => {
					const res = await upsertScope({
						...d,
						boundaries: d.boundaries ?? undefined,
						locations: split(loc),
						services: split(srv),
						exclusions: exclusions.filter((e) => e.what.trim()),
					});
					if (!res.ok) return void toast.error(errorText(tc, res));
					toast.success(t("saved"));
					setOpen(false);
					router.refresh();
				})
			}
		>
			<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
				<div className="flex flex-col gap-1.5">
					<Label>{t("framework")}</Label>
					<Select
						value={d.frameworkSlug ?? "none"}
						onValueChange={(v) =>
							setD({ ...d, frameworkSlug: v === "none" ? null : v })
						}
					>
						<SelectTrigger className="w-full">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="none">{t("allFrameworks")}</SelectItem>
							{frameworks.map((f) => (
								<SelectItem key={f.slug} value={f.slug}>
									{f.name}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
				<ResponsibleField
					label={t("owner")}
					value={d.ownerUserId}
					onChange={(v) => setD({ ...d, ownerUserId: v })}
					members={members}
				/>
			</div>
			<Field
				id="sc-stmt"
				label={t("statement")}
				value={d.statement}
				onChange={(v) => setD({ ...d, statement: v })}
				rows={3}
			/>
			<Field
				id="sc-bound"
				label={t("boundaries")}
				value={d.boundaries ?? ""}
				onChange={(v) => setD({ ...d, boundaries: v })}
				rows={2}
			/>
			<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
				<Field
					id="sc-loc"
					label={t("locations")}
					value={loc}
					onChange={setLoc}
				/>
				<Field
					id="sc-srv"
					label={t("services")}
					value={srv}
					onChange={setSrv}
				/>
			</div>
			<div className="flex flex-col gap-2">
				<div className="flex items-center justify-between">
					<Label>{t("exclusions")}</Label>
					<Button
						type="button"
						size="sm"
						variant="ghost"
						onClick={() =>
							setD({
								...d,
								exclusions: [...exclusions, { what: "", justification: "" }],
							})
						}
					>
						<Plus />
						{t("addExclusion")}
					</Button>
				</div>
				{exclusions.map((e, i) => (
					<div
						// biome-ignore lint/suspicious/noArrayIndexKey: editierbare Liste ohne natürliche ID
						key={`${i}-${exclusions.length}`}
						className="grid grid-cols-1 gap-2 sm:grid-cols-2"
					>
						<Input
							placeholder={t("exclusionWhat")}
							value={e.what}
							onChange={(ev) => {
								const next = [...exclusions];
								next[i] = { ...e, what: ev.target.value };
								setD({ ...d, exclusions: next });
							}}
						/>
						<Input
							placeholder={t("exclusionWhy")}
							value={e.justification}
							onChange={(ev) => {
								const next = [...exclusions];
								next[i] = { ...e, justification: ev.target.value };
								setD({ ...d, exclusions: next });
							}}
						/>
					</div>
				))}
			</div>
		</FormDialog>
	);
}

export function ScopeApproveButton({
	scopeId,
	soloHint,
}: {
	scopeId: string;
	soloHint?: boolean;
}) {
	const t = useTranslations("Organisation");
	const ts = useTranslations("Status");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [pending, start] = useTransition();
	const [reason, setReason] = useState("");
	return (
		<div className="flex flex-wrap items-center gap-2">
			{soloHint && (
				<Input
					className="w-64"
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
						const res = await requestScopeApproval({
							scopeId,
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
									: errorText(tc, res),
							);
						toast.success(
							res.data.status === "approved"
								? t("scopeApproved")
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

// ── Ziele & KPIs ───────────────────────────────────────────────────────────
export type ObjectiveDraft = {
	id?: string;
	title: string;
	frameworkIds?: string[];
	kpiName?: string | null;
	unit?: string | null;
	target?: string | null;
	dueAt?: string | null;
	ownerUserId?: string | null;
	status: "open" | "on_track" | "at_risk" | "achieved" | "dropped";
	indicatorType?: IndicatorType;
	direction?: IndicatorDirection;
	targetValue?: number | null;
	warnAt?: number | null;
	alertAt?: number | null;
	measureEveryMonths?: number | null;
	nextMeasureAt?: string | null;
	templateKey?: string | null;
};

const num = (v: string): number | null => {
	if (!v.trim()) return null;
	const n = Number(v.replace(",", "."));
	return Number.isFinite(n) ? n : null;
};

export function ObjectiveForm({
	initial,
	members,
	frameworks,
	soloHint,
}: {
	initial?: ObjectiveDraft;
	members: MemberOption[];
	frameworks: { slug: string; name: string }[];
	soloHint?: boolean;
}) {
	const t = useTranslations("Organisation");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [pending, start] = useTransition();
	const ts = useTranslations("Status");
	const [d, setD] = useState<ObjectiveDraft>(
		initial ?? {
			title: "",
			status: "open",
			frameworkIds: [],
			indicatorType: "kpi",
			direction: "higher_better",
		},
	);
	const [solo, setSolo] = useState("");
	const fws = new Set(d.frameworkIds ?? []);
	const applyTemplate = (key: string) => {
		const tpl = INDICATOR_TEMPLATES.find((x) => x.key === key);
		if (!tpl) return;
		setD({
			...d,
			templateKey: tpl.key,
			title: tpl.title,
			kpiName: tpl.kpiName,
			unit: tpl.unit,
			indicatorType: tpl.indicatorType,
			direction: tpl.direction,
			targetValue: tpl.targetValue,
			warnAt: tpl.warnAt,
			alertAt: tpl.alertAt,
			measureEveryMonths: tpl.measureEveryMonths,
			frameworkIds: tpl.frameworks.filter((f) =>
				frameworks.some((x) => x.slug === f),
			),
		});
	};
	return (
		<FormDialog
			title={initial ? t("editObjective") : t("newObjective")}
			lead={t("objectivesLead")}
			trigger={
				initial ? <EditTrigger /> : <NewTrigger label={t("newObjective")} />
			}
			open={open}
			setOpen={setOpen}
			pending={pending}
			disabled={!d.title.trim()}
			wide
			onSubmit={() =>
				start(async () => {
					const res = await upsertObjective({
						...d,
						kpiName: d.kpiName ?? undefined,
						unit: d.unit ?? undefined,
						target: d.target ?? undefined,
						dueAt: d.dueAt || null,
						nextMeasureAt: d.nextMeasureAt || null,
						selfApprovalReason: solo || undefined,
					});
					if (!res.ok) return void toast.error(errorText(tc, res));
					if (res.data.approval === "pending")
						toast.success(t("objectiveProposed"));
					else if (res.data.approval === "failed")
						toast.warning(
							ts(
								`approvalError_${res.data.approvalError ?? "no_approver"}` as "approvalError_no_approver",
							),
							{ duration: 12000 },
						);
					else toast.success(t("saved"));
					setOpen(false);
					router.refresh();
				})
			}
		>
			{!initial && (
				<div className="flex flex-col gap-1.5">
					<Label htmlFor="ob-tpl">{t("indicatorTemplate")}</Label>
					<Select onValueChange={applyTemplate}>
						<SelectTrigger id="ob-tpl" className="w-full">
							<SelectValue placeholder="—" />
						</SelectTrigger>
						<SelectContent>
							{INDICATOR_TEMPLATES.map((x) => (
								<SelectItem key={x.key} value={x.key}>
									{x.indicatorType.toUpperCase()} · {x.title}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
			)}
			<Field
				id="ob-title"
				label={t("titleField")}
				value={d.title}
				onChange={(v) => setD({ ...d, title: v })}
				required
			/>
			<div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
				<div className="flex flex-col gap-1.5">
					<Label htmlFor="ob-type">{t("indicatorType")}</Label>
					<Select
						value={d.indicatorType ?? "kpi"}
						onValueChange={(v) =>
							setD({
								...d,
								indicatorType: v as IndicatorType,
								direction: v === "kri" ? "lower_better" : "higher_better",
							})
						}
					>
						<SelectTrigger id="ob-type" className="w-full">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{(["kpi", "kri", "kci"] as const).map((x) => (
								<SelectItem key={x} value={x}>
									{t(`indicator_${x}`)}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
				<div className="flex flex-col gap-1.5">
					<Label htmlFor="ob-dir">{t("direction")}</Label>
					<Select
						value={d.direction ?? "higher_better"}
						onValueChange={(v) =>
							setD({ ...d, direction: v as IndicatorDirection })
						}
					>
						<SelectTrigger id="ob-dir" className="w-full">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="higher_better">
								{t("direction_higher_better")}
							</SelectItem>
							<SelectItem value="lower_better">
								{t("direction_lower_better")}
							</SelectItem>
						</SelectContent>
					</Select>
				</div>
				<div className="flex flex-col gap-1.5">
					<Label htmlFor="ob-int">{t("measureEvery")}</Label>
					<Select
						value={d.measureEveryMonths ? String(d.measureEveryMonths) : "none"}
						onValueChange={(v) =>
							setD({
								...d,
								measureEveryMonths: v === "none" ? null : Number(v),
							})
						}
					>
						<SelectTrigger id="ob-int" className="w-full">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="none">—</SelectItem>
							{[1, 3, 6, 12].map((m) => (
								<SelectItem key={m} value={String(m)}>
									{t("measureEveryMonths", { n: m })}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
				<Field
					id="ob-tv"
					label={t("targetValue")}
					type="number"
					value={d.targetValue?.toString() ?? ""}
					onChange={(v) => setD({ ...d, targetValue: num(v) })}
				/>
				<Field
					id="ob-warn"
					label={t("warnAt")}
					type="number"
					value={d.warnAt?.toString() ?? ""}
					onChange={(v) => setD({ ...d, warnAt: num(v) })}
				/>
				<Field
					id="ob-alert"
					label={t("alertAt")}
					type="number"
					value={d.alertAt?.toString() ?? ""}
					onChange={(v) => setD({ ...d, alertAt: num(v) })}
				/>
			</div>
			<p className="text-muted-foreground text-footnote">
				{t("indicatorHint")}
			</p>
			<div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
				<Field
					id="ob-kpi"
					label={t("kpiName")}
					value={d.kpiName ?? ""}
					onChange={(v) => setD({ ...d, kpiName: v })}
				/>
				<Field
					id="ob-target"
					label={t("targetText")}
					value={d.target ?? ""}
					onChange={(v) => setD({ ...d, target: v })}
				/>
				<Field
					id="ob-unit"
					label={t("unit")}
					value={d.unit ?? ""}
					onChange={(v) => setD({ ...d, unit: v })}
				/>
				<Field
					id="ob-due"
					label={t("dueAt")}
					type="date"
					value={d.dueAt ?? ""}
					onChange={(v) => setD({ ...d, dueAt: v })}
				/>
				<div className="flex flex-col gap-1.5">
					<Label>{t("status")}</Label>
					<Select
						value={d.status}
						onValueChange={(v) =>
							setD({ ...d, status: v as ObjectiveDraft["status"] })
						}
					>
						<SelectTrigger className="w-full">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{(
								["open", "on_track", "at_risk", "achieved", "dropped"] as const
							).map((s) => (
								<SelectItem key={s} value={s}>
									{t(`obj_${s}`)}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
				<ResponsibleField
					label={t("owner")}
					value={d.ownerUserId}
					onChange={(v) => setD({ ...d, ownerUserId: v })}
					members={members}
				/>
			</div>
			<fieldset className="flex flex-wrap gap-3 text-subhead">
				<legend className="font-medium text-footnote mb-1 text-footnote text-muted-foreground">
					{t("frameworks")}
				</legend>
				{frameworks.map((f) => (
					<label key={f.slug} className="flex items-center gap-2">
						<Checkbox
							checked={fws.has(f.slug)}
							onCheckedChange={(v) => {
								const next = new Set(fws);
								if (v) next.add(f.slug);
								else next.delete(f.slug);
								setD({ ...d, frameworkIds: [...next] });
							}}
						/>
						{f.name}
					</label>
				))}
			</fieldset>
			{soloHint && (
				<Field
					id="ob-solo"
					label={t("soloReason")}
					value={solo}
					onChange={setSolo}
					rows={2}
				/>
			)}
		</FormDialog>
	);
}

// Messung erfassen; mit Vorschlag aus Klick (C2) — übernehmen und speichern
// bestätigt den Wert, Klick trägt ihn nie selbst ein.
export function MeasurementForm({
	objectiveId,
	unit,
	suggestion,
}: {
	objectiveId: string;
	unit: string | null;
	suggestion?: MeasurementSuggestion | null;
}) {
	const t = useTranslations("Organisation");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [pending, start] = useTransition();
	const [value, setValue] = useState("");
	const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
	const fmt = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 });
	return (
		<div className="flex flex-col items-end gap-1">
			{suggestion && (
				<p className="flex flex-wrap items-center justify-end gap-2 text-muted-foreground text-footnote">
					<span>
						{t("suggestion", {
							value: `${fmt.format(suggestion.value)}${unit ? ` ${unit}` : ""}`,
						})}{" "}
						({t(`basis_${suggestion.basis.key}`, suggestion.basis)})
					</span>
					<Button
						type="button"
						size="sm"
						variant="ghost"
						className="h-(--control-h-sm)"
						onClick={() => setValue(fmt.format(suggestion.value))}
					>
						{t("suggestionApply")}
					</Button>
				</p>
			)}
			<form
				className="flex flex-wrap items-center gap-2"
				onSubmit={(e) => {
					e.preventDefault();
					start(async () => {
						const res = await addKpiMeasurement({
							objectiveId,
							measuredAt: date,
							value,
						});
						if (!res.ok) return void toast.error(errorText(tc, res));
						if (res.data.escalated)
							toast.warning(
								t("measurementEscalated", { code: res.data.escalated }),
								{ duration: 12000 },
							);
						else if (res.data.state === "alert")
							toast.warning(t("measurementAlert"));
						else if (res.data.state === "warn")
							toast.warning(t("measurementWarn"));
						else toast.success(t("saved"));
						setValue("");
						router.refresh();
					});
				}}
			>
				<Input
					type="date"
					aria-label={t("measuredAt")}
					className="w-36"
					value={date}
					onChange={(e) => setDate(e.target.value)}
				/>
				<Input
					aria-label={unit ? `${t("value")} (${unit})` : t("value")}
					inputMode="decimal"
					autoComplete="off"
					className="w-28"
					placeholder={unit ? `${t("value")} (${unit})` : t("value")}
					value={value}
					onChange={(e) => setValue(e.target.value)}
				/>
				<Button
					size="sm"
					variant="outline"
					type="submit"
					disabled={pending || !value.trim()}
				>
					<Plus />
					{t("addMeasurement")}
				</Button>
			</form>
		</div>
	);
}
