"use client";

import { Check, Plus, Trash2, Wrench, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
	addProgrammeItem,
	createAuditRequest,
	createFinding,
	decideAuditRequest,
	findingToNonconformity,
	removeProgrammeItem,
	respondAuditRequest,
	setAuditStatus,
	setFindingStatus,
	upsertAudit,
	upsertProgramme,
} from "@/app/actions/audits";
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
	AUDIT_STATUSES,
	AUDIT_TYPES,
	FINDING_SEVERITIES,
	FINDING_STATUSES,
} from "@/lib/validation/governance";

function useRun(setOpen?: (o: boolean) => void) {
	const tc = useTranslations("Common");
	const t = useTranslations("Audits");
	const router = useRouter();
	const [pending, start] = useTransition();
	const run = (
		fn: () => Promise<{ ok: boolean; error?: string }>,
		okMessage = t("saved"),
	) =>
		start(async () => {
			const res = await fn();
			if (!res.ok) return void toast.error(tc("error"));
			toast.success(okMessage);
			setOpen?.(false);
			router.refresh();
		});
	return { pending, run };
}

// ── Programm ───────────────────────────────────────────────────────────────
export function ProgrammeForm({
	initial,
}: {
	initial?: {
		id: string;
		title: string;
		cycleStart: string;
		cycleYears: number;
	};
}) {
	const t = useTranslations("Audits");
	const [open, setOpen] = useState(false);
	const [title, setTitle] = useState(initial?.title ?? "");
	const [cycleStart, setCycleStart] = useState(
		initial?.cycleStart ?? `${new Date().getFullYear()}-01-01`,
	);
	const [cycleYears, setCycleYears] = useState(
		String(initial?.cycleYears ?? 3),
	);
	const { pending, run } = useRun(setOpen);
	return (
		<FormDialog
			title={initial ? t("editProgramme") : t("newProgramme")}
			lead={t("programmeFormLead")}
			trigger={
				initial ? <EditTrigger /> : <NewTrigger label={t("newProgramme")} />
			}
			open={open}
			setOpen={setOpen}
			pending={pending}
			disabled={!title.trim()}
			onSubmit={() =>
				run(() =>
					upsertProgramme({
						id: initial?.id,
						title,
						cycleStart,
						cycleYears: Number(cycleYears),
					}),
				)
			}
		>
			<Field
				id="ap-title"
				label={t("titleField")}
				value={title}
				onChange={setTitle}
				required
			/>
			<div className="grid gap-4 sm:grid-cols-2">
				<Field
					id="ap-start"
					label={t("cycleStart")}
					type="date"
					value={cycleStart}
					onChange={setCycleStart}
				/>
				<Field
					id="ap-years"
					label={t("cycleYears")}
					type="number"
					value={cycleYears}
					onChange={setCycleYears}
				/>
			</div>
		</FormDialog>
	);
}

export type ScopeOption = { type: string; ref: string; label: string };

export function ProgrammeItemForm({
	programmeId,
	options,
	years,
}: {
	programmeId: string;
	options: ScopeOption[];
	years: number[];
}) {
	const t = useTranslations("Audits");
	const [open, setOpen] = useState(false);
	const [choice, setChoice] = useState("");
	const [year, setYear] = useState(
		String(years[0] ?? new Date().getFullYear()),
	);
	const [rating, setRating] = useState<"low" | "medium" | "high">("medium");
	const { pending, run } = useRun(setOpen);
	const opt = options.find((o) => `${o.type}:${o.ref}` === choice);
	return (
		<FormDialog
			title={t("addItem")}
			lead={t("itemLead")}
			trigger={
				<Button size="sm" variant="outline">
					<Plus />
					{t("addItem")}
				</Button>
			}
			open={open}
			setOpen={setOpen}
			pending={pending}
			disabled={!opt}
			onSubmit={() =>
				opt &&
				run(() =>
					addProgrammeItem({
						programmeId,
						scopeType: opt.type,
						scopeRef: opt.ref,
						plannedYear: Number(year),
						riskRating: rating,
					}),
				)
			}
		>
			<div className="flex flex-col gap-1.5">
				<Label>{t("scopeItem")}</Label>
				<Select value={choice} onValueChange={setChoice}>
					<SelectTrigger className="w-full">
						<SelectValue placeholder="—" />
					</SelectTrigger>
					<SelectContent>
						{options.map((o) => (
							<SelectItem
								key={`${o.type}:${o.ref}`}
								value={`${o.type}:${o.ref}`}
							>
								{t(`scope_${o.type}` as "scope_domain")} · {o.label}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>
			<div className="grid gap-4 sm:grid-cols-2">
				<div className="flex flex-col gap-1.5">
					<Label>{t("plannedYear")}</Label>
					<Select value={year} onValueChange={setYear}>
						<SelectTrigger className="w-full">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{years.map((y) => (
								<SelectItem key={y} value={String(y)}>
									{y}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
				<div className="flex flex-col gap-1.5">
					<Label>{t("riskRating")}</Label>
					<Select
						value={rating}
						onValueChange={(v) => setRating(v as typeof rating)}
					>
						<SelectTrigger className="w-full">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{(["low", "medium", "high"] as const).map((r) => (
								<SelectItem key={r} value={r}>
									{t(`rating_${r}`)}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
			</div>
		</FormDialog>
	);
}

export function RemoveItemButton({ id }: { id: string }) {
	const tc = useTranslations("Common");
	const { pending, run } = useRun();
	return (
		<Button
			size="icon"
			variant="ghost"
			aria-label={tc("delete")}
			disabled={pending}
			onClick={() => run(() => removeProgrammeItem({ id }))}
		>
			<Trash2 />
		</Button>
	);
}

// ── Audit ──────────────────────────────────────────────────────────────────
export type AuditDraft = {
	id?: string;
	programmeId?: string | null;
	type: (typeof AUDIT_TYPES)[number];
	title: string;
	scope?: string | null;
	periodStart?: string | null;
	periodEnd?: string | null;
	frameworkIds?: string[];
	auditorMemberIds?: string[];
	externalAuditor?: string | null;
	plannedAt?: string | null;
	ownerUserId?: string | null;
};

export function AuditForm({
	initial,
	members,
	frameworks,
	programmes,
}: {
	initial?: AuditDraft;
	members: MemberOption[];
	frameworks: { slug: string; name: string }[];
	programmes: { id: string; title: string }[];
}) {
	const t = useTranslations("Audits");
	const [open, setOpen] = useState(false);
	const [d, setD] = useState<AuditDraft>(
		initial ?? {
			type: "internal",
			title: "",
			frameworkIds: [],
			auditorMemberIds: [],
		},
	);
	const { pending, run } = useRun(setOpen);
	const fws = new Set(d.frameworkIds ?? []);
	const auditors = new Set(d.auditorMemberIds ?? []);
	return (
		<FormDialog
			title={initial ? t("editAudit") : t("newAudit")}
			lead={t("auditFormLead")}
			trigger={initial ? <EditTrigger /> : <NewTrigger label={t("newAudit")} />}
			open={open}
			setOpen={setOpen}
			pending={pending}
			disabled={!d.title.trim()}
			wide
			onSubmit={() =>
				run(() =>
					upsertAudit({
						...d,
						scope: d.scope ?? undefined,
						externalAuditor: d.externalAuditor ?? undefined,
						periodStart: d.periodStart || null,
						periodEnd: d.periodEnd || null,
						plannedAt: d.plannedAt || null,
					}),
				)
			}
		>
			<Field
				id="au-title"
				label={t("titleField")}
				value={d.title}
				onChange={(v) => setD({ ...d, title: v })}
				required
			/>
			<div className="grid gap-4 sm:grid-cols-2">
				<div className="flex flex-col gap-1.5">
					<Label>{t("type")}</Label>
					<Select
						value={d.type}
						onValueChange={(v) => setD({ ...d, type: v as AuditDraft["type"] })}
					>
						<SelectTrigger className="w-full">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{AUDIT_TYPES.map((x) => (
								<SelectItem key={x} value={x}>
									{t(`type_${x}`)}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
				<div className="flex flex-col gap-1.5">
					<Label>{t("programme")}</Label>
					<Select
						value={d.programmeId ?? "none"}
						onValueChange={(v) =>
							setD({ ...d, programmeId: v === "none" ? null : v })
						}
					>
						<SelectTrigger className="w-full">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="none">—</SelectItem>
							{programmes.map((p) => (
								<SelectItem key={p.id} value={p.id}>
									{p.title}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
				<Field
					id="au-planned"
					label={t("plannedAt")}
					type="date"
					value={d.plannedAt ?? ""}
					onChange={(v) => setD({ ...d, plannedAt: v })}
				/>
				<UserSelect
					label={t("owner")}
					value={d.ownerUserId}
					onChange={(v) => setD({ ...d, ownerUserId: v })}
					members={members}
				/>
				<Field
					id="au-ps"
					label={t("periodStart")}
					type="date"
					value={d.periodStart ?? ""}
					onChange={(v) => setD({ ...d, periodStart: v })}
				/>
				<Field
					id="au-pe"
					label={t("periodEnd")}
					type="date"
					value={d.periodEnd ?? ""}
					onChange={(v) => setD({ ...d, periodEnd: v })}
				/>
				<Field
					id="au-ext"
					label={t("externalAuditor")}
					value={d.externalAuditor ?? ""}
					onChange={(v) => setD({ ...d, externalAuditor: v })}
				/>
			</div>
			<Field
				id="au-scope"
				label={t("scope")}
				value={d.scope ?? ""}
				onChange={(v) => setD({ ...d, scope: v })}
				rows={2}
			/>
			<div className="grid gap-4 sm:grid-cols-2">
				<fieldset className="flex flex-col gap-1.5 text-sm">
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
				<fieldset className="flex flex-col gap-1.5 text-sm">
					<legend className="lv-eyebrow mb-1 text-[0.52rem] text-muted-foreground">
						{t("auditors")}
					</legend>
					{members.map((m) => (
						<label key={m.userId} className="flex items-center gap-2">
							<Checkbox
								checked={auditors.has(m.userId)}
								onCheckedChange={(v) => {
									const next = new Set(auditors);
									if (v) next.add(m.userId);
									else next.delete(m.userId);
									setD({ ...d, auditorMemberIds: [...next] });
								}}
							/>
							{m.name}
						</label>
					))}
				</fieldset>
			</div>
		</FormDialog>
	);
}

export function AuditStatusSelect({
	auditId,
	status,
}: {
	auditId: string;
	status: (typeof AUDIT_STATUSES)[number];
}) {
	const t = useTranslations("Audits");
	const { pending, run } = useRun();
	return (
		<Select
			value={status}
			disabled={pending}
			onValueChange={(v) => run(() => setAuditStatus({ auditId, status: v }))}
		>
			<SelectTrigger className="h-8 w-44">
				<SelectValue />
			</SelectTrigger>
			<SelectContent>
				{AUDIT_STATUSES.map((s) => (
					<SelectItem key={s} value={s}>
						{t(`status_${s}`)}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}

// ── Findings ───────────────────────────────────────────────────────────────
export function FindingForm({
	auditId,
	controlOptions,
}: {
	auditId: string;
	controlOptions: { code: string; title: string }[];
}) {
	const t = useTranslations("Audits");
	const [open, setOpen] = useState(false);
	const [title, setTitle] = useState("");
	const [description, setDescription] = useState("");
	const [severity, setSeverity] =
		useState<(typeof FINDING_SEVERITIES)[number]>("minor");
	const [control, setControl] = useState("none");
	const { pending, run } = useRun(setOpen);
	return (
		<FormDialog
			title={t("newFinding")}
			lead={t("findingLead")}
			trigger={<NewTrigger label={t("newFinding")} />}
			open={open}
			setOpen={setOpen}
			pending={pending}
			disabled={!title.trim()}
			onSubmit={() =>
				run(() =>
					createFinding({
						auditId,
						title,
						description: description || undefined,
						severity,
						controlCode: control === "none" ? null : control,
					}),
				)
			}
		>
			<Field
				id="fd-title"
				label={t("titleField")}
				value={title}
				onChange={setTitle}
				required
			/>
			<div className="grid gap-4 sm:grid-cols-2">
				<div className="flex flex-col gap-1.5">
					<Label>{t("severity")}</Label>
					<Select
						value={severity}
						onValueChange={(v) => setSeverity(v as typeof severity)}
					>
						<SelectTrigger className="w-full">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{FINDING_SEVERITIES.map((s) => (
								<SelectItem key={s} value={s}>
									{t(`severity_${s}`)}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
				<div className="flex flex-col gap-1.5">
					<Label>Control</Label>
					<Select value={control} onValueChange={setControl}>
						<SelectTrigger className="w-full">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="none">—</SelectItem>
							{controlOptions.map((c) => (
								<SelectItem key={c.code} value={c.code}>
									{c.code} · {c.title}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
			</div>
			<Field
				id="fd-desc"
				label={t("description")}
				value={description}
				onChange={setDescription}
				rows={3}
			/>
		</FormDialog>
	);
}

export function FindingStatusSelect({
	findingId,
	status,
	disabled,
}: {
	findingId: string;
	status: (typeof FINDING_STATUSES)[number];
	disabled?: boolean;
}) {
	const t = useTranslations("Audits");
	const { pending, run } = useRun();
	return (
		<Select
			value={status}
			disabled={pending || disabled}
			onValueChange={(v) =>
				run(() => setFindingStatus({ findingId, status: v }))
			}
		>
			<SelectTrigger className="h-8 w-40">
				<SelectValue />
			</SelectTrigger>
			<SelectContent>
				{FINDING_STATUSES.map((s) => (
					<SelectItem key={s} value={s}>
						{t(`fstatus_${s}`)}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}

export function FindingToNcButton({ findingId }: { findingId: string }) {
	const t = useTranslations("Audits");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [pending, start] = useTransition();
	return (
		<Button
			size="sm"
			variant="outline"
			disabled={pending}
			onClick={() =>
				start(async () => {
					const res = await findingToNonconformity({ findingId });
					if (!res.ok) return void toast.error(tc("error"));
					toast.success(t("ncCreated", { code: res.data.code }));
					router.refresh();
				})
			}
		>
			<Wrench />
			{t("toNonconformity")}
		</Button>
	);
}

// ── Nachweisanfragen (PBC) ─────────────────────────────────────────────────
export function AuditRequestForm({
	auditId,
	members,
	controlOptions,
}: {
	auditId: string;
	members: MemberOption[];
	controlOptions: { code: string; title: string }[];
}) {
	const t = useTranslations("Audits");
	const [open, setOpen] = useState(false);
	const [title, setTitle] = useState("");
	const [description, setDescription] = useState("");
	const [assignee, setAssignee] = useState<string | null>(null);
	const [dueAt, setDueAt] = useState("");
	const [control, setControl] = useState("none");
	const { pending, run } = useRun(setOpen);
	return (
		<FormDialog
			title={t("newRequest")}
			lead={t("requestLead")}
			trigger={<NewTrigger label={t("newRequest")} />}
			open={open}
			setOpen={setOpen}
			pending={pending}
			disabled={!title.trim()}
			onSubmit={() =>
				run(
					() =>
						createAuditRequest({
							auditId,
							title,
							description: description || undefined,
							assigneeUserId: assignee,
							dueAt: dueAt || null,
							controlCode: control === "none" ? null : control,
						}),
					t("requestCreated"),
				)
			}
		>
			<Field
				id="rq-title"
				label={t("titleField")}
				value={title}
				onChange={setTitle}
				required
			/>
			<Field
				id="rq-desc"
				label={t("description")}
				value={description}
				onChange={setDescription}
				rows={2}
			/>
			<div className="grid gap-4 sm:grid-cols-2">
				<UserSelect
					label={t("assignee")}
					value={assignee}
					onChange={setAssignee}
					members={members}
				/>
				<Field
					id="rq-due"
					label={t("dueAt")}
					type="date"
					value={dueAt}
					onChange={setDueAt}
				/>
				<div className="flex flex-col gap-1.5 sm:col-span-2">
					<Label>Control</Label>
					<Select value={control} onValueChange={setControl}>
						<SelectTrigger className="w-full">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="none">—</SelectItem>
							{controlOptions.map((c) => (
								<SelectItem key={c.code} value={c.code}>
									{c.code} · {c.title}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
			</div>
		</FormDialog>
	);
}

export function RespondRequestForm({
	requestId,
	evidence,
}: {
	requestId: string;
	evidence: { id: string; title: string }[];
}) {
	const t = useTranslations("Audits");
	const [open, setOpen] = useState(false);
	const [note, setNote] = useState("");
	const [picked, setPicked] = useState<Set<string>>(new Set());
	const { pending, run } = useRun(setOpen);
	return (
		<FormDialog
			title={t("respond")}
			lead={t("respondLead")}
			trigger={
				<Button size="sm" variant="brown">
					{t("respond")}
				</Button>
			}
			open={open}
			setOpen={setOpen}
			pending={pending}
			disabled={!note.trim()}
			onSubmit={() =>
				run(
					() =>
						respondAuditRequest({
							requestId,
							responseNote: note,
							responseEvidenceIds: [...picked],
						}),
					t("responded"),
				)
			}
		>
			<div className="flex flex-col gap-1.5">
				<Label htmlFor={`rs-${requestId}`}>{t("responseNote")}</Label>
				<Textarea
					id={`rs-${requestId}`}
					rows={4}
					value={note}
					onChange={(e) => setNote(e.target.value)}
				/>
			</div>
			<fieldset className="flex max-h-48 flex-col gap-1 overflow-y-auto rounded-md border p-2 text-sm">
				<legend className="lv-eyebrow px-1 text-[0.52rem] text-muted-foreground">
					{t("attachEvidence")}
				</legend>
				{evidence.length === 0 ? (
					<p className="text-muted-foreground text-xs">—</p>
				) : (
					evidence.map((e) => (
						<label key={e.id} className="flex items-center gap-2">
							<Checkbox
								checked={picked.has(e.id)}
								onCheckedChange={(v) => {
									const next = new Set(picked);
									if (v) next.add(e.id);
									else next.delete(e.id);
									setPicked(next);
								}}
							/>
							<span className="truncate">{e.title}</span>
						</label>
					))
				)}
			</fieldset>
		</FormDialog>
	);
}

export function DecideRequestButtons({ requestId }: { requestId: string }) {
	const t = useTranslations("Audits");
	const [note, setNote] = useState("");
	const { pending, run } = useRun();
	return (
		<div className="flex flex-wrap items-center gap-2">
			<Button
				size="sm"
				disabled={pending}
				onClick={() =>
					run(
						() => decideAuditRequest({ requestId, decision: "accepted" }),
						t("accepted"),
					)
				}
			>
				<Check />
				{t("accept")}
			</Button>
			<Textarea
				rows={1}
				className="min-h-8 w-56 py-1 text-xs"
				placeholder={t("rejectNote")}
				value={note}
				onChange={(e) => setNote(e.target.value)}
			/>
			<Button
				size="sm"
				variant="outline"
				disabled={pending || !note.trim()}
				onClick={() =>
					run(
						() => decideAuditRequest({ requestId, decision: "rejected", note }),
						t("rejected"),
					)
				}
			>
				<X />
				{t("reject")}
			</Button>
		</div>
	);
}
