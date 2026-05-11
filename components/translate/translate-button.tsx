"use client";

import { Languages, Loader2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { translateTexts } from "@/app/actions/translate";

// Generischer Translate-Button. Übersetzt in die aktuell eingestellte
// UI-Locale. Cached das Ergebnis pro Mount im Component-State —
// re-render → Übersetzung bleibt sichtbar, neu mounten = neuer Call.
//
// Sinnvoll für: Snapshot-Skills, alte Nachrichten / Notizen, Cover-
// Letter, Job-Beschreibungen die in der "falschen" Sprache stehen.
export function TranslateButton({
	original,
	from,
	context,
	onTranslated,
	label,
}: {
	original: string | string[];
	from: "de" | "en";
	context?: string;
	onTranslated: (translated: string | string[]) => void;
	label?: string;
}) {
	const t = useTranslations("Translate");
	const localeRaw = useLocale();
	const to: "de" | "en" = localeRaw === "de" ? "de" : "en";
	const [isPending, startTransition] = useTransition();
	const [error, setError] = useState<string | null>(null);
	const [done, setDone] = useState(false);

	if (from === to) return null;
	if (done) return null;

	function handle() {
		const arr = Array.isArray(original) ? original : [original];
		setError(null);
		startTransition(async () => {
			const r = await translateTexts({ texts: arr, from, to, context });
			if (!r.ok) {
				setError(r.error);
				return;
			}
			onTranslated(Array.isArray(original) ? r.texts : (r.texts[0] ?? ""));
			setDone(true);
		});
	}

	return (
		<div className="inline-flex items-center gap-2">
			<button
				type="button"
				onClick={handle}
				disabled={isPending}
				className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/5 px-2.5 py-1 font-mono text-[10px] text-primary hover:bg-primary/10 disabled:opacity-50"
			>
				{isPending ? (
					<Loader2 className="h-3 w-3 animate-spin" strokeWidth={1.5} />
				) : (
					<Languages className="h-3 w-3" strokeWidth={1.5} />
				)}
				{label ?? t("translate", { to: to.toUpperCase() })}
			</button>
			{error && (
				<span className="text-rose-700 text-xs dark:text-rose-300">
					{error}
				</span>
			)}
		</div>
	);
}
