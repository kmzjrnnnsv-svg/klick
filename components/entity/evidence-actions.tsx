"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { toast } from "sonner";
import { deleteEvidence, setControlEvidence } from "@/app/actions/evidence";
import { withStepUp } from "@/components/auth/step-up-dialog";
import { type LinkOption, LinksDialog } from "@/components/entity/links-dialog";
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

// Vorhandene Nachweise einem Control zuordnen bzw. falsche Zuordnungen lösen
// (die Datei bleibt erhalten — ein PDF kann mehrere Controls belegen).
export function ControlEvidencePicker({
	implementationId,
	options,
	linked,
}: {
	implementationId: string;
	options: LinkOption[];
	linked: string[];
}) {
	const t = useTranslations("Evidence");
	const tc = useTranslations("Common");
	const router = useRouter();
	return (
		<LinksDialog
			triggerLabel={t("assign")}
			title={t("assignTitle")}
			lead={t("assignLead")}
			groups={[{ key: "evidence", title: t("title"), options, linked }]}
			onSave={async (sel) => {
				const res = await setControlEvidence({
					implementationId,
					evidenceIds: sel.evidence ?? [],
				});
				if (!res.ok) {
					toast.error(tc("error"));
					return false;
				}
				toast.success(t("assigned"));
				router.refresh();
				return true;
			}}
		/>
	);
}

// Nachweis endgültig löschen (Step-up; Objekt geht nach der Backup-Frist).
export function DeleteEvidenceButton({
	evidenceId,
	title,
}: {
	evidenceId: string;
	title: string;
}) {
	const t = useTranslations("Evidence");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [pending, start] = useTransition();
	return (
		<AlertDialog>
			<AlertDialogTrigger asChild>
				<Button
					size="icon"
					variant="ghost"
					className="size-7"
					aria-label={`${t("delete")}: ${title}`}
				>
					<Trash2 className="size-3.5" />
				</Button>
			</AlertDialogTrigger>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>{t("deleteTitle", { title })}</AlertDialogTitle>
					<AlertDialogDescription>{t("deleteLead")}</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel disabled={pending}>
						{tc("cancel")}
					</AlertDialogCancel>
					<AlertDialogAction
						disabled={pending}
						onClick={(e) => {
							e.preventDefault();
							start(async () => {
								const res = await withStepUp(() => deleteEvidence(evidenceId));
								if (!res.ok) return void toast.error(tc("error"));
								toast.success(t("deleted"));
								router.refresh();
							});
						}}
					>
						{t("delete")}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
