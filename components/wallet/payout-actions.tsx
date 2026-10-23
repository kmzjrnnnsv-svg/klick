"use client";

import { FastForward, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { toast } from "sonner";
import { bumpPayout, cancelPayout } from "@/app/actions/wallet-send";
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

// Abbrechen (bremst — alle im Bereich) und Beschleunigen (wallet:initiate)
export function PayoutActions({
	id,
	canCancel,
	canBump,
}: {
	id: string;
	canCancel: boolean;
	canBump: boolean;
}) {
	const t = useTranslations("Wallet");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [pending, start] = useTransition();
	const run = (
		fn: () => Promise<{ ok: boolean; error?: string }>,
		done: string,
	) =>
		start(async () => {
			const res = await fn();
			if (!res.ok) {
				const key = `error_${res.error ?? ""}`;
				toast.error(t.has(key as never) ? t(key as never) : tc("error"));
				return;
			}
			toast.success(done);
			router.refresh();
		});
	return (
		<div className="flex flex-wrap gap-2">
			{canBump && (
				<Button
					type="button"
					variant="outline"
					disabled={pending}
					onClick={() =>
						run(() => bumpPayout({ id }), t("payoutBumpRequested"))
					}
				>
					<FastForward aria-hidden />
					{t("payoutBump")}
				</Button>
			)}
			{canCancel && (
				<AlertDialog>
					<AlertDialogTrigger asChild>
						<Button type="button" variant="outline" disabled={pending}>
							<XCircle aria-hidden />
							{t("payoutCancel")}
						</Button>
					</AlertDialogTrigger>
					<AlertDialogContent>
						<AlertDialogHeader>
							<AlertDialogTitle>{t("payoutCancelTitle")}</AlertDialogTitle>
							<AlertDialogDescription>
								{t("payoutCancelConfirm")}
							</AlertDialogDescription>
						</AlertDialogHeader>
						<AlertDialogFooter>
							<AlertDialogCancel>{t("payoutCancelKeep")}</AlertDialogCancel>
							<AlertDialogAction
								onClick={() =>
									run(() => cancelPayout({ id }), t("payoutCancelRequested"))
								}
							>
								{t("payoutCancel")}
							</AlertDialogAction>
						</AlertDialogFooter>
					</AlertDialogContent>
				</AlertDialog>
			)}
		</div>
	);
}
