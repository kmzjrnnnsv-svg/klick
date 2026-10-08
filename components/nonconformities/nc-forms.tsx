"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
	recordEffectiveness,
	setNonconformityPriority,
	upsertNonconformity,
} from "@/app/actions/nonconformities";
import type { MemberOption } from "@/components/entity/owner-assignee";
import {
	EditTrigger,
	Field,
	FormDialog,
	NewTrigger,
	UserSelect,
} from "@/components/organisation/governance-forms";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { NC_PRIORITIES, type NcPriority } from "@/db/schema/enums";
import { NC_SOURCES } from "@/lib/validation/governance";

export type NcDraft = {
	id?: string;
	source: (typeof NC_SOURCES)[number];
	title: string;
	description?: string | null;
	rootCause?: string | null;
	correction?: string | null;
	correctiveAction?: string | null;
	ownerUserId?: string | null;
	assigneeUserId?: string | null;
	dueAt?: string | null;
	effectivenessCheckAt?: string | null;
};

export function NonconformityForm({
	initial,
	members,
}: {
	initial?: NcDraft;
	members: MemberOption[];
}) {
	const t = useTranslations("Nonconformities");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [pending, start] = useTransition();
	const [d, setD] = useState<NcDraft>(
		initial ?? { source: "self_identified", title: "" },
	);
	return (
		<FormDialog
			title={initial ? t("edit") : t("new")}
			lead={t("formLead")}
			trigger={initial ? <EditTrigger /> : <NewTrigger label={t("new")} />}
			open={open}
			setOpen={setOpen}
			pending={pending}
			disabled={!d.title.trim()}
			wide
			onSubmit={() =>
				start(async () => {
					const res = await upsertNonconformity({
						...d,
						description: d.description ?? undefined,
						rootCause: d.rootCause ?? undefined,
						correction: d.correction ?? undefined,
						correctiveAction: d.correctiveAction ?? undefined,
						dueAt: d.dueAt || null,
						effectivenessCheckAt: d.effectivenessCheckAt || null,
					});
					if (!res.ok)
						return void toast.error(
							res.error === "forbidden"
								? t("forbidden")
								: res.fieldErrors
									? t("invalid")
									: tc("error"),
						);
					toast.success(
						initial ? t("saved") : t("created", { code: res.data.code }),
					);
					setOpen(false);
					if (!initial) router.push(`/abweichungen/${res.data.id}`);
					else router.refresh();
				})
			}
		>
			<Field
				id="nc-title"
				label={t("titleField")}
				value={d.title}
				onChange={(v) => setD({ ...d, title: v })}
				required
			/>
			<div className="grid gap-4 sm:grid-cols-2">
				{!initial && (
					<div className="flex flex-col gap-1.5">
						<Label>{t("source")}</Label>
						<Select
							value={d.source}
							onValueChange={(v) =>
								setD({ ...d, source: v as NcDraft["source"] })
							}
						>
							<SelectTrigger className="w-full">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{NC_SOURCES.map((s) => (
									<SelectItem key={s} value={s}>
										{t(`source_${s}`)}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
				)}
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
				<Field
					id="nc-due"
					label={t("dueAt")}
					type="date"
					value={d.dueAt ?? ""}
					onChange={(v) => setD({ ...d, dueAt: v })}
				/>
				<Field
					id="nc-eff"
					label={t("effectivenessCheckAt")}
					type="date"
					value={d.effectivenessCheckAt ?? ""}
					onChange={(v) => setD({ ...d, effectivenessCheckAt: v })}
				/>
			</div>
			<Field
				id="nc-desc"
				label={t("description")}
				value={d.description ?? ""}
				onChange={(v) => setD({ ...d, description: v })}
				rows={2}
			/>
			<Field
				id="nc-root"
				label={t("rootCause")}
				value={d.rootCause ?? ""}
				onChange={(v) => setD({ ...d, rootCause: v })}
				rows={2}
			/>
			<div className="grid gap-4 sm:grid-cols-2">
				<Field
					id="nc-corr"
					label={t("correction")}
					value={d.correction ?? ""}
					onChange={(v) => setD({ ...d, correction: v })}
					rows={2}
				/>
				<Field
					id="nc-ca"
					label={t("correctiveAction")}
					value={d.correctiveAction ?? ""}
					onChange={(v) => setD({ ...d, correctiveAction: v })}
					rows={2}
				/>
			</div>
		</FormDialog>
	);
}

export function EffectivenessForm({
	nonconformityId,
}: {
	nonconformityId: string;
}) {
	const t = useTranslations("Nonconformities");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [pending, start] = useTransition();
	const [result, setResult] = useState<
		"effective" | "partially" | "ineffective"
	>("effective");
	const [note, setNote] = useState("");
	return (
		<form
			className="flex flex-col gap-3"
			onSubmit={(e) => {
				e.preventDefault();
				start(async () => {
					const res = await recordEffectiveness({
						nonconformityId,
						result,
						note: note || undefined,
					});
					if (!res.ok) return void toast.error(tc("error"));
					toast.success(t("effectivenessSaved"));
					setNote("");
					router.refresh();
				});
			}}
		>
			<div className="flex flex-wrap items-end gap-3">
				<div className="flex flex-col gap-1.5">
					<Label>{t("effectivenessResult")}</Label>
					<Select
						value={result}
						onValueChange={(v) => setResult(v as typeof result)}
					>
						<SelectTrigger className="w-48">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{(["effective", "partially", "ineffective"] as const).map((r) => (
								<SelectItem key={r} value={r}>
									{t(`eff_${r}`)}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
				<Button type="submit" size="sm" disabled={pending}>
					{t("recordEffectiveness")}
				</Button>
			</div>
			<Textarea
				rows={2}
				placeholder={t("effectivenessNote")}
				value={note}
				onChange={(e) => setNote(e.target.value)}
			/>
		</form>
	);
}

// Priorität durch die Geschäftsleitung: Auswahl + Begründung, sofort wirksam.
export function PriorityForm({
	nonconformityId,
	value,
	note,
}: {
	nonconformityId: string;
	value: NcPriority | null;
	note: string | null;
}) {
	const t = useTranslations("Nonconformities");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [pending, start] = useTransition();
	const [priority, setPriority] = useState<NcPriority | "none">(
		value ?? "none",
	);
	const [text, setText] = useState(note ?? "");
	return (
		<div className="flex flex-col gap-2">
			<div className="flex flex-wrap items-end gap-2">
				<div className="flex flex-col gap-1.5">
					<Label>{t("priority")}</Label>
					<Select
						value={priority}
						onValueChange={(v) => setPriority(v as NcPriority | "none")}
					>
						<SelectTrigger className="w-44">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="none">{t("priorityNone")}</SelectItem>
							{NC_PRIORITIES.map((p) => (
								<SelectItem key={p} value={p}>
									{t(`priority_${p}`)}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
				<Button
					size="sm"
					disabled={pending}
					onClick={() =>
						start(async () => {
							const res = await setNonconformityPriority({
								nonconformityId,
								priority: priority === "none" ? null : priority,
								note: text.trim() || undefined,
							});
							if (!res.ok)
								return void toast.error(
									res.error === "not_top_management" ||
										res.error === "no_top_management"
										? t(`priorityError_${res.error}`)
										: tc("error"),
								);
							toast.success(t("prioritySaved"));
							router.refresh();
						})
					}
				>
					{tc("save")}
				</Button>
			</div>
			<Textarea
				rows={2}
				placeholder={t("priorityNote")}
				value={text}
				onChange={(e) => setText(e.target.value)}
			/>
		</div>
	);
}
