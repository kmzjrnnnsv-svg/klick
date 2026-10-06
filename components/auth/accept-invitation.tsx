"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth/client";

export function AcceptInvitation({ invitationId }: { invitationId: string }) {
	const t = useTranslations("Invitation");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [busy, setBusy] = useState(false);

	async function accept() {
		setBusy(true);
		const res = await authClient.organization.acceptInvitation({
			invitationId,
		});
		setBusy(false);
		if (res.error) {
			toast.error(res.error.message ?? tc("error"));
			return;
		}
		toast.success(t("accepted"));
		router.replace("/heute");
		router.refresh();
	}

	async function decline() {
		setBusy(true);
		await authClient.organization.rejectInvitation({ invitationId });
		setBusy(false);
		router.replace("/login");
	}

	return (
		<div className="flex gap-2">
			<Button variant="brown" onClick={accept} disabled={busy}>
				{t("accept")}
			</Button>
			<Button variant="ghost" onClick={decline} disabled={busy}>
				{t("decline")}
			</Button>
		</div>
	);
}
