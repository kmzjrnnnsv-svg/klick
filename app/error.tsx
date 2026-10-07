"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

export default function ErrorPage({
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
			<Button variant="outline" onClick={() => reset()}>
				{tc("retry")}
			</Button>
		</main>
	);
}
