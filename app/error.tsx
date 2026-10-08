"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

// Letzte Verteidigungslinie. Seiten leiten bei Auth-Fehlern um
// (lib/auth/gates.ts) und Actions geben Fehler als Ergebnis zurück
// (lib/actions/safe.ts) — landet trotzdem etwas hier, zeigen wir die
// Referenz (digest) für den Support und einen Weg zurück.
export default function ErrorPage({
	error,
	reset,
}: {
	error: Error & { digest?: string };
	reset: () => void;
}) {
	const t = useTranslations("Errors");
	const tc = useTranslations("Common");
	return (
		<main className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center gap-6 px-4 py-24 text-center">
			<h1 className="font-serif-display text-4xl text-primary">{t("title")}</h1>
			<p className="text-muted-foreground">{t("lead")}</p>
			{error?.digest && (
				<p className="font-mono text-muted-foreground text-xs">
					{t("reference", { ref: error.digest })}
				</p>
			)}
			<div className="flex flex-wrap items-center justify-center gap-3">
				<Button variant="outline" onClick={() => reset()}>
					{tc("retry")}
				</Button>
				<Button variant="brown" asChild>
					<Link href="/heute">{t("home")}</Link>
				</Button>
			</div>
		</main>
	);
}
