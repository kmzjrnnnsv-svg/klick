"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import {
	createChangeRequest,
	withdrawChangeRequest,
} from "@/app/actions/changes";
import { useGateFeedback } from "@/components/approvals/use-gate-feedback";
import {
	FormDialog,
	NewTrigger,
	UserSelect,
} from "@/components/organisation/governance-forms";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useConfirm } from "@/components/ui/confirm-alert";
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
import { CHANGE_KINDS, type ChangeKind } from "@/db/schema/enums";

type Option = { id: string; label: string };
type Member = { userId: string; name: string; email: string };

// Mehrfachauswahl als Liste mit Kästchen (Prozesse, Assets)
function PickList({
	label,
	options,
	value,
	onChange,
	empty,
}: {
	label: string;
	options: Option[];
	value: string[];
	onChange: (v: string[]) => void;
	empty: string;
}) {
	return (
		<fieldset className="flex flex-col gap-1.5">
			<legend className="mb-1.5 font-medium text-subhead">{label}</legend>
			{options.length === 0 ? (
				<p className="text-muted-foreground text-footnote">{empty}</p>
			) : (
				<ul className="list-inset flex max-h-48 flex-col overflow-y-auto rounded-2xl bg-card text-subhead">
					{options.map((o) => (
						<li key={o.id}>
							<label className="flex min-h-11 items-center gap-3 px-3 py-2">
								<Checkbox
									checked={value.includes(o.id)}
									onCheckedChange={(v) =>
										onChange(
											v ? [...value, o.id] : value.filter((x) => x !== o.id),
										)
									}
								/>
								<span className="min-w-0 break-words">{o.label}</span>
							</label>
						</li>
					))}
				</ul>
			)}
		</fieldset>
	);
}

// „Änderung beantragen“: Art, Beschreibung, betroffene Prozesse und Assets,
// verknüpftes Risiko, wer umsetzt — danach Freigabe (change.request)
export function ChangeRequestDialog({
	processes,
	assets,
	risks,
	members,
}: {
	processes: Option[];
	assets: Option[];
	risks: Option[];
	members: Member[];
}) {
	const t = useTranslations("Changes");
	const tc = useTranslations("Common");
	const gate = useGateFeedback();
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [pending, start] = useTransition();
	const [error, setError] = useState<string | null>(null);
	const empty = {
		title: "",
		kind: "product" as ChangeKind,
		description: "",
		processIds: [] as string[],
		assetIds: [] as string[],
		riskId: null as string | null,
		assigneeUserId: null as string | null,
	};
	const [d, setD] = useState(empty);
	return (
		<FormDialog
			title={t("new")}
			lead={t("newLead")}
			trigger={<NewTrigger label={t("new")} />}
			open={open}
			setOpen={setOpen}
			pending={pending}
			disabled={!d.title.trim()}
			error={error}
			wide
			onSubmit={() =>
				start(async () => {
					setError(null);
					const res = await createChangeRequest({
						...d,
						description: d.description || undefined,
					});
					if (!res.ok)
						return void setError(
							gate.errorText(res.error) ?? errorText(tc, res),
						);
					toast.success(
						res.data.pending
							? t("createdPending", { code: res.data.code })
							: t("createdApproved", { code: res.data.code }),
					);
					setD(empty);
					setOpen(false);
					router.refresh();
				})
			}
		>
			<div className="flex flex-col gap-1.5">
				<Label htmlFor="ch-title">{t("titleField")}</Label>
				<Input
					id="ch-title"
					value={d.title}
					maxLength={200}
					placeholder={t("titlePlaceholder")}
					onChange={(e) => setD({ ...d, title: e.target.value })}
					autoComplete="off"
				/>
			</div>
			<div className="flex flex-col gap-1.5">
				<Label htmlFor="ch-kind">{t("kind")}</Label>
				<Select
					value={d.kind}
					onValueChange={(v) => setD({ ...d, kind: v as ChangeKind })}
				>
					<SelectTrigger id="ch-kind" className="w-full">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{CHANGE_KINDS.map((k) => (
							<SelectItem key={k} value={k}>
								{t(`kind_${k}`)}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				<p className="text-muted-foreground text-footnote">
					{t(`kindHint_${d.kind}`)}
				</p>
			</div>
			<div className="flex flex-col gap-1.5">
				<Label htmlFor="ch-desc">{t("description")}</Label>
				<Textarea
					id="ch-desc"
					rows={4}
					value={d.description}
					placeholder={t("descriptionPlaceholder")}
					onChange={(e) => setD({ ...d, description: e.target.value })}
				/>
			</div>
			<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
				<PickList
					label={t("processes")}
					options={processes}
					value={d.processIds}
					onChange={(v) => setD({ ...d, processIds: v })}
					empty={t("noProcesses")}
				/>
				<PickList
					label={t("assets")}
					options={assets}
					value={d.assetIds}
					onChange={(v) => setD({ ...d, assetIds: v })}
					empty={t("noAssets")}
				/>
			</div>
			<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
				<div className="flex flex-col gap-1.5">
					<Label htmlFor="ch-risk">{t("risk")}</Label>
					<Select
						value={d.riskId ?? "none"}
						onValueChange={(v) =>
							setD({ ...d, riskId: v === "none" ? null : v })
						}
					>
						<SelectTrigger id="ch-risk" className="w-full">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="none">{t("noRisk")}</SelectItem>
							{risks.map((r) => (
								<SelectItem key={r.id} value={r.id}>
									{r.label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
				<UserSelect
					label={t("assignee")}
					value={d.assigneeUserId}
					onChange={(v) => setD({ ...d, assigneeUserId: v })}
					members={members}
				/>
			</div>
		</FormDialog>
	);
}

export function WithdrawChangeButton({
	id,
	code,
}: {
	id: string;
	code: string;
}) {
	const t = useTranslations("Changes");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [pending, start] = useTransition();
	const confirm = useConfirm({
		title: t("withdrawConfirm", { code }),
		description: t("withdrawConfirmLead"),
		confirmLabel: t("withdraw"),
	});
	return (
		<>
			{confirm.node}
			<Button
				size="sm"
				variant="ghost"
				disabled={pending}
				onClick={() =>
					confirm.ask(() =>
						start(async () => {
							const res = await withdrawChangeRequest({ id });
							if (!res.ok) return void toast.error(errorText(tc, res));
							toast.success(t("withdrawn"));
							router.refresh();
						}),
					)
				}
			>
				{t("withdraw")}
			</Button>
		</>
	);
}
