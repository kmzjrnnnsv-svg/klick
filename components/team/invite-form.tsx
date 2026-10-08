"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { inviteMember } from "@/app/actions/team";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
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

const ROLES = ["editor", "viewer", "owner", "auditor"] as const;

export function InviteForm() {
	const t = useTranslations("Team");
	const tc = useTranslations("Common");
	const [open, setOpen] = useState(false);
	const [email, setEmail] = useState("");
	const [role, setRole] = useState<(typeof ROLES)[number]>("editor");
	const [busy, setBusy] = useState(false);

	async function submit(e: React.FormEvent) {
		e.preventDefault();
		setBusy(true);
		const res = await inviteMember({ email, role });
		setBusy(false);
		if (!res.ok) {
			// Better Auth liefert lesbare Meldungen („already a member“), unser
			// Sicherheitsnetz nur Codes — die zeigen wir nicht roh an.
			toast.error(res.error.includes(" ") ? res.error : tc("error"));
			return;
		}
		toast.success(t("inviteSent"));
		setEmail("");
		setOpen(false);
	}

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button variant="brown" size="sm">
					{t("invite")}
				</Button>
			</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{t("inviteTitle")}</DialogTitle>
				</DialogHeader>
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
										{t(`role${r[0].toUpperCase()}${r.slice(1)}` as "roleOwner")}{" "}
										—{" "}
										{t(
											`role${r[0].toUpperCase()}${r.slice(1)}Hint` as "roleOwnerHint",
										)}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
					<Button type="submit" variant="brown" disabled={busy || !email}>
						{t("invite")}
					</Button>
				</form>
			</DialogContent>
		</Dialog>
	);
}
