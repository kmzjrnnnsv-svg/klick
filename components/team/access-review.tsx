"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { recordAccessReview } from "@/app/actions/registers";
import { Button } from "@/components/ui/button";
import { errorText } from "@/components/ui/error-text";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";

export function AccessReview({ lastAt }: { lastAt: Date | null }) {
	const t = useTranslations("Team");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [note, setNote] = useState("");
	const [pending, start] = useTransition();
	return (
		<div className="flex flex-col gap-2 rounded-2xl bg-card p-3 text-subhead">
			<p className="font-medium">{t("accessReview")}</p>
			<p className="text-muted-foreground text-footnote">
				{t("accessReviewLead")}
				{lastAt
					? ` Zuletzt: ${new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeZone: "Europe/Berlin" }).format(lastAt)}`
					: ""}
			</p>
			<Textarea
				rows={2}
				value={note}
				onChange={(e) => setNote(e.target.value)}
				placeholder="Ergebnis / Änderungen"
			/>
			<div className="flex justify-end">
				<Button
					size="sm"
					variant="outline"
					disabled={pending}
					onClick={() =>
						start(async () => {
							const res = await recordAccessReview(note);
							if (!res.ok) toast.error(errorText(tc, res));
							else {
								toast.success(t("accessReviewDone"));
								setNote("");
								router.refresh();
							}
						})
					}
				>
					{t("accessReview")}
				</Button>
			</div>
		</div>
	);
}
