"use client";

import { BellRing } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { remindMember } from "@/app/actions/team";
import { Button } from "@/components/ui/button";
import { errorText } from "@/components/ui/error-text";
import { toast } from "@/components/ui/toast";

// Erinnern an offene Punkte (/team): höchstens einmal in 24 Stunden je
// Person; die Person bekommt eine Benachrichtigung mit Link auf ihre
// Verantwortung.
export function RemindButton({
	userId,
	name,
	disabled,
}: {
	userId: string;
	name: string;
	// schon in den letzten 24 Stunden erinnert
	disabled?: boolean;
}) {
	const t = useTranslations("Team");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [pending, start] = useTransition();
	return (
		<Button
			type="button"
			size="icon-sm"
			variant="ghost"
			disabled={pending || disabled}
			title={disabled ? t("remindedRecently") : t("remindLabel", { name })}
			aria-label={t("remindLabel", { name })}
			onClick={() =>
				start(async () => {
					const res = await remindMember({ userId });
					if (!res.ok) {
						toast.error(
							res.error === "reminded_recently"
								? t("remindedRecently")
								: res.error === "nothing_due"
									? t("nothingDue")
									: errorText(tc, res),
						);
						return;
					}
					toast.success(t("reminded", { name }));
					router.refresh();
				})
			}
		>
			<BellRing aria-hidden="true" />
		</Button>
	);
}
