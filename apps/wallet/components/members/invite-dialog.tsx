"use client";

import { inviteMember } from "@wallet/app/actions/members";
import type { MemberRole } from "@wallet/db/schema/enums";
import { Copy, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
	Dialog,
	DialogContent,
	DialogDescription,
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
import { withStepUp } from "../auth/step-up-dialog";
import { useActionFeedback } from "./use-action-feedback";

export function InviteDialog({
	roles,
}: {
	roles: { value: MemberRole; label: string }[];
}) {
	const t = useTranslations("Members");
	const tc = useTranslations("Common");
	const router = useRouter();
	const feedback = useActionFeedback();
	const [open, setOpen] = useState(false);
	const [email, setEmail] = useState("");
	const [role, setRole] = useState<MemberRole>("viewer");
	const [sendMail, setSendMail] = useState(false);
	const [busy, setBusy] = useState(false);
	const [result, setResult] = useState<{ url: string; mailed: boolean } | null>(
		null,
	);

	function reset(o: boolean) {
		setOpen(o);
		if (!o) {
			setEmail("");
			setRole("viewer");
			setSendMail(false);
			setResult(null);
		}
	}

	async function submit(e: React.FormEvent) {
		e.preventDefault();
		setBusy(true);
		try {
			const res = await withStepUp(() =>
				inviteMember({ email, role, sendMail }),
			);
			if (!feedback(res) || !res.ok) return;
			setResult(res.data);
			router.refresh();
		} finally {
			setBusy(false);
		}
	}

	return (
		<Dialog open={open} onOpenChange={reset}>
			<DialogTrigger asChild>
				<Button>
					<UserPlus aria-hidden /> {t("invite")}
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>{t("inviteTitle")}</DialogTitle>
					<DialogDescription>{t("inviteLead")}</DialogDescription>
				</DialogHeader>
				{result ? (
					<div className="flex flex-col gap-3">
						<Label htmlFor="invite-link">{t("linkReady")}</Label>
						<div className="flex gap-2">
							<Input
								id="invite-link"
								readOnly
								value={result.url}
								className="font-mono text-footnote"
								spellCheck={false}
							/>
							<Button
								type="button"
								variant="outline"
								aria-label={tc("copy")}
								onClick={async () => {
									await navigator.clipboard.writeText(result.url);
									toast.success(tc("copied"));
								}}
							>
								<Copy aria-hidden />
							</Button>
						</div>
						<p className="text-muted-foreground text-footnote">
							{t("linkHint")}
						</p>
						{sendMail && (
							<p className="text-subhead" aria-live="polite">
								{result.mailed ? t("mailed") : t("mailFailed")}
							</p>
						)}
					</div>
				) : (
					<form onSubmit={submit} className="flex flex-col gap-4">
						<div className="grid gap-2">
							<Label htmlFor="invite-email">{t("email")}</Label>
							<Input
								id="invite-email"
								type="email"
								name="email"
								autoComplete="off"
								spellCheck={false}
								required
								value={email}
								onChange={(e) => setEmail(e.target.value)}
								placeholder="name@firma.de …"
							/>
						</div>
						<div className="grid gap-2">
							<Label htmlFor="invite-role">{t("role")}</Label>
							<Select
								value={role}
								onValueChange={(v) => setRole(v as MemberRole)}
							>
								<SelectTrigger id="invite-role">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{roles.map((r) => (
										<SelectItem key={r.value} value={r.value}>
											{r.label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
						<label className="flex items-center gap-2 text-subhead">
							<Checkbox
								checked={sendMail}
								onCheckedChange={(v) => setSendMail(v === true)}
							/>
							{t("sendMail")}
						</label>
						<Button type="submit" disabled={busy}>
							{busy ? t("inviteBusy") : t("inviteSubmit")}
						</Button>
					</form>
				)}
			</DialogContent>
		</Dialog>
	);
}
