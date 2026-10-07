"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { upsertShareholder } from "@/app/actions/casp";
import {
	EditTrigger,
	Field,
	FormDialog,
	NewTrigger,
} from "@/components/organisation/governance-forms";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { thresholdCrossed } from "@/lib/compliance/shareholders";

export type ShareholderDraft = {
	id?: string;
	name: string;
	isLegalPerson: boolean;
	sharePct: string;
	votingPct: string;
	uboChain?: string | null;
	inhaberkontrolleStatus: "not_required" | "pending" | "approved" | "rejected";
	notifiedAt?: string | null;
	approvedAt?: string | null;
	sanctionsCheckedAt?: string | null;
};

const STATUSES = ["not_required", "pending", "approved", "rejected"] as const;

export function ShareholderForm({ initial }: { initial?: ShareholderDraft }) {
	const t = useTranslations("Shareholders");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [pending, start] = useTransition();
	const [d, setD] = useState<ShareholderDraft>(
		initial ?? {
			name: "",
			isLegalPerson: false,
			sharePct: "",
			votingPct: "",
			inhaberkontrolleStatus: "not_required",
		},
	);
	const threshold = thresholdCrossed(
		d.sharePct ? Number(d.sharePct) : null,
		d.votingPct ? Number(d.votingPct) : null,
	);
	return (
		<FormDialog
			title={initial ? t("edit") : t("new")}
			lead={t("formLead")}
			trigger={initial ? <EditTrigger /> : <NewTrigger label={t("new")} />}
			open={open}
			setOpen={setOpen}
			pending={pending}
			wide
			onSubmit={() =>
				start(async () => {
					const res = await upsertShareholder({
						id: d.id,
						name: d.name,
						isLegalPerson: d.isLegalPerson,
						sharePct: d.sharePct ? Number(d.sharePct) : null,
						votingPct: d.votingPct ? Number(d.votingPct) : null,
						uboChain: d.uboChain === undefined ? undefined : d.uboChain || null,
						inhaberkontrolleStatus: d.inhaberkontrolleStatus,
						notifiedAt: d.notifiedAt || null,
						approvedAt: d.approvedAt || null,
						sanctionsCheckedAt: d.sanctionsCheckedAt || null,
					});
					if (!res.ok) return void toast.error(tc("error"));
					toast.success(t("saved"));
					setOpen(false);
					router.refresh();
				})
			}
		>
			<div className="grid gap-4 sm:grid-cols-3">
				<div className="sm:col-span-2">
					<Field
						id="sh-name"
						label={t("name")}
						value={d.name}
						onChange={(v) => setD({ ...d, name: v })}
						required
					/>
				</div>
				<label className="flex items-center gap-2 pt-6 text-sm">
					<Checkbox
						checked={d.isLegalPerson}
						onCheckedChange={(v) => setD({ ...d, isLegalPerson: Boolean(v) })}
					/>
					{t("legalPerson")}
				</label>
				<Field
					id="sh-share"
					label={t("sharePct")}
					type="number"
					value={d.sharePct}
					onChange={(v) => setD({ ...d, sharePct: v })}
				/>
				<Field
					id="sh-voting"
					label={t("votingPct")}
					type="number"
					value={d.votingPct}
					onChange={(v) => setD({ ...d, votingPct: v })}
				/>
				<div className="flex flex-col gap-1.5">
					<Label>{t("status")}</Label>
					<Select
						value={d.inhaberkontrolleStatus}
						onValueChange={(v) =>
							setD({
								...d,
								inhaberkontrolleStatus:
									v as ShareholderDraft["inhaberkontrolleStatus"],
							})
						}
					>
						<SelectTrigger className="w-full">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{STATUSES.map((s) => (
								<SelectItem key={s} value={s}>
									{t(`status_${s}`)}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
				<Field
					id="sh-notified"
					label={t("notifiedAt")}
					type="date"
					value={d.notifiedAt ?? ""}
					onChange={(v) => setD({ ...d, notifiedAt: v })}
				/>
				<Field
					id="sh-approved"
					label={t("approvedAt")}
					type="date"
					value={d.approvedAt ?? ""}
					onChange={(v) => setD({ ...d, approvedAt: v })}
				/>
				<Field
					id="sh-sanctions"
					label={t("sanctionsCheckedAt")}
					type="date"
					value={d.sanctionsCheckedAt ?? ""}
					onChange={(v) => setD({ ...d, sanctionsCheckedAt: v })}
				/>
			</div>
			<Field
				id="sh-ubo"
				label={t("uboChain")}
				value={d.uboChain ?? ""}
				onChange={(v) => setD({ ...d, uboChain: v })}
				rows={3}
			/>
			<p className="text-muted-foreground text-xs">
				{threshold ? t("thresholdHint", { t: threshold }) : t("noThreshold")} ·{" "}
				{t("encryptedHint")}
			</p>
		</FormDialog>
	);
}
