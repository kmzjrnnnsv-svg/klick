"use client";

import { freezeSigner } from "@wallet/app/actions/wallet-send";
import { useWalletErrorText } from "@wallet/components/wallet/use-wallet-error";
import { OctagonX } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { FormAlert } from "@/components/ui/form-alert";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";

// Alles stoppen: Signer einfrieren — bremst nur, deshalb ohne
// Sicherheitsschlüssel; auftauen geht nur am Server-Terminal
export function FreezeSignerButton() {
	const t = useTranslations("Wallet");
	const router = useRouter();
	const errorText = useWalletErrorText();
	const [error, setError] = useState<string | null>(null);
	const [open, setOpen] = useState(false);
	const [pending, start] = useTransition();
	const [reason, setReason] = useState("");
	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button type="button" variant="destructive">
					<OctagonX aria-hidden />
					{t("secFreeze")}
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-md">
				<form
					className="flex flex-col gap-4"
					onSubmit={(e) => {
						e.preventDefault();
						setError(null);
						start(async () => {
							const res = await freezeSigner({ reason });
							if (!res.ok) return setError(errorText(res));
							toast.success(t("secFrozenDone"));
							setOpen(false);
							router.refresh();
						});
					}}
				>
					<DialogHeader>
						<DialogTitle>{t("secFreezeTitle")}</DialogTitle>
						<DialogDescription>{t("secFreezeLead")}</DialogDescription>
					</DialogHeader>
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="freeze-reason">{t("secFreezeReason")}</Label>
						<Textarea
							id="freeze-reason"
							name="reason"
							value={reason}
							onChange={(e) => setReason(e.target.value)}
							required
							minLength={3}
							maxLength={160}
						/>
					</div>
					<FormAlert message={error} />
					<DialogFooter>
						<Button type="submit" variant="destructive" disabled={pending}>
							{pending ? t("secFreezing") : t("secFreezeSubmit")}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
