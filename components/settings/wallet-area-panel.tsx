"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { setWalletArea } from "@/app/actions/settings";
import { withStepUp } from "@/components/auth/step-up-dialog";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

// Einstellungen → Organisation: Wallet-Bereich ein- oder ausschalten
// (nur Inhaber:innen, mit Step-up). Aus = kein Umschalter, keine Wallet-Seite.
export function WalletAreaPanel({
	enabled,
	canEdit,
}: {
	enabled: boolean;
	canEdit: boolean;
}) {
	const t = useTranslations("Settings");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [on, setOn] = useState(enabled);
	const [pending, start] = useTransition();
	return (
		<Card>
			<CardHeader>
				<CardTitle className="text-base">{t("walletAreaTitle")}</CardTitle>
				<CardDescription>{t("walletAreaLead")}</CardDescription>
			</CardHeader>
			<CardContent className="flex items-center gap-3 text-sm">
				<Switch
					id="wallet-area"
					checked={on}
					disabled={!canEdit || pending}
					onCheckedChange={(next) =>
						start(async () => {
							const res = await withStepUp(() =>
								setWalletArea({ enabled: next }),
							);
							if (!res.ok) {
								toast.error(
									res.error === "step_up_required" ? t("stepUp") : tc("error"),
								);
								return;
							}
							setOn(next);
							toast.success(next ? t("walletAreaOn") : t("walletAreaOff"));
							router.refresh();
						})
					}
				/>
				<Label htmlFor="wallet-area">
					{on ? t("walletAreaStateOn") : t("walletAreaStateOff")}
				</Label>
			</CardContent>
		</Card>
	);
}
