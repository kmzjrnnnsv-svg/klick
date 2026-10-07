"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
	transitionComplaint,
	transitionWhistleblowingReport,
	upsertComplaint,
	upsertWhistleblowingReport,
} from "@/app/actions/complaints";
import type { MemberOption } from "@/components/entity/owner-assignee";
import {
	EditTrigger,
	Field,
	FormDialog,
	FunctionSelect,
	NewTrigger,
	UserSelect,
} from "@/components/organisation/governance-forms";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import type { RoleFunction } from "@/db/schema/enums";

export type ComplaintDraft = {
	id?: string;
	receivedAt: string; // datetime-local
	channel?: string | null;
	category?: string | null;
	description?: string | null;
	complainantRef?: string | null;
	ownerUserId?: string | null;
	outcome?: string | null;
	escalatedToRegulator?: boolean;
};

function nowLocal(): string {
	const d = new Date();
	d.setSeconds(0, 0);
	return new Date(d.getTime() - d.getTimezoneOffset() * 60_000)
		.toISOString()
		.slice(0, 16);
}

export function ComplaintForm({
	initial,
	members,
}: {
	initial?: ComplaintDraft;
	members: MemberOption[];
}) {
	const t = useTranslations("Complaints");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [pending, start] = useTransition();
	const [d, setD] = useState<ComplaintDraft>(
		initial ?? { receivedAt: nowLocal() },
	);
	return (
		<FormDialog
			title={initial ? t("editComplaint") : t("newComplaint")}
			lead={t("complaintFormLead")}
			trigger={
				initial ? <EditTrigger /> : <NewTrigger label={t("newComplaint")} />
			}
			open={open}
			setOpen={setOpen}
			pending={pending}
			wide
			onSubmit={() =>
				start(async () => {
					const res = await upsertComplaint({
						id: d.id,
						receivedAt: new Date(d.receivedAt),
						channel: d.channel || undefined,
						category: d.category || undefined,
						description: d.description || undefined,
						complainantRef:
							d.complainantRef === undefined
								? undefined
								: d.complainantRef || null,
						ownerUserId: d.ownerUserId ?? null,
						outcome: d.outcome || undefined,
						escalatedToRegulator: d.escalatedToRegulator,
					});
					if (!res.ok) return void toast.error(tc("error"));
					toast.success(
						initial
							? t("saved")
							: t("complaintCreated", { code: res.data.code }),
					);
					setOpen(false);
					router.refresh();
				})
			}
		>
			<div className="grid gap-4 sm:grid-cols-2">
				{!initial && (
					<Field
						id="cp-received"
						label={t("receivedAt")}
						type="datetime-local"
						value={d.receivedAt}
						onChange={(v) => setD({ ...d, receivedAt: v })}
						required
					/>
				)}
				<Field
					id="cp-channel"
					label={t("channel")}
					value={d.channel ?? ""}
					onChange={(v) => setD({ ...d, channel: v })}
				/>
				<Field
					id="cp-category"
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
				<Field
					id="cp-ref"
					label={t("complainantRef")}
					value={d.complainantRef ?? ""}
					onChange={(v) => setD({ ...d, complainantRef: v })}
				/>
			</div>
			<Field
				id="cp-desc"
				label={t("description")}
				value={d.description ?? ""}
				onChange={(v) => setD({ ...d, description: v })}
				rows={3}
			/>
			{initial && (
				<Field
					id="cp-outcome"
					label={t("outcome")}
					value={d.outcome ?? ""}
					onChange={(v) => setD({ ...d, outcome: v })}
					rows={2}
				/>
			)}
			<label className="flex items-center gap-2 text-sm">
				<Checkbox
					checked={Boolean(d.escalatedToRegulator)}
					onCheckedChange={(v) =>
						setD({ ...d, escalatedToRegulator: Boolean(v) })
					}
				/>
				{t("escalated")}
			</label>
			<p className="text-muted-foreground text-xs">{t("privacyHint")}</p>
		</FormDialog>
	);
}

export type WbDraft = {
	id?: string;
	receivedAt: string;
	channel?: string | null;
	category?: string | null;
	summary?: string | null;
	ownerFunction: RoleFunction;
};

export function WhistleblowingForm({
	initial,
	functionLabels,
}: {
	initial?: WbDraft;
	functionLabels: Record<string, string>;
}) {
	const t = useTranslations("Complaints");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [pending, start] = useTransition();
	const [d, setD] = useState<WbDraft>(
		initial ?? { receivedAt: nowLocal(), ownerFunction: "compliance" },
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
			wide
			onSubmit={() =>
				start(async () => {
					const res = await upsertWhistleblowingReport({
						id: d.id,
						receivedAt: new Date(d.receivedAt),
						channel: d.channel || undefined,
						category: d.category || undefined,
						summary: d.summary === undefined ? undefined : d.summary || null,
						ownerFunction: d.ownerFunction,
					});
					if (!res.ok) return void toast.error(tc("error"));
					toast.success(
						initial ? t("saved") : t("reportCreated", { ref: res.data.ref }),
					);
					setOpen(false);
					router.refresh();
				})
			}
		>
			<div className="grid gap-4 sm:grid-cols-2">
				{!initial && (
					<Field
						id="wb-received"
						label={t("receivedAt")}
						type="datetime-local"
						value={d.receivedAt}
						onChange={(v) => setD({ ...d, receivedAt: v })}
						required
					/>
				)}
				<Field
					id="wb-channel"
					label={t("channel")}
					value={d.channel ?? ""}
					onChange={(v) => setD({ ...d, channel: v })}
				/>
				<Field
					id="wb-category"
					label={t("category")}
					value={d.category ?? ""}
					onChange={(v) => setD({ ...d, category: v })}
				/>
				<FunctionSelect
					label={t("ownerFunction")}
					value={d.ownerFunction}
					onChange={(v) => v && setD({ ...d, ownerFunction: v })}
					labels={functionLabels}
				/>
			</div>
			<Field
				id="wb-summary"
				label={t("summary")}
				value={d.summary ?? ""}
				onChange={(v) => setD({ ...d, summary: v })}
				rows={4}
			/>
			<p className="text-muted-foreground text-xs">{t("wbPrivacyHint")}</p>
		</FormDialog>
	);
}

export function TransitionButtons({
	id,
	kind,
	options,
}: {
	id: string;
	kind: "complaint" | "whistleblowing";
	options: { to: string; label: string; primary?: boolean }[];
}) {
	const tc = useTranslations("Common");
	const router = useRouter();
	const [pending, start] = useTransition();
	return (
		<span className="inline-flex flex-wrap gap-1">
			{options.map((o) => (
				<Button
					key={o.to}
					size="sm"
					variant={o.primary ? "default" : "outline"}
					disabled={pending}
					onClick={() =>
						start(async () => {
							const res =
								kind === "complaint"
									? await transitionComplaint({ id, to: o.to })
									: await transitionWhistleblowingReport({ id, to: o.to });
							if (!res.ok) return void toast.error(tc("error"));
							router.refresh();
						})
					}
				>
					{o.label}
				</Button>
			))}
		</span>
	);
}
