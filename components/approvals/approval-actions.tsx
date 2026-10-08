"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { decideApproval, withdrawApproval } from "@/app/actions/approvals";
import { withStepUp } from "@/components/auth/step-up-dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

// Entscheidung mit einem Klick (auch mobil, Deep-Link aus der Mail).
export function ApprovalActions({
	requestId,
	eligible,
	mine,
	compact,
}: {
	requestId: string;
	eligible: boolean;
	mine: boolean;
	compact?: boolean;
}) {
	const t = useTranslations("Approvals");
	const ts = useTranslations("Settings");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [note, setNote] = useState("");
	const [pending, start] = useTransition();

	function run(decision: "approved" | "rejected" | "changes_requested") {
		start(async () => {
			const res = await withStepUp(() =>
				decideApproval({
					requestId,
					decision,
					note: note || undefined,
				}),
			);
			if (!res.ok) {
				if (res.error === "step_up_required") toast.error(ts("stepUp"));
				else if (
					res.error.startsWith("four_eyes") ||
					res.error.startsWith("rule_not_met") ||
					res.error.startsWith("not_pending")
				)
					toast.error(t(`errors_${res.error}` as "errors_four_eyes"));
				else toast.error(tc("error"));
				return;
			}
			toast.success(t(`decided_${decision}`));
			setNote("");
			router.refresh();
		});
	}

	if (!eligible && !mine) return null;
	return (
		<div
			className={
				compact ? "flex flex-wrap items-center gap-2" : "flex flex-col gap-2"
			}
		>
			{eligible && (
				<>
					{!compact && (
						<Textarea
							value={note}
							onChange={(e) => setNote(e.target.value)}
							rows={2}
							placeholder={t("note")}
							aria-label={t("note")}
						/>
					)}
					<div className="flex flex-wrap gap-2">
						<Button
							size="sm"
							variant="brown"
							disabled={pending}
							onClick={() => run("approved")}
						>
							{t("approve")}
						</Button>
						<Button
							size="sm"
							variant="outline"
							disabled={pending}
							onClick={() => run("changes_requested")}
						>
							{t("changes")}
						</Button>
						<Button
							size="sm"
							variant="destructive"
							disabled={pending}
							onClick={() => run("rejected")}
						>
							{t("reject")}
						</Button>
					</div>
				</>
			)}
			{mine && (
				<Button
					size="sm"
					variant="ghost"
					disabled={pending}
					className="normal-case tracking-normal"
					onClick={() =>
						start(async () => {
							const res = await withdrawApproval(requestId);
							if (!res.ok) toast.error(tc("error"));
							else {
								toast.success(t("withdrawn"));
								router.refresh();
							}
						})
					}
				>
					{t("withdraw")}
				</Button>
			)}
		</div>
	);
}
