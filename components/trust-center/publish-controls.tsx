"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { toast } from "sonner";
import {
	publishTrustCenter,
	unpublishTrustCenter,
} from "@/app/actions/trust-center";
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
import { Button, buttonVariants } from "@/components/ui/button";

// Veröffentlichen / Aktualisieren / Zurückziehen — jeweils mit Step-up.
export function PublishControls({
	saved,
	published,
}: {
	saved: boolean;
	published: boolean;
}) {
	const t = useTranslations("TrustCenter");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [pending, start] = useTransition();

	const publish = () =>
		start(async () => {
			const res = await withStepUp(() => publishTrustCenter());
			if (!res.ok) {
				toast.error(res.error === "notFound" ? t("saveFirst") : tc("error"));
				return;
			}
			const n = res.data.warnings.length;
			if (n > 0) toast.warning(t("publishedWithWarnings", { n }));
			else toast.success(published ? t("updatedPublic") : t("publishedNow"));
			router.refresh();
		});

	const unpublish = () =>
		start(async () => {
			const res = await withStepUp(() => unpublishTrustCenter());
			if (!res.ok) {
				toast.error(tc("error"));
				return;
			}
			toast.success(t("unpublishedNow"));
			router.refresh();
		});

	return (
		<div className="flex flex-wrap gap-2">
			<Button onClick={publish} disabled={pending || !saved}>
				{published ? t("republish") : t("publish")}
			</Button>
			{published && (
				<AlertDialog>
					<AlertDialogTrigger asChild>
						<Button variant="outline" disabled={pending}>
							{t("unpublish")}
						</Button>
					</AlertDialogTrigger>
					<AlertDialogContent>
						<AlertDialogHeader>
							<AlertDialogTitle>{t("unpublishTitle")}</AlertDialogTitle>
							<AlertDialogDescription>
								{t("unpublishLead")}
							</AlertDialogDescription>
						</AlertDialogHeader>
						<AlertDialogFooter>
							<AlertDialogCancel>{tc("cancel")}</AlertDialogCancel>
							<AlertDialogAction
								className={buttonVariants({ variant: "destructive" })}
								onClick={unpublish}
							>
								{t("unpublishConfirm")}
							</AlertDialogAction>
						</AlertDialogFooter>
					</AlertDialogContent>
				</AlertDialog>
			)}
		</div>
	);
}
