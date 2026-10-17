"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { inviteMember } from "@/app/actions/team";
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

const ROLES = ["editor", "viewer", "consultant", "owner", "auditor"] as const;

// Einladungslink mit Kopier-Knopf (Passkey ohne Mail, ADR-019). Der Token
// steht im Fragment und ist nur jetzt sichtbar — gespeichert ist der Hash.
export function InviteLinkPanel({
	url,
	mailed,
	onDone,
}: {
	url: string;
	// null = keine Mail gewollt
	mailed: boolean | null;
	onDone: () => void;
}) {
	const t = useTranslations("Team");
	const tc = useTranslations("Common");
	return (
		<div className="flex flex-col gap-3">
			<Input
				readOnly
				value={url}
				aria-label={t("inviteLink")}
				className="font-mono text-xs"
				onFocus={(e) => e.currentTarget.select()}
			/>
			<p className="text-muted-foreground text-xs">{t("inviteLinkHint")}</p>
			{mailed !== null && (
				<p
					className={
						mailed
							? "text-muted-foreground text-xs"
							: "text-destructive text-xs"
					}
				>
					{mailed ? t("inviteMailed") : t("inviteMailFailed")}
				</p>
			)}
			<DialogFooter>
				<Button
					variant="outline"
					onClick={() =>
						navigator.clipboard
							.writeText(url)
							.then(() => toast.success(t("inviteLinkCopied")))
							.catch(() => toast.error(tc("error")))
					}
				>
					{t("inviteLinkCopy")}
				</Button>
				<Button variant="brown" onClick={onDone}>
					{t("inviteDone")}
				</Button>
			</DialogFooter>
		</div>
	);
}

export function InviteForm() {
	const t = useTranslations("Team");
	const tc = useTranslations("Common");
	const [open, setOpen] = useState(false);
	const [email, setEmail] = useState("");
	const [role, setRole] = useState<(typeof ROLES)[number]>("editor");
	const [sendMail, setSendMail] = useState(true);
	const [busy, setBusy] = useState(false);
	const [result, setResult] = useState<{
		url: string;
		mailed: boolean | null;
	} | null>(null);

	async function submit(e: React.FormEvent) {
		e.preventDefault();
		setBusy(true);
		const res = await inviteMember({ email, role, sendMail });
		setBusy(false);
		if (!res.ok) {
			// Better Auth liefert lesbare Meldungen („already a member“), unser
			// Sicherheitsnetz nur Codes — die zeigen wir nicht roh an.
			toast.error(res.error.includes(" ") ? res.error : tc("error"));
			return;
		}
		setResult({ url: res.data.url, mailed: res.data.mailed });
		setEmail("");
	}

	return (
		<Dialog
			open={open}
			onOpenChange={(o) => {
				setOpen(o);
				if (!o) setResult(null);
			}}
		>
			<DialogTrigger asChild>
				<Button variant="brown" size="sm">
					{t("invite")}
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>
						{result ? t("inviteLinkTitle") : t("inviteTitle")}
					</DialogTitle>
					<DialogDescription>
						{result ? t("inviteLinkLead") : t("inviteLead")}
					</DialogDescription>
				</DialogHeader>
				{result ? (
					<InviteLinkPanel
						url={result.url}
						mailed={result.mailed}
						onDone={() => {
							setOpen(false);
							setResult(null);
						}}
					/>
				) : (
					<form onSubmit={submit} className="flex flex-col gap-4">
						<div className="grid gap-2">
							<Label htmlFor="invite-email">{t("inviteEmail")}</Label>
							<Input
								id="invite-email"
								type="email"
								required
								value={email}
								onChange={(e) => setEmail(e.target.value)}
							/>
						</div>
						<div className="grid gap-2">
							<Label>{t("inviteRole")}</Label>
							<Select
								value={role}
								onValueChange={(v) => setRole(v as (typeof ROLES)[number])}
							>
								<SelectTrigger className="w-full">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{ROLES.map((r) => (
										<SelectItem key={r} value={r}>
											{t(
												`role${r[0].toUpperCase()}${r.slice(1)}` as "roleOwner",
											)}{" "}
											—{" "}
											{t(
												`role${r[0].toUpperCase()}${r.slice(1)}Hint` as "roleOwnerHint",
											)}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
						<label className="flex items-center gap-2 text-sm">
							<Checkbox
								checked={sendMail}
								onCheckedChange={(v) => setSendMail(v === true)}
							/>
							{t("inviteSendMail")}
						</label>
						<Button type="submit" variant="brown" disabled={busy || !email}>
							{t("invite")}
						</Button>
					</form>
				)}
			</DialogContent>
		</Dialog>
	);
}
