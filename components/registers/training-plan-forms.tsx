"use client";

import { CheckCircle2, ExternalLink, UserPlus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
	assignTraining,
	completeMyTraining,
	unassignTraining,
	upsertTrainingRequirement,
} from "@/app/actions/trainings";
import type { MemberOption } from "@/components/entity/owner-assignee";
import {
	EditTrigger,
	Field,
	FormDialog,
	FunctionSelect,
	NewTrigger,
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
import type { RoleFunction } from "@/db/schema/enums";
import { TRAINING_ORG_ROLES } from "@/lib/validation/registers";

type OrgRoleOption = (typeof TRAINING_ORG_ROLES)[number];

export type RequirementDraft = {
	id?: string;
	title: string;
	description?: string | null;
	courseUrl?: string | null;
	frequencyMonths: number;
	function?: RoleFunction | null;
	orgRole?: string | null;
	legalBasis?: string | null;
};

function inDays(days: number): string {
	return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}

// Link zur Schulung — öffnet in neuem Tab, ohne Referrer/Opener.
export function CourseLink({ url }: { url: string | null | undefined }) {
	const t = useTranslations("Trainings");
	if (!url) return null;
	return (
		<a
			href={url}
			target="_blank"
			rel="noopener noreferrer"
			className="inline-flex items-center gap-1 text-primary text-xs hover:underline"
		>
			<ExternalLink className="size-3" />
			{t("openCourse")}
		</a>
	);
}

export function RequirementForm({
	initial,
	functionLabels,
}: {
	initial?: RequirementDraft;
	functionLabels: Record<string, string>;
}) {
	const t = useTranslations("Trainings");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [pending, start] = useTransition();
	const [d, setD] = useState<RequirementDraft>(
		initial ?? { title: "", frequencyMonths: 12, orgRole: "all" },
	);
	const set = <K extends keyof RequirementDraft>(
		k: K,
		v: RequirementDraft[K],
	) => setD((x) => ({ ...x, [k]: v }));
	return (
		<FormDialog
			title={initial ? t("editRequirement") : t("newRequirement")}
			lead={t("requirementLead")}
			trigger={
				initial ? <EditTrigger /> : <NewTrigger label={t("newRequirement")} />
			}
			open={open}
			setOpen={setOpen}
			pending={pending}
			disabled={!d.title.trim()}
			onSubmit={() =>
				start(async () => {
					const res = await upsertTrainingRequirement({
						...d,
						courseUrl: d.courseUrl?.trim() || null,
					});
					if (!res.ok)
						return void toast.error(
							res.error === "validation" || res.error.includes("url")
								? t("invalidUrl")
								: tc("error"),
						);
					toast.success(t("saved"));
					setOpen(false);
					router.refresh();
				})
			}
		>
			<Field
				id="req-title"
				label={t("titleField")}
				value={d.title}
				onChange={(v) => set("title", v)}
				required
			/>
			<Field
				id="req-desc"
				label={t("description")}
				value={d.description ?? ""}
				onChange={(v) => set("description", v)}
				rows={2}
			/>
			<Field
				id="req-url"
				label={t("courseUrl")}
				type="url"
				value={d.courseUrl ?? ""}
				onChange={(v) => set("courseUrl", v)}
			/>
			<div className="grid gap-4 sm:grid-cols-3">
				<Field
					id="req-freq"
					label={t("frequencyMonths")}
					type="number"
					value={String(d.frequencyMonths)}
					onChange={(v) => set("frequencyMonths", Number(v) || 12)}
				/>
				<div className="flex flex-col gap-1.5">
					<Label>{t("audienceRole")}</Label>
					<Select
						value={d.orgRole ?? "none"}
						onValueChange={(v) =>
							set("orgRole", v === "none" ? null : (v as OrgRoleOption))
						}
					>
						<SelectTrigger className="w-full">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="none">—</SelectItem>
							{TRAINING_ORG_ROLES.map((r) => (
								<SelectItem key={r} value={r}>
									{t(`orgRole_${r}`)}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
				<FunctionSelect
					label={t("audienceFunction")}
					value={d.function}
					onChange={(v) => set("function", v)}
					labels={functionLabels}
					allowNone
				/>
			</div>
			<Field
				id="req-legal"
				label={t("legalBasis")}
				value={d.legalBasis ?? ""}
				onChange={(v) => set("legalBasis", v)}
			/>
		</FormDialog>
	);
}

export function AssignTrainingForm({
	requirementId,
	title,
	members,
	assignedUserIds,
}: {
	requirementId: string;
	title: string;
	members: MemberOption[];
	assignedUserIds: string[];
}) {
	const t = useTranslations("Trainings");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [pending, start] = useTransition();
	const [picked, setPicked] = useState<Set<string>>(new Set());
	const [dueAt, setDueAt] = useState(inDays(30));
	const assigned = new Set(assignedUserIds);
	return (
		<FormDialog
			title={t("assignTitle", { title })}
			lead={t("assignLead")}
			trigger={
				<Button
					size="sm"
					variant="ghost"
					className="normal-case tracking-normal"
				>
					<UserPlus />
					{t("assign")}
				</Button>
			}
			open={open}
			setOpen={setOpen}
			pending={pending}
			disabled={picked.size === 0 || !dueAt}
			onSubmit={() =>
				start(async () => {
					const res = await assignTraining({
						requirementId,
						userIds: [...picked],
						dueAt,
					});
					if (!res.ok) return void toast.error(tc("error"));
					toast.success(t("assigned", { n: res.data.assigned }));
					setPicked(new Set());
					setOpen(false);
					router.refresh();
				})
			}
		>
			<Field
				id={`due-${requirementId}`}
				label={t("dueAt")}
				type="date"
				value={dueAt}
				onChange={setDueAt}
				required
			/>
			<div className="flex flex-col gap-2">
				<div className="flex items-center justify-between">
					<Label>{t("people")}</Label>
					<Button
						type="button"
						size="sm"
						variant="ghost"
						className="normal-case tracking-normal"
						onClick={() => setPicked(new Set(members.map((m) => m.userId)))}
					>
						{t("selectAll")}
					</Button>
				</div>
				<div className="grid max-h-64 gap-1.5 overflow-y-auto sm:grid-cols-2">
					{members.map((m) => (
						<label
							key={m.userId}
							htmlFor={`as-${requirementId}-${m.userId}`}
							className="flex items-center gap-2 text-sm"
						>
							<Checkbox
								id={`as-${requirementId}-${m.userId}`}
								checked={picked.has(m.userId)}
								onCheckedChange={(v) => {
									const n = new Set(picked);
									if (v) n.add(m.userId);
									else n.delete(m.userId);
									setPicked(n);
								}}
							/>
							<span>{m.name}</span>
							{assigned.has(m.userId) && (
								<span className="text-muted-foreground text-xs">
									({t("alreadyAssigned")})
								</span>
							)}
						</label>
					))}
				</div>
			</div>
		</FormDialog>
	);
}

export function CompleteTrainingButton({
	assignmentId,
	title,
}: {
	assignmentId: string;
	title: string;
}) {
	const t = useTranslations("Trainings");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [pending, start] = useTransition();
	const [note, setNote] = useState("");
	return (
		<FormDialog
			title={t("completeTitle", { title })}
			lead={t("completeLead")}
			trigger={
				<Button size="sm" variant="outline">
					<CheckCircle2 />
					{t("complete")}
				</Button>
			}
			open={open}
			setOpen={setOpen}
			pending={pending}
			onSubmit={() =>
				start(async () => {
					const res = await completeMyTraining({
						assignmentId,
						note: note.trim() || undefined,
					});
					if (!res.ok) return void toast.error(tc("error"));
					toast.success(
						res.data.nextDueAt
							? t("completedNext", { date: res.data.nextDueAt })
							: t("completed"),
					);
					setNote("");
					setOpen(false);
					router.refresh();
				})
			}
		>
			<Field
				id={`note-${assignmentId}`}
				label={t("completeNote")}
				value={note}
				onChange={setNote}
				rows={3}
			/>
		</FormDialog>
	);
}

export function UnassignButton({ assignmentId }: { assignmentId: string }) {
	const t = useTranslations("Trainings");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [pending, start] = useTransition();
	return (
		<Button
			size="icon"
			variant="ghost"
			aria-label={t("unassign")}
			title={t("unassign")}
			disabled={pending}
			onClick={() =>
				start(async () => {
					const res = await unassignTraining({ id: assignmentId });
					if (!res.ok) return void toast.error(tc("error"));
					router.refresh();
				})
			}
		>
			<X />
		</Button>
	);
}
