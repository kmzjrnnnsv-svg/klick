"use client";

import { Check, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { decideInterest } from "@/app/actions/interests";
import { Button } from "@/components/ui/button";

export function DecisionButtons({ interestId }: { interestId: string }) {
	const t = useTranslations("Interest");
	const router = useRouter();
	const [isPending, startTransition] = useTransition();
	const [error, setError] = useState<string | null>(null);

	function decide(approve: boolean) {
		setError(null);
		startTransition(async () => {
			try {
				await decideInterest(interestId, approve);
				router.refresh();
			} catch (e) {
				setError(e instanceof Error ? e.message : String(e));
			}
		});
	}

	return (
		<div className="space-y-3">
			<div className="flex gap-3">
				<Button
					onClick={() => decide(true)}
					disabled={isPending}
					className="flex-1"
				>
					<Check className="h-4 w-4" strokeWidth={1.5} />
					{t("approveAction")}
				</Button>
				<Button
					variant="outline"
					onClick={() => decide(false)}
					disabled={isPending}
					className="flex-1"
				>
					<X className="h-4 w-4" strokeWidth={1.5} />
					{t("rejectAction")}
				</Button>
			</div>
			<p className="text-muted-foreground text-xs">{t("decideHint")}</p>
			{error && (
				<p className="rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-rose-700 text-xs dark:text-rose-300">
					{error}
				</p>
			)}
		</div>
	);
}
