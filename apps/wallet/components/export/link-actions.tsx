"use client";

import {
	renewKlickLinkToken,
	setKlickLinkState,
} from "@wallet/app/actions/export";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
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
import { withStepUp } from "../auth/step-up-dialog";
import { useExportFeedback } from "./use-export-feedback";

// Pausieren (bremsen) ohne Step-up; fortsetzen, Token erneuern, trennen mit
export function LinkActions({
	linkId,
	status,
	org,
}: {
	linkId: string;
	status: "active" | "paused";
	org: string;
}) {
	const t = useTranslations("Export");
	const tc = useTranslations("Common");
	const router = useRouter();
	const feedback = useExportFeedback();
	const [busy, setBusy] = useState(false);

	async function change(what: "pause" | "resume" | "revoke", ok: string) {
		setBusy(true);
		try {
			const res =
				what === "pause"
					? await setKlickLinkState({ linkId, what })
					: await withStepUp(() => setKlickLinkState({ linkId, what }));
			if (feedback(res, ok)) router.refresh();
		} finally {
			setBusy(false);
		}
	}

	return (
		<div className="flex flex-wrap gap-2">
			{status === "active" ? (
				<Button
					variant="outline"
					size="sm"
					disabled={busy}
					onClick={() => change("pause", t("paused"))}
				>
					{t("pause")}
				</Button>
			) : (
				<Button
					variant="outline"
					size="sm"
					disabled={busy}
					onClick={() => change("resume", t("resumed"))}
				>
					{t("resume")}
				</Button>
			)}
			<RenewTokenDialog linkId={linkId} />
			<AlertDialog>
				<AlertDialogTrigger asChild>
					<Button variant="ghost" size="sm" disabled={busy}>
						{t("revoke")}
					</Button>
				</AlertDialogTrigger>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>{t("revokeTitle")}</AlertDialogTitle>
						<AlertDialogDescription>
							{t("revokeLead", { org })}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>{tc("cancel")}</AlertDialogCancel>
						<AlertDialogAction onClick={() => change("revoke", t("revoked"))}>
							{t("revokeConfirm")}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
}

function RenewTokenDialog({ linkId }: { linkId: string }) {
	const t = useTranslations("Export");
	const tc = useTranslations("Common");
	const router = useRouter();
	const feedback = useExportFeedback();
	const [open, setOpen] = useState(false);
	const [token, setToken] = useState("");
	const [busy, setBusy] = useState(false);

	async function submit(e: React.FormEvent) {
		e.preventDefault();
		setBusy(true);
		try {
			const res = await withStepUp(() =>
				renewKlickLinkToken({ linkId, token: token.trim() }),
			);
			if (feedback(res, t("renewDone"))) {
				setOpen(false);
				setToken("");
				router.refresh();
			}
		} finally {
			setBusy(false);
		}
	}

	return (
		<Dialog
			open={open}
			onOpenChange={(o) => {
				setOpen(o);
				if (!o) setToken("");
			}}
		>
			<DialogTrigger asChild>
				<Button variant="outline" size="sm">
					{t("renew")}
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>{t("renewTitle")}</DialogTitle>
					<DialogDescription>{t("renewLead")}</DialogDescription>
				</DialogHeader>
				<form onSubmit={submit} className="flex flex-col gap-4">
					<div className="grid gap-2">
						<Label htmlFor={`renew-${linkId}`}>{t("token")}</Label>
						<Input
							id={`renew-${linkId}`}
							name="klick-token"
							type="password"
							required
							autoComplete="off"
							spellCheck={false}
							placeholder={t("tokenPlaceholder")}
							value={token}
							onChange={(e) => setToken(e.target.value)}
							className="font-mono text-subhead"
						/>
					</div>
					<div className="flex justify-end gap-2">
						<Button
							type="button"
							variant="ghost"
							onClick={() => setOpen(false)}
						>
							{tc("cancel")}
						</Button>
						<Button type="submit" disabled={busy}>
							{busy ? t("submitting") : t("renew")}
						</Button>
					</div>
				</form>
			</DialogContent>
		</Dialog>
	);
}
