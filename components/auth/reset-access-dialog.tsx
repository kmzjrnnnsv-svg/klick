"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { withStepUp } from "@/components/auth/step-up-dialog";
import { InviteLinkPanel } from "@/components/team/invite-form";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import type { ActionResult } from "@/lib/validation/common";

// Zugang zurücksetzen (ADR-019) für Owner (/team) und Plattform-Admins
// (/admin/users): bestätigen → Step-up → Link für den neuen Passkey anzeigen.
export function ResetAccessDialog({
	open,
	onOpenChange,
	name,
	run,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	name: string;
	run: () => Promise<ActionResult<{ url: string }>>;
}) {
	const t = useTranslations("Team");
	const tc = useTranslations("Common");
	const ta = useTranslations("Auth");
	const [busy, setBusy] = useState(false);
	const [url, setUrl] = useState<string | null>(null);

	function close() {
		setUrl(null);
		onOpenChange(false);
	}

	async function confirm() {
		setBusy(true);
		try {
			const res = await withStepUp(run);
			if (res.ok) {
				setUrl(res.data.url);
				return;
			}
			toast.error(
				res.error === "reset_other_orgs"
					? t("resetErrorOtherOrgs")
					: res.error === "reset_platform_admin"
						? t("resetErrorPlatform")
						: res.error === "step_up_required"
							? ta("twoFactorStepUp")
							: tc("error"),
			);
		} finally {
			setBusy(false);
		}
	}

	return (
		<Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(o) : close())}>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>
						{url ? t("resetLinkTitle") : t("resetTitle")}
					</DialogTitle>
					<DialogDescription>
						{url ? t("resetLinkLead", { name }) : t("resetLead", { name })}
					</DialogDescription>
				</DialogHeader>
				{url ? (
					<InviteLinkPanel
						url={url}
						mailed={null}
						hint={t("resetLinkHint")}
						onDone={close}
					/>
				) : (
					<DialogFooter>
						<Button variant="outline" onClick={close}>
							{tc("cancel")}
						</Button>
						<Button variant="destructive" onClick={confirm} disabled={busy}>
							{t("resetConfirm")}
						</Button>
					</DialogFooter>
				)}
			</DialogContent>
		</Dialog>
	);
}
