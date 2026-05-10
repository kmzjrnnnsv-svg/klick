"use client";

import { useEffect } from "react";

// Route-Level-Error-Boundary. Greift bevor global-error.tsx einspringt,
// behält Header/Footer und Theme, gibt einen Retry-Knopf. Ein User soll
// nie auf eine "This page couldn't load"-Browser-Seite knallen.
export default function Error({
	error,
	reset,
}: {
	error: Error & { digest?: string };
	reset: () => void;
}) {
	useEffect(() => {
		console.error("[route-error]", error);
	}, [error]);

	return (
		<main className="mx-auto flex min-h-[60vh] w-full max-w-md flex-1 flex-col items-center justify-center px-6 text-center">
			<div className="mb-4 text-4xl">⚠️</div>
			<h1 className="mb-2 font-semibold text-foreground text-xl">
				Diese Seite konnte nicht geladen werden
			</h1>
			<p className="mb-6 text-muted-foreground text-sm leading-relaxed">
				Wahrscheinlich ist ein kurzer Aussetzer. Versuch es nochmal — wenn es
				wieder kracht, gehe zur Startseite zurück.
			</p>
			<div className="flex gap-2">
				<button
					type="button"
					onClick={reset}
					className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-primary-foreground text-sm hover:bg-primary/90"
				>
					Erneut versuchen
				</button>
				<a
					href="/"
					className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-4 py-2 text-foreground text-sm hover:bg-muted"
				>
					Startseite
				</a>
			</div>
			{error.digest && (
				<p className="mt-6 font-mono text-[10px] text-muted-foreground">
					Referenz: {error.digest}
				</p>
			)}
		</main>
	);
}
