"use client";

import { Check, Copy } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

// Kopieren mit kurzer Bestätigung im Knopf selbst (Adresse, Transaktions-ID)
export function CopyButton({
	value,
	label,
	variant = "outline",
	iconOnly = false,
}: {
	value: string;
	label: string;
	variant?: "outline" | "ghost";
	iconOnly?: boolean;
}) {
	const t = useTranslations("Wallet");
	const tc = useTranslations("Common");
	const [done, setDone] = useState(false);
	const Icon = done ? Check : Copy;
	return (
		<Button
			type="button"
			variant={variant}
			size={iconOnly ? "icon-sm" : "sm"}
			aria-label={iconOnly ? label : undefined}
			title={iconOnly ? label : undefined}
			onClick={() =>
				navigator.clipboard
					.writeText(value)
					.then(() => {
						setDone(true);
						window.setTimeout(() => setDone(false), 1500);
					})
					.catch(() => toast.error(tc("error")))
			}
		>
			<Icon className="size-3.5" aria-hidden />
			{!iconOnly && (done ? t("receiveCopied") : label)}
		</Button>
	);
}
