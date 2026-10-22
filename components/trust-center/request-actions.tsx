"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
	approveTrustRequest,
	rejectTrustRequest,
	revokeTrustAccess,
} from "@/app/actions/trust-center";
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
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { TRUST_ACCESS_DAYS, type TrustRequestState } from "@/lib/trust/rules";

// Anfrage freigeben (Step-up, Link einmal zum Kopieren, Mail optional),
// ablehnen mit Grund, Zugang widerrufen.
export function RequestActions({
	id,
	name,
	state,
}: {
	id: string;
	name: string;
	state: TrustRequestState;
}) {
	const t = useTranslations("TrustCenter");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [pending, start] = useTransition();
	const [open, setOpen] = useState<"approve" | "reject" | "revoke" | null>(
		null,
	);
	const [days, setDays] = useState("14");
	const [sendMail, setSendMail] = useState(true);
	const [note, setNote] = useState("");
	const [link, setLink] = useState<{ url: string; mailed: boolean } | null>(
		null,
	);

	function close() {
		setOpen(null);
		setLink(null);
		setNote("");
		if (link) router.refresh();
	}

	const approve = () =>
		start(async () => {
			const res = await withStepUp(() =>
				approveTrustRequest({ id, days: Number(days), sendMail }),
			);
			if (!res.ok) {
				toast.error(res.error === "notFound" ? t("errorGone") : tc("error"));
				return;
			}
			setLink({ url: res.data.url, mailed: res.data.mailed });
		});

	const decide = (kind: "reject" | "revoke") =>
		start(async () => {
			const fn = kind === "reject" ? rejectTrustRequest : revokeTrustAccess;
			const res = await fn({ id, note: note || null });
			if (!res.ok) {
				toast.error(res.error === "notFound" ? t("errorGone") : tc("error"));
				return;
			}
			toast.success(kind === "reject" ? t("rejected") : t("revoked"));
			close();
			router.refresh();
		});

	return (
		<>
			<div className="flex flex-wrap justify-end gap-2">
				{state === "pending" && (
					<>
						<Button size="sm" onClick={() => setOpen("approve")}>
							{t("approve")}
						</Button>
						<Button
							size="sm"
							variant="outline"
							onClick={() => setOpen("reject")}
						>
							{t("reject")}
						</Button>
					</>
				)}
				{state === "active" && (
					<Button size="sm" variant="outline" onClick={() => setOpen("revoke")}>
						{t("revoke")}
					</Button>
				)}
			</div>

			<Dialog open={open === "approve"} onOpenChange={(o) => !o && close()}>
				<DialogContent className="sm:max-w-lg">
					<DialogHeader>
						<DialogTitle>
							{link ? t("linkTitle") : t("approveTitle", { name })}
						</DialogTitle>
						<DialogDescription>
							{link ? t("linkLead") : t("approveLead")}
						</DialogDescription>
					</DialogHeader>
					{link ? (
						<InviteLinkPanel
							url={link.url}
							mailed={sendMail ? link.mailed : null}
							hint={t("linkHint")}
							onDone={close}
						/>
					) : (
						<>
							<div className="flex flex-col gap-1.5">
								<Label htmlFor={`tc-days-${id}`}>{t("fieldDays")}</Label>
								<Select value={days} onValueChange={setDays}>
									<SelectTrigger id={`tc-days-${id}`} className="w-40">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										{TRUST_ACCESS_DAYS.map((d) => (
											<SelectItem key={d} value={String(d)}>
												{t("days", { n: d })}
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
								{t("sendMail")}
							</label>
							<DialogFooter>
								<Button variant="outline" onClick={close}>
									{tc("cancel")}
								</Button>
								<Button onClick={approve} disabled={pending}>
									{t("approveConfirm")}
								</Button>
							</DialogFooter>
						</>
					)}
				</DialogContent>
			</Dialog>

			<Dialog
				open={open === "reject" || open === "revoke"}
				onOpenChange={(o) => !o && close()}
			>
				<DialogContent className="sm:max-w-lg">
					<DialogHeader>
						<DialogTitle>
							{open === "revoke"
								? t("revokeTitle", { name })
								: t("rejectTitle", { name })}
						</DialogTitle>
						<DialogDescription>
							{open === "revoke" ? t("revokeLead") : t("rejectLead")}
						</DialogDescription>
					</DialogHeader>
					<div className="flex flex-col gap-1.5">
						<Label htmlFor={`tc-note-${id}`}>{t("fieldNote")}</Label>
						<Textarea
							id={`tc-note-${id}`}
							rows={3}
							value={note}
							onChange={(e) => setNote(e.target.value)}
						/>
					</div>
					<DialogFooter>
						<Button variant="outline" onClick={close}>
							{tc("cancel")}
						</Button>
						<Button
							variant="destructive"
							disabled={pending}
							onClick={() => decide(open === "revoke" ? "revoke" : "reject")}
						>
							{open === "revoke" ? t("revokeConfirm") : t("rejectConfirm")}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
}
