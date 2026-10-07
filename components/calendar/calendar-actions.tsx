"use client";

import { Check, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
	applyObligationSeed,
	completeObligationRun,
	updateObligation,
	waiveObligationRun,
} from "@/app/actions/obligations";
import type { MemberOption } from "@/components/entity/owner-assignee";
import { FormDialog } from "@/components/organisation/governance-forms";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

export function ApplyObligationSeedButton({ variant }: { variant?: "brown" }) {
	const t = useTranslations("Calendar");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [pending, start] = useTransition();
	return (
		<Button
			size="sm"
			variant={variant ?? "outline"}
			disabled={pending}
			onClick={() =>
				start(async () => {
					const res = await applyObligationSeed();
					if (!res.ok) return void toast.error(tc("error"));
					toast.success(
						t("seedApplied", { n: res.data.created, r: res.data.runs }),
					);
					router.refresh();
				})
			}
		>
			<Sparkles />
			{t("applySeed")}
		</Button>
	);
}

export function RunActions({
	runId,
	evidence,
}: {
	runId: string;
	evidence: { id: string; title: string }[];
}) {
	const t = useTranslations("Calendar");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [waiveOpen, setWaiveOpen] = useState(false);
	const [pending, start] = useTransition();
	const [evidenceId, setEvidenceId] = useState("none");
	const [note, setNote] = useState("");
	const [reason, setReason] = useState("");
	return (
		<div className="flex items-center gap-1">
			<FormDialog
				title={t("complete")}
				lead={t("completeLead")}
				trigger={
					<Button size="sm" variant="outline">
						<Check />
						{t("complete")}
					</Button>
				}
				open={open}
				setOpen={setOpen}
				pending={pending}
				onSubmit={() =>
					start(async () => {
						const res = await completeObligationRun({
							runId,
							evidenceId: evidenceId === "none" ? null : evidenceId,
							note: note || undefined,
						});
						if (!res.ok) return void toast.error(tc("error"));
						toast.success(t("completed"));
						setOpen(false);
						router.refresh();
					})
				}
			>
				<div className="flex flex-col gap-1.5">
					<Label>{t("evidence")}</Label>
					<Select value={evidenceId} onValueChange={setEvidenceId}>
						<SelectTrigger className="w-full">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="none">—</SelectItem>
							{evidence.map((e) => (
								<SelectItem key={e.id} value={e.id}>
									{e.title}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
				<div className="flex flex-col gap-1.5">
					<Label htmlFor={`rn-${runId}`}>{t("note")}</Label>
					<Textarea
						id={`rn-${runId}`}
						rows={2}
						value={note}
						onChange={(e) => setNote(e.target.value)}
					/>
				</div>
			</FormDialog>
			<FormDialog
				title={t("waive")}
				lead={t("waiveLead")}
				trigger={
					<Button
						size="sm"
						variant="ghost"
						className="normal-case tracking-normal"
					>
						{t("waive")}
					</Button>
				}
				open={waiveOpen}
				setOpen={setWaiveOpen}
				pending={pending}
				disabled={reason.trim().length < 3}
				onSubmit={() =>
					start(async () => {
						const res = await waiveObligationRun({ runId, note: reason });
						if (!res.ok) return void toast.error(tc("error"));
						toast.success(t("waived"));
						setWaiveOpen(false);
						router.refresh();
					})
				}
			>
				<Textarea
					rows={3}
					value={reason}
					onChange={(e) => setReason(e.target.value)}
					placeholder={t("waiveReason")}
				/>
			</FormDialog>
		</div>
	);
}

export function ObligationSettings({
	obligationId,
	ownerUserId,
	leadDays,
	active,
	members,
}: {
	obligationId: string;
	ownerUserId: string | null;
	leadDays: number;
	active: boolean;
	members: MemberOption[];
}) {
	const t = useTranslations("Calendar");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [pending, start] = useTransition();
	const save = (patch: Record<string, unknown>) =>
		start(async () => {
			const res = await updateObligation({ obligationId, ...patch });
			if (!res.ok) return void toast.error(tc("error"));
			router.refresh();
		});
	return (
		<div className="flex flex-wrap items-center gap-2">
			<Select
				value={ownerUserId ?? "none"}
				disabled={pending}
				onValueChange={(v) => save({ ownerUserId: v === "none" ? null : v })}
			>
				<SelectTrigger className="h-8 w-44">
					<SelectValue placeholder={t("owner")} />
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
				type="number"
				min={0}
				max={365}
				defaultValue={leadDays}
				className="h-8 w-20"
				title={t("leadDays")}
				onBlur={(e) => {
					const v = Number(e.target.value);
					if (Number.isFinite(v) && v !== leadDays) save({ leadDays: v });
				}}
			/>
			<Switch
				checked={active}
				disabled={pending}
				onCheckedChange={(v) => save({ active: v })}
				aria-label={t("active")}
			/>
		</div>
	);
}
