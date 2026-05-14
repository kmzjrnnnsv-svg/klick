"use client";

import { Languages, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { translatePublicProfile } from "@/app/actions/translate-public";

// Expliziter Translate-Button auf der Public-Share-Seite. Triggert die
// Übersetzung SYNCHRON (anders als ensureTranslationForUser das via
// after() läuft). Besucher wartet 15-30s und sieht dann die ganze Seite
// in seiner Locale — kein Reload-Cycle, kein "vielleicht-später".
export function PublicTranslateButton({
	token,
	targetLocale,
}: {
	token: string;
	targetLocale: "de" | "en";
}) {
	const t = useTranslations("PublicProfile");
	const router = useRouter();
	const [error, setError] = useState<string | null>(null);
	const [isPending, startTransition] = useTransition();

	function handle() {
		setError(null);
		startTransition(async () => {
			const res = await translatePublicProfile({
				publicShareToken: token,
				targetLocale,
			});
			if (!res.ok) {
				setError(res.error);
				return;
			}
			// Server hat persistiert → harter Refresh holt die übersetzte
			// Version.
			router.refresh();
		});
	}

	return (
		<div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-md border border-primary/30 bg-primary/5 p-3">
			<p className="text-xs leading-relaxed">{t("translateNowHint")}</p>
			<button
				type="button"
				onClick={handle}
				disabled={isPending}
				className="inline-flex shrink-0 items-center gap-2 rounded-full border border-primary bg-background px-3 py-1.5 font-mono text-[10px] text-primary hover:bg-primary hover:text-primary-foreground disabled:opacity-60"
			>
				{isPending ? (
					<Loader2 className="h-3 w-3 animate-spin" strokeWidth={1.5} />
				) : (
					<Languages className="h-3 w-3" strokeWidth={1.5} />
				)}
				{isPending
					? t("translateNowPending")
					: t("translateNowAction", { lang: targetLocale.toUpperCase() })}
			</button>
			{error && (
				<span className="basis-full text-rose-700 text-xs dark:text-rose-300">
					{error}
				</span>
			)}
		</div>
	);
}
