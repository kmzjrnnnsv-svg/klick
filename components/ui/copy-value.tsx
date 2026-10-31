"use client";

import { Copy } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";

// Ein Wert zum Kopieren (Adresse, Kennung, TXT-Eintrag): Beschriftung,
// Wert in Monospace, Knopf mit Symbol. 44 px am Touch-Bildschirm.
export function CopyValue({
	label,
	value,
	mono = true,
}: {
	label: string;
	value: string;
	mono?: boolean;
}) {
	const t = useTranslations("Common");
	return (
		<div className="flex flex-col gap-0.5">
			<span className="text-footnote text-muted-foreground">{label}</span>
			<div className="flex items-start gap-1">
				<code
					className={`min-w-0 flex-1 break-all rounded-lg bg-muted/60 px-2 py-1.5 text-footnote ${mono ? "font-mono" : ""}`}
					translate="no"
				>
					{value}
				</code>
				<Button
					type="button"
					variant="ghost"
					size="icon"
					aria-label={t("copyValue", { label })}
					onClick={async () => {
						try {
							await navigator.clipboard.writeText(value);
							toast.success(t("copied"));
						} catch {
							toast.error(t("copyFailed"));
						}
					}}
				>
					<Copy aria-hidden="true" />
				</Button>
			</div>
		</div>
	);
}
