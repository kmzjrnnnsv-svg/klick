"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { deleteEvidence } from "@/app/actions/evidence";
import { withStepUp } from "@/components/auth/step-up-dialog";
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

// Nachweis löschen (Step-up): Zeile sofort weg, Datei nach der Backup-
// Aufbewahrung. Unterschriebene Nachweise lehnt der Server ab.
export function DeleteEvidenceButton({ id }: { id: string }) {
	const t = useTranslations("Evidence");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [pending, start] = useTransition();
	return (
		<AlertDialog>
			<AlertDialogTrigger asChild>
				<Button
					variant="ghost"
					size="sm"
					className="text-destructive"
					disabled={pending}
				>
					<Trash2 aria-hidden="true" />
					{t("delete")}
				</Button>
			</AlertDialogTrigger>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>{t("deleteTitle")}</AlertDialogTitle>
					<AlertDialogDescription>{t("deleteConfirm")}</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>{tc("cancel")}</AlertDialogCancel>
					<AlertDialogAction
						onClick={() =>
							start(async () => {
								const res = await withStepUp(() => deleteEvidence(id));
								if (!res.ok) {
									if (res.error !== "step_up_required")
										toast.error(
											res.error === "signed"
												? t("deleteSigned")
												: errorText(tc, res),
										);
									return;
								}
								toast.success(t("deleted"));
								router.push("/nachweise");
							})
						}
					>
						{t("delete")}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
