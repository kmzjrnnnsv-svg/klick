"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { deleteInquiry, setInquiryStatus } from "@/app/actions/inquiries";
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
import { Button, buttonVariants } from "@/components/ui/button";
import { errorText } from "@/components/ui/error-text";
import { toast } from "@/components/ui/toast";
import { INQUIRY_STATUS, type InquiryStatus } from "@/db/schema/enums";
import { INQUIRY_STATUS_LABEL } from "@/lib/inquiries/rules";

export function InquiryActions({
	id,
	status,
}: {
	id: string;
	status: InquiryStatus;
}) {
	const tc = useTranslations("Common");
	const router = useRouter();
	const [pending, start] = useTransition();
	return (
		<div className="flex flex-wrap gap-2">
			{INQUIRY_STATUS.filter((s) => s !== status).map((s) => (
				<Button
					key={s}
					type="button"
					size="sm"
					variant={s === "contacted" ? "default" : "outline"}
					disabled={pending}
					onClick={() =>
						start(async () => {
							const res = await setInquiryStatus({ id, status: s });
							if (!res.ok) {
								toast.error(errorText(tc, res));
								return;
							}
							toast.success(`Status: ${INQUIRY_STATUS_LABEL[s]}`);
							router.refresh();
						})
					}
				>
					{INQUIRY_STATUS_LABEL[s]}
				</Button>
			))}
			<AlertDialog>
				<AlertDialogTrigger asChild>
					<Button
						type="button"
						size="sm"
						variant="destructive"
						disabled={pending}
					>
						Löschen
					</Button>
				</AlertDialogTrigger>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Anfrage löschen?</AlertDialogTitle>
						<AlertDialogDescription>
							Kontaktdaten und Nachricht sind danach weg. Das Audit-Log behält
							nur Art, Herkunft und Status.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Abbrechen</AlertDialogCancel>
						<AlertDialogAction
							className={buttonVariants({ variant: "destructive" })}
							onClick={() =>
								start(async () => {
									const res = await deleteInquiry(id);
									if (!res.ok) {
										toast.error(errorText(tc, res));
										return;
									}
									toast.success("Anfrage gelöscht");
									router.push("/admin/anfragen");
									router.refresh();
								})
							}
						>
							Anfrage löschen
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
}
