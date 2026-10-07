"use client";

import { ListTodo, Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
	applyRoadmapTemplate,
	createTaskFromMilestone,
	moveMilestone,
	upsertMilestone,
} from "@/app/actions/milestones";
import type { MemberOption } from "@/components/entity/owner-assignee";
import { UserChip } from "@/components/entity/user-chip";
import {
	EditTrigger,
	Field,
	FormDialog,
	NewTrigger,
	UserSelect,
} from "@/components/organisation/governance-forms";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { KanbanBoard } from "@/components/ui/kanban/board";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { LICENCE_STAGES, type LicenceStage } from "@/db/schema/enums";
import { ROADMAP_PHASES } from "@/lib/compliance/catalog/roadmap";

export type MilestoneCard = {
	id: string;
	title: string;
	description: string | null;
	phase: string | null;
	status: "todo" | "doing" | "done";
	dueAt: string | null;
	ownerUserId: string | null;
	ownerName: string | null;
	assigneeUserId: string | null;
	assigneeName: string | null;
	sortOrder: number;
	controlCodes: string[];
	openTasks: number;
};

const fmt = new Intl.DateTimeFormat("de-DE", {
	dateStyle: "medium",
	timeZone: "Europe/Berlin",
});

export function RoadmapBoard({
	items,
	members,
	canEdit,
}: {
	items: MilestoneCard[];
	members: MemberOption[];
	canEdit: boolean;
}) {
	const t = useTranslations("Roadmap");
	const tc = useTranslations("Common");
	const router = useRouter();
	const today = new Date().toISOString().slice(0, 10);
	const phaseTitle = (p: string | null) =>
		ROADMAP_PHASES.find((x) => x.key === p)?.title ?? p ?? "";
	return (
		<KanbanBoard
			columns={[
				{ key: "todo", title: t("col_todo") },
				{ key: "doing", title: t("col_doing") },
				{ key: "done", title: t("col_done") },
			]}
			items={items.map((m) => ({ ...m, column: m.status }))}
			disabled={!canEdit}
			onMove={async ({ id, column, orderedIds }) => {
				const res = await moveMilestone({
					id,
					status: column as "todo" | "doing" | "done",
					orderedIds,
				});
				if (!res.ok) toast.error(tc("error"));
				router.refresh();
			}}
			renderCard={(m) => (
				<div className="flex flex-col gap-2">
					<div className="flex items-start justify-between gap-2">
						<p className="font-medium leading-snug">{m.title}</p>
						{m.phase && (
							<Badge
								variant="outline"
								className="shrink-0 normal-case tracking-normal"
							>
								{phaseTitle(m.phase)}
							</Badge>
						)}
					</div>
					{m.description && (
						<p className="line-clamp-2 text-muted-foreground text-xs">
							{m.description}
						</p>
					)}
					<div className="flex flex-wrap items-center gap-1">
						{m.dueAt && (
							<Badge
								variant={
									m.status !== "done" && m.dueAt < today
										? "destructive"
										: "muted"
								}
							>
								{fmt.format(new Date(`${m.dueAt}T00:00:00Z`))}
							</Badge>
						)}
						{m.controlCodes.slice(0, 4).map((code) => (
							<Link
								key={code}
								href={`/controls/${code}`}
								className="font-mono text-[0.65rem] text-primary hover:underline"
								onPointerDown={(e) => e.stopPropagation()}
							>
								{code}
							</Link>
						))}
						{m.controlCodes.length > 4 && (
							<span className="text-[0.65rem] text-muted-foreground">
								+{m.controlCodes.length - 4}
							</span>
						)}
					</div>
					<div
						className="flex items-center justify-between gap-2"
						onPointerDown={(e) => e.stopPropagation()}
					>
						<UserChip name={m.assigneeName ?? m.ownerName} />
						{canEdit && (
							<span className="flex items-center gap-1">
								<TaskFromMilestoneButton id={m.id} openTasks={m.openTasks} />
								<MilestoneForm members={members} initial={m} />
							</span>
						)}
					</div>
				</div>
			)}
		/>
	);
}

function TaskFromMilestoneButton({
	id,
	openTasks,
}: {
	id: string;
	openTasks: number;
}) {
	const t = useTranslations("Roadmap");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [pending, start] = useTransition();
	return (
		<Button
			size="icon"
			variant="ghost"
			title={openTasks > 0 ? t("tasksOpen", { n: openTasks }) : t("createTask")}
			aria-label={t("createTask")}
			disabled={pending}
			onClick={() =>
				start(async () => {
					const res = await createTaskFromMilestone({ id });
					if (!res.ok) return void toast.error(tc("error"));
					toast.success(t("taskCreated"));
					router.refresh();
				})
			}
		>
			<ListTodo />
			{openTasks > 0 && <span className="text-[0.65rem]">{openTasks}</span>}
		</Button>
	);
}

export function MilestoneForm({
	initial,
	members,
}: {
	initial?: MilestoneCard;
	members: MemberOption[];
}) {
	const t = useTranslations("Roadmap");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [pending, start] = useTransition();
	const [d, setD] = useState({
		title: initial?.title ?? "",
		description: initial?.description ?? "",
		phase: initial?.phase ?? "0_vorbereitung",
		dueAt: initial?.dueAt ?? "",
		ownerUserId: initial?.ownerUserId ?? null,
		assigneeUserId: initial?.assigneeUserId ?? null,
		controlCodes: (initial?.controlCodes ?? []).join(", "),
	});
	return (
		<FormDialog
			title={initial ? t("editMilestone") : t("newMilestone")}
			lead={t("formLead")}
			trigger={
				initial ? <EditTrigger /> : <NewTrigger label={t("newMilestone")} />
			}
			open={open}
			setOpen={setOpen}
			pending={pending}
			disabled={!d.title.trim()}
			onSubmit={() =>
				start(async () => {
					const res = await upsertMilestone({
						id: initial?.id,
						title: d.title,
						description: d.description || undefined,
						phase: d.phase || null,
						dueAt: d.dueAt || null,
						ownerUserId: d.ownerUserId,
						assigneeUserId: d.assigneeUserId,
						controlCodes: d.controlCodes
							.split(",")
							.map((s) => s.trim().toUpperCase())
							.filter(Boolean),
					});
					if (!res.ok) return void toast.error(tc("error"));
					toast.success(t("saved"));
					setOpen(false);
					router.refresh();
				})
			}
		>
			<Field
				id="ms-title"
				label={t("titleField")}
				value={d.title}
				onChange={(v) => setD({ ...d, title: v })}
				required
			/>
			<Field
				id="ms-desc"
				label={t("description")}
				value={d.description}
				onChange={(v) => setD({ ...d, description: v })}
				rows={2}
			/>
			<div className="grid gap-4 sm:grid-cols-2">
				<div className="flex flex-col gap-1.5">
					<Label>{t("phase")}</Label>
					<Select
						value={d.phase}
						onValueChange={(v) => setD({ ...d, phase: v })}
					>
						<SelectTrigger className="w-full">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{ROADMAP_PHASES.map((p) => (
								<SelectItem key={p.key} value={p.key}>
									{p.title}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
				<Field
					id="ms-due"
					label={t("dueAt")}
					type="date"
					value={d.dueAt}
					onChange={(v) => setD({ ...d, dueAt: v })}
				/>
				<UserSelect
					label={t("owner")}
					value={d.ownerUserId}
					onChange={(v) => setD({ ...d, ownerUserId: v })}
					members={members}
				/>
				<UserSelect
					label={t("assignee")}
					value={d.assigneeUserId}
					onChange={(v) => setD({ ...d, assigneeUserId: v })}
					members={members}
				/>
			</div>
			<Field
				id="ms-controls"
				label={t("controls")}
				value={d.controlCodes}
				onChange={(v) => setD({ ...d, controlCodes: v })}
			/>
		</FormDialog>
	);
}

export function ApplyRoadmapForm({
	defaultStage,
}: {
	defaultStage: LicenceStage;
}) {
	const t = useTranslations("Roadmap");
	const to = useTranslations("Onboarding");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [pending, start] = useTransition();
	const [stage, setStage] = useState<LicenceStage>(
		defaultStage === "0_vorbereitung" ? "2_casp_zag" : defaultStage,
	);
	const [startDate, setStartDate] = useState(
		new Date().toISOString().slice(0, 10),
	);
	return (
		<FormDialog
			title={t("applyTemplate")}
			lead={t("applyTemplateLead")}
			trigger={
				<Button variant="outline" size="sm">
					<Sparkles />
					{t("applyTemplate")}
				</Button>
			}
			open={open}
			setOpen={setOpen}
			pending={pending}
			onSubmit={() =>
				start(async () => {
					const res = await applyRoadmapTemplate({
						targetStage: stage,
						startDate,
					});
					if (!res.ok) return void toast.error(tc("error"));
					toast.success(t("templateApplied", { n: res.data.created }));
					setOpen(false);
					router.refresh();
				})
			}
		>
			<div className="grid gap-4 sm:grid-cols-2">
				<div className="flex flex-col gap-1.5">
					<Label>{t("targetStage")}</Label>
					<Select
						value={stage}
						onValueChange={(v) => setStage(v as LicenceStage)}
					>
						<SelectTrigger className="w-full">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{LICENCE_STAGES.map((s) => (
								<SelectItem key={s} value={s}>
									{to(`stage${s.charAt(0)}` as "stage0")}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
				<Field
					id="rm-start"
					label={t("startDate")}
					type="date"
					value={startDate}
					onChange={setStartDate}
					required
				/>
			</div>
		</FormDialog>
	);
}
