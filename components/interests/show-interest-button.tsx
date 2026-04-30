"use client";

import { Mail } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { InterestModal } from "@/components/interests/interest-modal";
import { Button } from "@/components/ui/button";

export function ShowInterestButton({
	matchId,
	currentStatus,
}: {
	matchId: string;
	currentStatus: "pending" | "approved" | "rejected" | "expired" | null;
}) {
	const t = useTranslations("Interest");
	const [open, setOpen] = useState(false);

	if (currentStatus === "pending") {
		return (
			<span className="inline-flex h-9 items-center rounded-md border border-amber-500/40 bg-amber-500/10 px-3 text-amber-700 text-xs dark:text-amber-300">
				{t("waitingApproval")}
			</span>
		);
	}
	if (currentStatus === "approved") {
		return (
			<span className="inline-flex h-9 items-center rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 text-emerald-700 text-xs dark:text-emerald-300">
				{t("approved")}
			</span>
		);
	}
	if (currentStatus === "rejected" || currentStatus === "expired") {
		return (
			<span className="inline-flex h-9 items-center rounded-md border border-rose-500/40 bg-rose-500/10 px-3 text-rose-700 text-xs dark:text-rose-300">
				{t(currentStatus === "rejected" ? "rejected" : "approved")}
			</span>
		);
	}

	return (
		<>
			<Button size="sm" onClick={() => setOpen(true)}>
				<Mail className="h-4 w-4" strokeWidth={1.5} /> {t("showInterest")}
			</Button>
			{open && (
				<InterestModal
					matchId={matchId}
					onClose={() => setOpen(false)}
					onSuccess={() => {
						setOpen(false);
						window.location.reload();
					}}
				/>
			)}
		</>
	);
}
