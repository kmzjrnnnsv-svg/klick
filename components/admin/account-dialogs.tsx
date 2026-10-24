"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import {
	createAccount,
	renewActivationLink,
	withdrawAccount,
} from "@/app/actions/admin";
import { withStepUp } from "@/components/auth/step-up-dialog";
import { InviteLinkPanel } from "@/components/team/invite-form";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import type { OrgRole } from "@/lib/auth/session-rules";

// Admin → Benutzer: Konto anlegen, Aktivierungslink neu erzeugen, Anlage
// zurücknehmen. Der Link (/aktivieren#klk_activate_…) ist nur hier sichtbar.

const ROLES = [
	"editor",
	"viewer",
	"owner",
	"consultant",
	"auditor",
] as const satisfies readonly OrgRole[];
const NO_ORG = "__none";
const roleKey = (r: OrgRole) =>
	`role${r[0].toUpperCase()}${r.slice(1)}` as "roleOwner";

type LinkResult = { url: string; mailed: boolean | null };

function useErrorText() {
	const t = useTranslations("AdminAccounts");
	const tc = useTranslations("Common");
	const ta = useTranslations("Auth");
	return (error: string) =>
		error === "account_exists"
			? t("errorExists")
			: error === "not_pending"
				? t("errorNotPending")
				: error === "account_blocked"
					? t("errorBlocked")
					: error === "step_up_required"
						? ta("twoFactorStepUp")
						: // Better Auth liefert lesbare Sätze, das Sicherheitsnetz nur Codes
							error.includes(" ")
							? error
							: tc("error");
}

export function CreateAccountDialog({
	orgs,
	days,
}: {
	orgs: { id: string; name: string }[];
	days: number;
}) {
	const t = useTranslations("AdminAccounts");
	const tt = useTranslations("Team");
	const errorText = useErrorText();
	const [open, setOpen] = useState(false);
	const [email, setEmail] = useState("");
	const [name, setName] = useState("");
	const [orgId, setOrgId] = useState(NO_ORG);
	const [role, setRole] = useState<OrgRole>("editor");
	const [sendMail, setSendMail] = useState(true);
	const [busy, setBusy] = useState(false);
	const [result, setResult] = useState<(LinkResult & { name: string }) | null>(
		null,
	);

	function reset() {
		setEmail("");
		setName("");
		setOrgId(NO_ORG);
		setRole("editor");
		setSendMail(true);
		setResult(null);
	}

	async function submit(e: React.FormEvent) {
		e.preventDefault();
		setBusy(true);
		try {
			const withOrg = orgId !== NO_ORG;
			const res = await withStepUp(() =>
				createAccount({
					email,
					name,
					organizationId: withOrg ? orgId : null,
					role: withOrg ? role : null,
					sendMail,
				}),
			);
			if (!res.ok) {
				toast.error(
					res.fieldErrors?.role ? t("errorOrgRole") : errorText(res.error),
				);
				return;
			}
			setResult({ url: res.data.url, mailed: res.data.mailed, name });
		} finally {
			setBusy(false);
		}
	}

	return (
		<Dialog
			open={open}
			onOpenChange={(o) => {
				setOpen(o);
				if (!o) reset();
			}}
		>
			<DialogTrigger asChild>
				<Button size="sm">{t("create")}</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>{result ? t("linkTitle") : t("create")}</DialogTitle>
					<DialogDescription>
						{result
							? t("linkLead", { name: result.name, days })
							: t("createLead")}
					</DialogDescription>
				</DialogHeader>
				{result ? (
					<InviteLinkPanel
						url={result.url}
						mailed={result.mailed}
						hint={t("linkHint")}
						onDone={() => {
							setOpen(false);
							reset();
						}}
					/>
				) : (
					<form onSubmit={submit} className="flex flex-col gap-4">
						<div className="grid gap-2">
							<Label htmlFor="account-email">{t("email")}</Label>
							<Input
								id="account-email"
								name="email"
								type="email"
								autoComplete="off"
								spellCheck={false}
								required
								value={email}
								onChange={(e) => setEmail(e.target.value)}
							/>
						</div>
						<div className="grid gap-2">
							<Label htmlFor="account-name">{t("name")}</Label>
							<Input
								id="account-name"
								name="name"
								autoComplete="off"
								required
								maxLength={120}
								value={name}
								onChange={(e) => setName(e.target.value)}
							/>
						</div>
						<div className="grid gap-2">
							<Label htmlFor="account-org">{t("org")}</Label>
							<Select value={orgId} onValueChange={setOrgId}>
								<SelectTrigger id="account-org" className="w-full">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value={NO_ORG}>{t("orgNone")}</SelectItem>
									{orgs.map((o) => (
										<SelectItem key={o.id} value={o.id}>
											{o.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
						{orgId !== NO_ORG && (
							<div className="grid gap-2">
								<Label htmlFor="account-role">{t("role")}</Label>
								<Select
									value={role}
									onValueChange={(v) => setRole(v as OrgRole)}
								>
									<SelectTrigger id="account-role" className="w-full">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										{ROLES.map((r) => (
											<SelectItem key={r} value={r}>
												{tt(roleKey(r))}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
						)}
						<label className="flex items-center gap-2 text-subhead">
							<Checkbox
								checked={sendMail}
								onCheckedChange={(v) => setSendMail(v === true)}
							/>
							{t("sendMail")}
						</label>
						<Button
							type="submit"
							disabled={busy || !email.trim() || !name.trim()}
						>
							{busy ? t("submitting") : t("submit")}
						</Button>
					</form>
				)}
			</DialogContent>
		</Dialog>
	);
}

export function RenewLinkDialog({
	open,
	onOpenChange,
	userId,
	name,
	days,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	userId: string;
	name: string;
	days: number;
}) {
	const t = useTranslations("AdminAccounts");
	const tc = useTranslations("Common");
	const errorText = useErrorText();
	const [sendMail, setSendMail] = useState(true);
	const [busy, setBusy] = useState(false);
	const [result, setResult] = useState<LinkResult | null>(null);

	function close() {
		setResult(null);
		setSendMail(true);
		onOpenChange(false);
	}

	async function confirm() {
		setBusy(true);
		try {
			const res = await withStepUp(() => renewActivationLink(userId, sendMail));
			if (!res.ok) {
				toast.error(errorText(res.error));
				return;
			}
			setResult({ url: res.data.url, mailed: res.data.mailed });
		} finally {
			setBusy(false);
		}
	}

	return (
		<Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(o) : close())}>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>{result ? t("linkTitle") : t("renew")}</DialogTitle>
					<DialogDescription>
						{result
							? t("linkLead", { name, days })
							: t("renewLead", { name, days })}
					</DialogDescription>
				</DialogHeader>
				{result ? (
					<InviteLinkPanel
						url={result.url}
						mailed={result.mailed}
						hint={t("linkHint")}
						onDone={close}
					/>
				) : (
					<>
						<label className="flex items-center gap-2 text-subhead">
							<Checkbox
								checked={sendMail}
								onCheckedChange={(v) => setSendMail(v === true)}
							/>
							{t("sendMail")}
						</label>
						<DialogFooter>
							<Button variant="outline" onClick={close}>
								{tc("cancel")}
							</Button>
							<Button onClick={confirm} disabled={busy}>
								{t("renewConfirm")}
							</Button>
						</DialogFooter>
					</>
				)}
			</DialogContent>
		</Dialog>
	);
}

export function WithdrawAccountDialog({
	open,
	onOpenChange,
	userId,
	email,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	userId: string;
	email: string;
}) {
	const t = useTranslations("AdminAccounts");
	const tc = useTranslations("Common");
	const errorText = useErrorText();
	const [busy, setBusy] = useState(false);

	async function confirm() {
		setBusy(true);
		try {
			const res = await withStepUp(() => withdrawAccount(userId));
			if (!res.ok) {
				toast.error(errorText(res.error));
				return;
			}
			toast.success(t("withdrawn"));
			onOpenChange(false);
		} finally {
			setBusy(false);
		}
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>{t("withdrawTitle")}</DialogTitle>
					<DialogDescription>{t("withdrawLead", { email })}</DialogDescription>
				</DialogHeader>
				<DialogFooter>
					<Button variant="outline" onClick={() => onOpenChange(false)}>
						{tc("cancel")}
					</Button>
					<Button variant="destructive" onClick={confirm} disabled={busy}>
						{t("withdrawConfirm")}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
