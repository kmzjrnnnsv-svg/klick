"use client";

import { Undo2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { withdrawDecisionRequest } from "@/app/actions/decisions";
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
import { errorText } from "@/components/ui/error-text";
import { toast } from "@/components/ui/toast";

// Eigene offene Managementanfrage zurückziehen (zieht auch den Antrag zurück)
export function WithdrawDecisionButton({
	id,
	code,
}: {
	id: string;
	code: string;
}) {
	const t = useTranslations("Decisions");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [pending, start] = useTransition();
	return (
		<AlertDialog>
			<AlertDialogTrigger asChild>
				<Button size="sm" variant="ghost" disabled={pending}>
					<Undo2 aria-hidden />
					{t("withdraw")}
				</Button>
			</AlertDialogTrigger>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>{t("withdrawConfirm", { code })}</AlertDialogTitle>
					<AlertDialogDescription>{t("withdrawLead")}</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
					<AlertDialogAction
						onClick={() =>
							start(async () => {
								const res = await withdrawDecisionRequest(id);
								if (!res.ok) {
									toast.error(errorText(tc, res));
									return;
								}
								toast.success(t("withdrawDone"));
								router.refresh();
							})
						}
					>
						{t("withdraw")}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
