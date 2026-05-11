"use client";

import { Loader2, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { refreshMyInsights } from "@/app/actions/insights";

// Triggers a fresh insights compute on demand. Sits inside the narrative
// ("Profil-Lesart") card so the user can re-run AI without saving the
// profile or waiting for the 7-day staleness sweep.
export function NarrativeRefreshButton() {
	const t = useTranslations("Insights");
	const router = useRouter();
	const [isPending, startTransition] = useTransition();
	const [error, setError] = useState<string | null>(null);

	function handle() {
		setError(null);
		startTransition(async () => {
			const r = await refreshMyInsights();
			if (!r.ok) {
				setError(r.error);
				return;
			}
			// Server-Component refreshen, damit das frisch berechnete Narrative
			// (inkl. neuer Pillen + Strengths) sofort sichtbar wird.
			router.refresh();
		});
	}

	return (
		<div className="mt-3 flex items-center gap-2">
			<button
				type="button"
				onClick={handle}
				disabled={isPending}
				className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/5 px-2.5 py-1 font-mono text-[10px] text-primary hover:bg-primary/10 disabled:opacity-50"
			>
				{isPending ? (
					<Loader2 className="h-3 w-3 animate-spin" strokeWidth={1.5} />
				) : (
					<RefreshCw className="h-3 w-3" strokeWidth={1.5} />
				)}
				{isPending ? t("regenerating") : t("regenerate")}
			</button>
			{error && (
				<span className="text-rose-700 text-xs dark:text-rose-300">
					{error}
				</span>
			)}
		</div>
	);
}
