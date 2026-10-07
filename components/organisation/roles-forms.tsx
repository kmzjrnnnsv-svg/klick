"use client";

import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
	addKpiMeasurement,
	requestScopeApproval,
	upsertObjective,
	upsertRoleAssignment,
	upsertScope,
} from "@/app/actions/organisation";
import type { MemberOption } from "@/components/entity/owner-assignee";
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
import type { RoleFunction } from "@/db/schema/enums";
import type { FitProperChecklist } from "@/lib/validation/governance";
import {
	EditTrigger,
	Field,
	FormDialog,
	FunctionSelect,
	NewTrigger,
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
}: {
	initial?: RoleAssignmentDraft;
	members: MemberOption[];
	functionLabels: Record<string, string>;
	presetFunction?: RoleFunction;
	triggerLabel?: string;
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
					<NewTrigger label={triggerLabel ?? t("newAssignment")} />
				)
			}
			open={open}
			setOpen={setOpen}
			pending={pending}
			disabled={mode === "person" ? !d.userId : !d.externalName?.trim()}
			wide
			onSubmit={() =>
				start(async () => {
					const res = await upsertRoleAssignment({
						...d,
						userId: mode === "person" ? d.userId : null,
						externalName: mode === "external" ? d.externalName : null,
						appointedAt: d.appointedAt || null,
						documentsValidUntil: d.documentsValidUntil || null,
						reviewAt: d.reviewAt || null,
						fitProperChecklist: showFitProper ? checklist : null,
					});
					if (!res.ok)
						return void toast.error(
							res.error === "step_up_required" ? t("stepUp") : tc("error"),
						);
					toast.success(t("saved"));
					setOpen(false);
					router.refresh();
				})
			}
		>
			<div className="grid gap-4 sm:grid-cols-2">
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
			{showFitProper && (
				<fieldset className="flex flex-col gap-2 rounded-md border p-3">
					<legend className="lv-eyebrow px-1 text-[0.52rem] text-muted-foreground">
						{t("fitProperChecklist")}
					</legend>
					<p className="text-muted-foreground text-xs">{t("fitProperLead")}</p>
					<div className="grid gap-2 sm:grid-cols-2">
						{CHECKLIST_KEYS.map((k) => (
							<label key={k} className="flex items-center gap-2 text-sm">
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
					if (!res.ok) return void toast.error(tc("error"));
					toast.success(t("saved"));
					setOpen(false);
					router.refresh();
				})
			}
		>
			<div className="grid gap-4 sm:grid-cols-2">
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
				<UserSelect
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
			<div className="grid gap-4 sm:grid-cols-2">
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
						className="grid gap-2 sm:grid-cols-2"
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
					className="h-8 w-64"
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
									: tc("error"),
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
};

export function ObjectiveForm({
	initial,
	members,
	frameworks,
}: {
	initial?: ObjectiveDraft;
	members: MemberOption[];
	frameworks: { slug: string; name: string }[];
}) {
	const t = useTranslations("Organisation");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [pending, start] = useTransition();
	const [d, setD] = useState<ObjectiveDraft>(
		initial ?? { title: "", status: "open", frameworkIds: [] },
	);
	const fws = new Set(d.frameworkIds ?? []);
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
					});
					if (!res.ok) return void toast.error(tc("error"));
					toast.success(t("saved"));
					setOpen(false);
					router.refresh();
				})
			}
		>
			<Field
				id="ob-title"
				label={t("titleField")}
				value={d.title}
				onChange={(v) => setD({ ...d, title: v })}
				required
			/>
			<div className="grid gap-4 sm:grid-cols-3">
				<Field
					id="ob-kpi"
					label={t("kpiName")}
					value={d.kpiName ?? ""}
					onChange={(v) => setD({ ...d, kpiName: v })}
				/>
				<Field
					id="ob-target"
					label={t("target")}
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
				<UserSelect
					label={t("owner")}
					value={d.ownerUserId}
					onChange={(v) => setD({ ...d, ownerUserId: v })}
					members={members}
				/>
			</div>
			<fieldset className="flex flex-wrap gap-3 text-sm">
				<legend className="lv-eyebrow mb-1 text-[0.52rem] text-muted-foreground">
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
		</FormDialog>
	);
}

export function MeasurementForm({
	objectiveId,
	unit,
}: {
	objectiveId: string;
	unit: string | null;
}) {
	const t = useTranslations("Organisation");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [pending, start] = useTransition();
	const [value, setValue] = useState("");
	const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
	return (
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
					if (!res.ok) return void toast.error(tc("error"));
					toast.success(t("saved"));
					setValue("");
					router.refresh();
				});
			}}
		>
			<Input
				type="date"
				className="h-8 w-36"
				value={date}
				onChange={(e) => setDate(e.target.value)}
			/>
			<Input
				className="h-8 w-28"
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
	);
}
