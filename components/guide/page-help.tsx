"use client";

import { CircleHelp, Compass } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { startTour } from "./tour-host";

// Einklappbare Seitenhilfe („Worum geht’s? · Wofür? · Erster Schritt“) und
// Start der Tour. Texte: Help.<page>_what / _why / _first.
export function PageHelp({ page, tour }: { page?: string; tour?: string }) {
	const t = useTranslations("Help");
	const tg = useTranslations("Guide");
	const has = (k: string) => t.has(k as "heute_what");
	const text = (k: string) => t(k as "heute_what");
	const parts = page
		? (["what", "why", "first"] as const).filter((p) => has(`${page}_${p}`))
		: [];
	return (
		<div className="flex flex-wrap items-start gap-2">
			{parts.length > 0 && (
				<details className="group max-w-3xl flex-1 rounded-md border bg-muted/30 px-3 py-2 text-sm [&[open]]:pb-3">
					<summary className="flex cursor-pointer list-none items-center gap-1.5 text-muted-foreground hover:text-foreground">
						<CircleHelp className="size-4" />
						{t("toggle")}
					</summary>
					<dl className="mt-2 grid gap-2 sm:grid-cols-3">
						{parts.map((p) => (
							<div key={p}>
								<dt className="lv-eyebrow text-[0.52rem] text-muted-foreground">
									{t(`label_${p}`)}
								</dt>
								<dd>{text(`${page}_${p}`)}</dd>
							</div>
						))}
					</dl>
				</details>
			)}
			{tour && (
				<Button
					type="button"
					size="sm"
					variant="ghost"
					className="gap-1.5"
					onClick={() => startTour(tour)}
				>
					<Compass className="size-4" />
					{tg("start")}
				</Button>
			)}
		</div>
	);
}
