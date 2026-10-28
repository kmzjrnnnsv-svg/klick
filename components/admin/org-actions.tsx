"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import {
	resumeOrganization,
	saveOrgContract,
	suspendOrganization,
} from "@/app/actions/admin-orgs";
import { withStepUp } from "@/components/auth/step-up-dialog";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-alert";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { errorText } from "@/components/ui/error-text";
import { FormAlert } from "@/components/ui/form-alert";
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
import { ORG_ACCOUNT_STATUS, type OrgAccountStatus } from "@/db/schema/enums";
import { SUSPEND_REASON_MIN } from "@/lib/admin/contract";

// Admin > Organisationen > [Org]: Vertrag bearbeiten, sperren, entsperren.

export type ContractValues = {
	status: OrgAccountStatus;
	startedAt: string;
	auditPassedAt: string;
	feeInvoicedFor: string;
	cancelledAt: string;
	note: string;
};

export function ContractDialog({
	orgId,
	values,
}: {
	orgId: string;
	values: ContractValues;
}) {
	const t = useTranslations("AdminOrgs");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [form, setForm] = useState(values);
	const [error, setError] = useState<string | null>(null);
	const [pending, start] = useTransition();
	const set =
		<K extends keyof ContractValues>(k: K) =>
		(v: ContractValues[K]) =>
			setForm((f) => ({ ...f, [k]: v }));

	const date = (
		k: "startedAt" | "auditPassedAt" | "feeInvoicedFor" | "cancelledAt",
	) => (
		<div className="grid gap-2">
			<Label htmlFor={`contract-${k}`}>{t(`field_${k}`)}</Label>
			<Input
				id={`contract-${k}`}
				name={k}
				type="date"
				value={form[k]}
				onChange={(e) => set(k)(e.target.value)}
			/>
		</div>
	);

	return (
		<Dialog
			open={open}
			onOpenChange={(o) => {
				setOpen(o);
				if (o) {
					setForm(values);
					setError(null);
				}
			}}
		>
			<DialogTrigger asChild>
				<Button variant="secondary">{t("editContract")}</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>{t("contractTitle")}</DialogTitle>
					<DialogDescription>{t("contractLead")}</DialogDescription>
				</DialogHeader>
				<form
					className="flex flex-col gap-4"
					onSubmit={(e) => {
						e.preventDefault();
						setError(null);
						start(async () => {
							const res = await saveOrgContract({ orgId, ...form });
							if (!res.ok) {
								setError(
									res.error === "cancelled_needs_date"
										? t("err_cancelled_needs_date")
										: errorText(tc, res),
								);
								return;
							}
							toast.success(t("contractSaved"));
							setOpen(false);
							router.refresh();
						});
					}}
				>
					<div className="grid gap-2">
						<Label htmlFor="contract-status">{t("field_status")}</Label>
						<Select
							value={form.status}
							onValueChange={(v) => set("status")(v as OrgAccountStatus)}
						>
							<SelectTrigger id="contract-status" className="w-full">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{ORG_ACCOUNT_STATUS.map((s) => (
									<SelectItem key={s} value={s}>
										{t(`status_${s}`)}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
					<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
						{date("startedAt")}
						{date("auditPassedAt")}
						{date("feeInvoicedFor")}
						{form.status === "cancelled" && date("cancelledAt")}
					</div>
					<p className="text-footnote text-muted-foreground">{t("feeHint")}</p>
					<div className="grid gap-2">
						<Label htmlFor="contract-note">{t("field_note")}</Label>
						<Textarea
							id="contract-note"
							name="note"
							rows={4}
							maxLength={2000}
							value={form.note}
							onChange={(e) => set("note")(e.target.value)}
						/>
						<p className="text-footnote text-muted-foreground">
							{t("noteHint")}
						</p>
					</div>
					<FormAlert message={error} />
					<DialogFooter>
						<Button
							type="button"
							variant="secondary"
							onClick={() => setOpen(false)}
						>
							{tc("cancel")}
						</Button>
						<Button type="submit" disabled={pending}>
							{pending ? tc("saving") : tc("save")}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

export function SuspendDialog({
	orgId,
	orgName,
}: {
	orgId: string;
	orgName: string;
}) {
	const t = useTranslations("AdminOrgs");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [reason, setReason] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [pending, start] = useTransition();
	return (
		<Dialog
			open={open}
			onOpenChange={(o) => {
				setOpen(o);
				if (o) {
					setReason("");
					setError(null);
				}
			}}
		>
			<DialogTrigger asChild>
				<Button variant="destructive">{t("suspend")}</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>{t("suspendTitle", { name: orgName })}</DialogTitle>
					<DialogDescription>{t("suspendLead")}</DialogDescription>
				</DialogHeader>
				<form
					className="flex flex-col gap-4"
					onSubmit={(e) => {
						e.preventDefault();
						setError(null);
						start(async () => {
							const res = await withStepUp(() =>
								suspendOrganization({ orgId, reason }),
							);
							if (!res.ok) {
								setError(
									res.error === "own_org"
										? t("err_own_org")
										: errorText(tc, res),
								);
								return;
							}
							toast.success(t("suspended"));
							setOpen(false);
							router.refresh();
						});
					}}
				>
					<div className="grid gap-2">
						<Label htmlFor="suspend-reason">{t("suspendReason")}</Label>
						<Textarea
							id="suspend-reason"
							name="reason"
							rows={3}
							required
							minLength={SUSPEND_REASON_MIN}
							maxLength={300}
							placeholder={t("suspendReasonPlaceholder")}
							value={reason}
							onChange={(e) => setReason(e.target.value)}
						/>
						<p className="text-footnote text-muted-foreground">
							{t("suspendReasonHint")}
						</p>
					</div>
					<FormAlert message={error} />
					<DialogFooter>
						<Button
							type="button"
							variant="secondary"
							onClick={() => setOpen(false)}
						>
							{tc("cancel")}
						</Button>
						<Button
							type="submit"
							variant="destructive"
							disabled={pending || reason.trim().length < SUSPEND_REASON_MIN}
						>
							{t("suspendConfirm")}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

export function ResumeButton({ orgId }: { orgId: string }) {
	const t = useTranslations("AdminOrgs");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [pending, start] = useTransition();
	const confirm = useConfirm({
		title: t("resumeTitle"),
		description: t("resumeLead"),
		confirmLabel: t("resume"),
		destructive: false,
	});
	return (
		<>
			<Button
				disabled={pending}
				onClick={() =>
					confirm.ask(() =>
						start(async () => {
							const res = await withStepUp(() => resumeOrganization(orgId));
							if (!res.ok) {
								toast.error(errorText(tc, res));
								return;
							}
							toast.success(t("resumed"));
							router.refresh();
						}),
					)
				}
			>
				{t("resume")}
			</Button>
			{confirm.node}
		</>
	);
}
