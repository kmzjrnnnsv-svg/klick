"use client";

import { useLocale, useTranslations } from "next-intl";
import { useTransition } from "react";
import { setLocaleAction } from "@/app/actions/locale";
import { Button } from "@/components/ui/button";

export function LocaleSwitcher() {
	const locale = useLocale();
	const t = useTranslations("Header");
	const [isPending, startTransition] = useTransition();
	const next = locale === "de" ? "en" : "de";

	return (
		<Button
			variant="ghost"
			size="sm"
			disabled={isPending}
			aria-label={t("toggleLocale")}
			onClick={() => startTransition(() => setLocaleAction(next))}
		>
			<span className="font-mono tracking-wider text-xs uppercase">
				{locale}
			</span>
		</Button>
	);
}
