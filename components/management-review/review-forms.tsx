"use client";

import { Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
	completeReview,
	saveReviewInputs,
	upsertManagementReview,
} from "@/app/actions/management-reviews";
import type { MemberOption } from "@/components/entity/owner-assignee";
import {
	EditTrigger,
	Field,
	FormDialog,
	NewTrigger,
	UserSelect,
} from "@/components/organisation/governance-forms";
import { Badge } from "@/components/ui/badge";
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
import type { ReviewInput } from "@/lib/compliance/catalog/management-review-inputs";

export type ReviewDraft = {
	id?: string;
	heldAt: string;
	attendeeUserIds?: string[];
	summary?: string | null;
	decisions?: string | null;
	ownerUserId?: string | null;
};

export function ReviewForm({
	initial,
	members,
}: {
	initial?: ReviewDraft;
	members: MemberOption[];
}) {
	const t = useTranslations("ManagementReview");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [pending, start] = useTransition();
	const [d, setD] = useState<ReviewDraft>(
		initial ?? {
			heldAt: new Date().toISOString().slice(0, 10),
			attendeeUserIds: [],
		},
	);
	const attendees = new Set(d.attendeeUserIds ?? []);
	return (
		<FormDialog
			title={initial ? t("edit") : t("new")}
			lead={t("formLead")}
			trigger={initial ? <EditTrigger /> : <NewTrigger label={t("new")} />}
			open={open}
			setOpen={setOpen}
			pending={pending}
			disabled={!d.heldAt}
			wide
			onSubmit={() =>
				start(async () => {
					const res = await upsertManagementReview({
						...d,
						summary: d.summary ?? undefined,
						decisions: d.decisions ?? undefined,
					});
					if (!res.ok) return void toast.error(tc("error"));
					toast.success(t("saved"));
					setOpen(false);
					router.refresh();
				})
			}
		>
			<div className="grid gap-4 sm:grid-cols-2">
				<Field
					id="mr-date"
					label={t("heldAt")}
					type="date"
					value={d.heldAt}
					onChange={(v) => setD({ ...d, heldAt: v })}
					required
				/>
				<UserSelect
					label={t("owner")}
					value={d.ownerUserId}
					onChange={(v) => setD({ ...d, ownerUserId: v })}
					members={members}
				/>
			</div>
			<fieldset className="flex flex-wrap gap-3 text-sm">
				<legend className="lv-eyebrow mb-1 text-[0.52rem] text-muted-foreground">
					{t("attendees")}
				</legend>
				{members.map((m) => (
					<label key={m.userId} className="flex items-center gap-2">
						<Checkbox
							checked={attendees.has(m.userId)}
							onCheckedChange={(v) => {
								const next = new Set(attendees);
								if (v) next.add(m.userId);
								else next.delete(m.userId);
								setD({ ...d, attendeeUserIds: [...next] });
							}}
						/>
						{m.name}
					</label>
				))}
			</fieldset>
			<Field
				id="mr-summary"
				label={t("summary")}
				value={d.summary ?? ""}
				onChange={(v) => setD({ ...d, summary: v })}
				rows={3}
			/>
			<Field
				id="mr-decisions"
				label={t("decisions")}
				value={d.decisions ?? ""}
				onChange={(v) => setD({ ...d, decisions: v })}
				rows={3}
			/>
		</FormDialog>
	);
}

// Pflicht-Inputs abhaken (speichert sofort); Links führen ins jeweilige Modul.
export function ReviewInputsChecklist({
	reviewId,
	inputs,
	value,
	canEdit,
}: {
	reviewId: string;
	inputs: ReviewInput[];
	value: Record<string, { done: boolean; note?: string }>;
	canEdit: boolean;
}) {
	const t = useTranslations("ManagementReview");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [state, setState] = useState(value);
	const [pending, start] = useTransition();
	const done = inputs.filter((i) => state[i.key]?.done).length;
	const save = (next: typeof state) => {
		setState(next);
		start(async () => {
			const res = await saveReviewInputs({ reviewId, inputs: next });
			if (!res.ok) toast.error(tc("error"));
			else router.refresh();
		});
	};
	return (
		<div className="flex flex-col gap-2">
			<p className="text-muted-foreground text-xs">
				{t("inputsProgress", { done, total: inputs.length })}
			</p>
			<ul className="flex flex-col divide-y divide-border/60 rounded-md border text-sm">
				{inputs.map((i) => {
					const v = state[i.key] ?? { done: false };
					return (
						<li key={i.key} className="flex flex-col gap-1 px-3 py-2">
							<label className="flex items-start gap-3">
								<Checkbox
									className="mt-0.5"
									checked={v.done}
									disabled={!canEdit || pending}
									onCheckedChange={(c) =>
										save({ ...state, [i.key]: { ...v, done: Boolean(c) } })
									}
								/>
								<span className="min-w-0 flex-1">
									<span className="font-medium">{i.title}</span>
									<span className="block text-muted-foreground text-xs">
										{i.hint}{" "}
										<span className="opacity-70">({i.legalBasis})</span>
									</span>
								</span>
								{i.href && (
									<a
										href={i.href}
										className="shrink-0 text-primary text-xs hover:underline"
									>
										{t("open")}
									</a>
								)}
							</label>
							{canEdit && (
								<Input
									className="h-7 text-xs"
									placeholder={t("inputNote")}
									defaultValue={v.note ?? ""}
									onBlur={(e) => {
										if ((e.target.value || "") !== (v.note ?? ""))
											save({
												...state,
												[i.key]: { ...v, note: e.target.value },
											});
									}}
								/>
							)}
						</li>
					);
				})}
			</ul>
		</div>
	);
}

type ActionDraft = {
	title: string;
	assigneeUserId: string | null;
	dueAt: string;
};

export function CompleteReviewForm({
	reviewId,
	status,
	members,
	complete,
}: {
	reviewId: string;
	status: "planned" | "held" | "done";
	members: MemberOption[];
	complete: boolean;
}) {
	const t = useTranslations("ManagementReview");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [pending, start] = useTransition();
	const [next, setNext] = useState<"planned" | "held" | "done">(status);
	const [actions, setActions] = useState<ActionDraft[]>([]);
	return (
		<div className="flex flex-col gap-3 rounded-md border p-3 text-sm">
			<div className="flex flex-wrap items-center gap-3">
				<Label>{t("status")}</Label>
				<Select value={next} onValueChange={(v) => setNext(v as typeof next)}>
					<SelectTrigger className="w-44">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{(["planned", "held", "done"] as const).map((s) => (
							<SelectItem key={s} value={s}>
								{t(`status_${s}`)}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				{next === "done" && !complete && (
					<Badge variant="warning">{t("inputsIncomplete")}</Badge>
				)}
			</div>
			<div className="flex flex-col gap-2">
				<div className="flex items-center justify-between">
					<Label>{t("actions")}</Label>
					<Button
						type="button"
						size="sm"
						variant="ghost"
						onClick={() =>
							setActions([
								...actions,
								{ title: "", assigneeUserId: null, dueAt: "" },
							])
						}
					>
						<Plus />
						{t("addAction")}
					</Button>
				</div>
				{actions.map((a, i) => (
					<div
						// biome-ignore lint/suspicious/noArrayIndexKey: editierbare Liste ohne natürliche ID
						key={`${i}-${actions.length}`}
						className="grid gap-2 sm:grid-cols-[1fr_12rem_9rem_2rem]"
					>
						<Input
							placeholder={t("actionTitle")}
							value={a.title}
							onChange={(e) => {
								const n = [...actions];
								n[i] = { ...a, title: e.target.value };
								setActions(n);
							}}
						/>
						<Select
							value={a.assigneeUserId ?? "none"}
							onValueChange={(v) => {
								const n = [...actions];
								n[i] = { ...a, assigneeUserId: v === "none" ? null : v };
								setActions(n);
							}}
						>
							<SelectTrigger>
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="none">—</SelectItem>
								{members.map((m) => (
									<SelectItem key={m.userId} value={m.userId}>
										{m.name}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
						<Input
							type="date"
							value={a.dueAt}
							onChange={(e) => {
								const n = [...actions];
								n[i] = { ...a, dueAt: e.target.value };
								setActions(n);
							}}
						/>
						<Button
							size="icon"
							variant="ghost"
							aria-label={tc("delete")}
							onClick={() => setActions(actions.filter((_, j) => j !== i))}
						>
							<Trash2 />
						</Button>
					</div>
				))}
			</div>
			<Textarea rows={1} className="hidden" readOnly value="" />
			<div>
				<Button
					size="sm"
					disabled={pending || (next === "done" && !complete)}
					onClick={() =>
						start(async () => {
							const res = await completeReview({
								reviewId,
								status: next,
								actions: actions
									.filter((a) => a.title.trim())
									.map((a) => ({
										title: a.title,
										assigneeUserId: a.assigneeUserId,
										dueAt: a.dueAt || null,
									})),
							});
							if (!res.ok)
								return void toast.error(
									res.error.startsWith("inputs_missing")
										? t("inputsIncomplete")
										: tc("error"),
								);
							toast.success(t("statusSaved", { n: res.data.tasks }));
							setActions([]);
							router.refresh();
						})
					}
				>
					{tc("save")}
				</Button>
			</div>
		</div>
	);
}
