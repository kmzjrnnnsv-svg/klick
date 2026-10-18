"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { banUser } from "@/app/actions/admin";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
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

// Konto sperren (Admin → Nutzer:innen): Grund ist Pflicht, Ende optional.
// Better Auth beendet alle Sitzungen und hebt eine befristete Sperre beim
// nächsten Anmeldeversuch nach Ablauf selbst auf.

const DURATIONS = ["forever", "7", "30", "until"] as const;
type Duration = (typeof DURATIONS)[number];
const DAY = 24 * 60 * 60 * 1000;

const durationKey = (d: Duration) =>
	d === "forever"
		? "banForever"
		: d === "until"
			? "banUntil"
			: (`ban${d}` as "ban7" | "ban30");

function isoDay(d: Date) {
	return d.toISOString().slice(0, 10);
}

export function BanDialog({
	open,
	onOpenChange,
	userId,
	name,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	userId: string;
	name: string;
}) {
	const t = useTranslations("AdminAccounts");
	const tc = useTranslations("Common");
	const [reason, setReason] = useState("");
	const [duration, setDuration] = useState<Duration>("forever");
	const [date, setDate] = useState("");
	const [busy, setBusy] = useState(false);
	const tomorrow = isoDay(new Date(Date.now() + DAY));

	function close() {
		setReason("");
		setDuration("forever");
		setDate("");
		onOpenChange(false);
	}

	function until(): Date | null {
		if (duration === "forever") return null;
		if (duration === "until")
			// Ende des gewählten Tages (lokale Zeit)
			return date ? new Date(`${date}T23:59:59`) : null;
		return new Date(Date.now() + Number(duration) * DAY);
	}

	async function submit(e: React.FormEvent) {
		e.preventDefault();
		setBusy(true);
		try {
			const res = await banUser({ userId, reason, until: until() });
			if (!res.ok) {
				toast.error(
					res.error === "ban_admin"
						? t("errorBanAdmin")
						: res.error === "ban_until_past"
							? t("errorBanUntil")
							: res.error.includes(" ")
								? res.error
								: tc("error"),
				);
				return;
			}
			toast.success(t("banned"));
			close();
		} finally {
			setBusy(false);
		}
	}

	return (
		<Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(o) : close())}>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>{t("banTitle", { name })}</DialogTitle>
					<DialogDescription>{t("banLead")}</DialogDescription>
				</DialogHeader>
				<form onSubmit={submit} className="flex flex-col gap-4">
					<div className="grid gap-2">
						<Label htmlFor="ban-reason">{t("banReason")}</Label>
						<Input
							id="ban-reason"
							name="reason"
							autoComplete="off"
							required
							minLength={3}
							maxLength={200}
							value={reason}
							onChange={(e) => setReason(e.target.value)}
						/>
						<p className="text-muted-foreground text-xs">
							{t("banReasonHint")}
						</p>
					</div>
					<div className="grid gap-2">
						<Label htmlFor="ban-duration">{t("banDuration")}</Label>
						<Select
							value={duration}
							onValueChange={(v) => setDuration(v as Duration)}
						>
							<SelectTrigger id="ban-duration" className="w-full">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{DURATIONS.map((d) => (
									<SelectItem key={d} value={d}>
										{t(durationKey(d))}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
					{duration === "until" && (
						<div className="grid gap-2">
							<Label htmlFor="ban-until">{t("banUntilDate")}</Label>
							<Input
								id="ban-until"
								name="until"
								type="date"
								required
								min={tomorrow}
								value={date}
								onChange={(e) => setDate(e.target.value)}
							/>
						</div>
					)}
					<DialogFooter>
						<Button type="button" variant="outline" onClick={close}>
							{tc("cancel")}
						</Button>
						<Button
							type="submit"
							variant="destructive"
							disabled={
								busy ||
								reason.trim().length < 3 ||
								(duration === "until" && !date)
							}
						>
							{t("banConfirm")}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
