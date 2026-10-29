"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import {
	createOrganizationByAdmin,
	resumeOrganization,
	saveOrgContract,
	setOrgAiSettings,
	suspendOrganization,
} from "@/app/actions/admin-orgs";
import { withStepUp } from "@/components/auth/step-up-dialog";
import { InviteLinkPanel } from "@/components/team/invite-form";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import {
	AI_CLASS_LEVELS,
	AI_MODES,
	type AiClassLevel,
	type AiMode,
	ORG_ACCOUNT_STATUS,
	type OrgAccountStatus,
} from "@/db/schema/enums";
import { SUSPEND_REASON_MIN } from "@/lib/admin/contract";
import { slugify } from "@/lib/setup/labels";

// Admin > Organisationen > [Org]: Vertrag bearbeiten, sperren, entsperren,
// KI freischalten.

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

const DEFAULT_GROUP = "__default";

// Organisation anlegen: Name, Kurzname, Vertrag, Preisgruppe, erste
// Inhaber:in. Ergebnis ist der Aktivierungslink zum Kopieren (Passkey
// Pflicht); die Inhaber:in bestätigt danach die Nutzungsbedingungen und
// richtet die Organisation geführt ein.
export function CreateOrgDialog({
	groups,
	defaultGroupName,
}: {
	groups: readonly { id: string; name: string }[];
	defaultGroupName: string | null;
}) {
	const t = useTranslations("AdminOrgs");
	const tc = useTranslations("Common");
	const router = useRouter();
	const today = new Date().toISOString().slice(0, 10);
	const empty = {
		name: "",
		slug: "",
		status: "trial" as "trial" | "active",
		startedAt: today,
		group: DEFAULT_GROUP,
		ownerName: "",
		ownerEmail: "",
		sendMail: true,
	};
	const [open, setOpen] = useState(false);
	const [form, setForm] = useState(empty);
	const [slugTouched, setSlugTouched] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [result, setResult] = useState<{
		url: string;
		mailed: boolean | null;
		orgId: string;
	} | null>(null);
	const [pending, start] = useTransition();
	const set =
		<K extends keyof typeof empty>(k: K) =>
		(v: (typeof empty)[K]) =>
			setForm((f) => ({ ...f, [k]: v }));

	const reset = () => {
		setForm(empty);
		setSlugTouched(false);
		setError(null);
		setResult(null);
	};

	return (
		<Dialog
			open={open}
			onOpenChange={(o) => {
				setOpen(o);
				if (!o) {
					if (result) router.refresh();
					reset();
				}
			}}
		>
			<DialogTrigger asChild>
				<Button>{t("create")}</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>{t("createTitle")}</DialogTitle>
					<DialogDescription>{t("createLead")}</DialogDescription>
				</DialogHeader>
				{result ? (
					<InviteLinkPanel
						url={result.url}
						mailed={result.mailed}
						hint={t("createLinkHint")}
						onDone={() => {
							setOpen(false);
							router.push(`/admin/orgs/${result.orgId}`);
							reset();
						}}
					/>
				) : (
					<form
						className="flex flex-col gap-4"
						onSubmit={(e) => {
							e.preventDefault();
							setError(null);
							start(async () => {
								const res = await withStepUp(() =>
									createOrganizationByAdmin({
										name: form.name,
										slug: form.slug,
										status: form.status,
										startedAt: form.startedAt,
										priceGroupId:
											form.group === DEFAULT_GROUP ? null : form.group,
										ownerName: form.ownerName,
										ownerEmail: form.ownerEmail,
										sendMail: form.sendMail,
									}),
								);
								if (!res.ok) {
									setError(
										res.error === "slug_taken"
											? t("err_slug_taken")
											: res.error === "account_exists"
												? t("err_account_exists")
												: errorText(tc, res),
									);
									return;
								}
								setResult({
									url: res.data.url,
									mailed: res.data.mailed,
									orgId: res.data.orgId,
								});
								toast.success(t("created"));
							});
						}}
					>
						<fieldset className="flex flex-col gap-4">
							<legend className="mb-2 font-semibold text-headline">
								{t("createStepOrg")}
							</legend>
							<div className="grid gap-2">
								<Label htmlFor="org-name">{t("orgName")}</Label>
								<Input
									id="org-name"
									name="name"
									required
									maxLength={200}
									autoComplete="organization"
									placeholder={t("orgNamePlaceholder")}
									value={form.name}
									onChange={(e) => {
										set("name")(e.target.value);
										if (!slugTouched) set("slug")(slugify(e.target.value));
									}}
								/>
							</div>
							<div className="grid gap-2">
								<Label htmlFor="org-slug">{t("orgSlug")}</Label>
								<Input
									id="org-slug"
									name="slug"
									required
									maxLength={48}
									pattern="[a-z0-9](?:[a-z0-9\-]*[a-z0-9])?"
									autoComplete="off"
									spellCheck={false}
									translate="no"
									value={form.slug}
									onChange={(e) => {
										setSlugTouched(true);
										set("slug")(e.target.value);
									}}
								/>
								<p className="text-footnote text-muted-foreground">
									{t("orgSlugHint")}
								</p>
							</div>
						</fieldset>
						<fieldset className="flex flex-col gap-4">
							<legend className="mb-2 font-semibold text-headline">
								{t("createStepContract")}
							</legend>
							<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
								<div className="grid gap-2">
									<Label htmlFor="org-status">{t("field_status")}</Label>
									<Select
										value={form.status}
										onValueChange={(v) =>
											set("status")(v as "trial" | "active")
										}
									>
										<SelectTrigger id="org-status" className="w-full">
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="trial">{t("status_trial")}</SelectItem>
											<SelectItem value="active">
												{t("status_active")}
											</SelectItem>
										</SelectContent>
									</Select>
								</div>
								<div className="grid gap-2">
									<Label htmlFor="org-started">{t("field_startedAt")}</Label>
									<Input
										id="org-started"
										name="startedAt"
										type="date"
										value={form.startedAt}
										onChange={(e) => set("startedAt")(e.target.value)}
									/>
								</div>
							</div>
							<div className="grid gap-2">
								<Label htmlFor="org-group">{t("priceGroup")}</Label>
								<Select value={form.group} onValueChange={set("group")}>
									<SelectTrigger id="org-group" className="w-full">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value={DEFAULT_GROUP}>
											{t("priceGroupDefault", {
												name: defaultGroupName ?? "—",
											})}
										</SelectItem>
										{groups.map((g) => (
											<SelectItem key={g.id} value={g.id}>
												{g.name}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
						</fieldset>
						<fieldset className="flex flex-col gap-4">
							<legend className="mb-2 font-semibold text-headline">
								{t("createStepOwner")}
							</legend>
							<div className="grid gap-2">
								<Label htmlFor="owner-name">{t("ownerName")}</Label>
								<Input
									id="owner-name"
									name="ownerName"
									required
									maxLength={120}
									autoComplete="off"
									value={form.ownerName}
									onChange={(e) => set("ownerName")(e.target.value)}
								/>
							</div>
							<div className="grid gap-2">
								<Label htmlFor="owner-email">{t("ownerEmail")}</Label>
								<Input
									id="owner-email"
									name="ownerEmail"
									type="email"
									required
									autoComplete="off"
									spellCheck={false}
									placeholder={t("ownerEmailPlaceholder")}
									value={form.ownerEmail}
									onChange={(e) => set("ownerEmail")(e.target.value)}
								/>
							</div>
							<label className="flex items-center gap-2 text-subhead">
								<Checkbox
									checked={form.sendMail}
									onCheckedChange={(v) => set("sendMail")(v === true)}
								/>
								{t("sendMail")}
							</label>
							<p className="text-footnote text-muted-foreground">
								{t("ownerHint")}
							</p>
						</fieldset>
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
								disabled={
									pending ||
									!form.name.trim() ||
									!form.slug ||
									!form.ownerName.trim() ||
									!form.ownerEmail.trim()
								}
							>
								{pending ? tc("creating") : t("createSubmit")}
							</Button>
						</DialogFooter>
					</form>
				)}
			</DialogContent>
		</Dialog>
	);
}

export type AiAdminValues = {
	aiEnabled: boolean;
	aiMode: AiMode;
	aiMaxClass: AiClassLevel;
};

// KI für die Org freischalten (ADR-032): an/aus, Modus, Obergrenze; Step-up
export function AiAdminDialog({
	orgId,
	values,
}: {
	orgId: string;
	values: AiAdminValues;
}) {
	const t = useTranslations("AdminOrgs");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [form, setForm] = useState(values);
	const [error, setError] = useState<string | null>(null);
	const [pending, start] = useTransition();
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
				<Button variant="secondary">{t("aiEdit")}</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>{t("aiTitle")}</DialogTitle>
					<DialogDescription>{t("aiLead")}</DialogDescription>
				</DialogHeader>
				<form
					className="flex flex-col gap-4"
					onSubmit={(e) => {
						e.preventDefault();
						setError(null);
						start(async () => {
							const res = await withStepUp(() =>
								setOrgAiSettings({ orgId, ...form }),
							);
							if (!res.ok) {
								if (res.error !== "step_up_required")
									setError(errorText(tc, res));
								return;
							}
							toast.success(t("aiSaved"));
							setOpen(false);
							router.refresh();
						});
					}}
				>
					<div className="flex items-center gap-3">
						<Checkbox
							id="ai-enabled"
							checked={form.aiEnabled}
							onCheckedChange={(v) =>
								setForm((f) => ({ ...f, aiEnabled: v === true }))
							}
						/>
						<Label htmlFor="ai-enabled">{t("aiEnabled")}</Label>
					</div>
					<div className="grid gap-2">
						<Label htmlFor="ai-mode">{t("aiMode")}</Label>
						<Select
							value={form.aiMode}
							onValueChange={(v) =>
								setForm((f) => ({ ...f, aiMode: v as AiMode }))
							}
							disabled={!form.aiEnabled}
						>
							<SelectTrigger id="ai-mode" className="w-full">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{AI_MODES.map((m) => (
									<SelectItem key={m} value={m}>
										{t(`aiMode_${m}`)}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
						<p className="text-footnote text-muted-foreground">
							{t(`aiModeHint_${form.aiMode}`)}
						</p>
					</div>
					<div className="grid gap-2">
						<Label htmlFor="ai-class">{t("aiMaxClass")}</Label>
						<Select
							value={form.aiMaxClass}
							onValueChange={(v) =>
								setForm((f) => ({ ...f, aiMaxClass: v as AiClassLevel }))
							}
							disabled={!form.aiEnabled}
						>
							<SelectTrigger id="ai-class" className="w-full">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{AI_CLASS_LEVELS.map((c) => (
									<SelectItem key={c} value={c}>
										{t(`aiClass_${c}`)}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
						<p className="text-footnote text-muted-foreground">
							{t("aiClassHint")}
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
