"use client";

import { useEffect } from "react";

// Globale Error-Boundary für ALLE Server-Component-Renders. Ohne diese
// Datei fällt Next.js auf die nackte Browser-Default-Fehlerseite zurück,
// die für User unverständlich ist und auch keinen Retry-Button bietet.
//
// Wir loggen serverseitig + zeigen einen freundlichen Fallback mit
// Reload + Zurück. Den `digest`-String sieht der User mit — der hilft
// uns, den Eintrag in den Server-Logs zu finden, ohne sensible Details
// nach aussen zu geben.
export default function GlobalError({
	error,
	reset,
}: {
	error: Error & { digest?: string };
	reset: () => void;
}) {
	useEffect(() => {
		console.error("[global-error]", error);
	}, [error]);

	return (
		<html lang="de">
			<body
				style={{
					margin: 0,
					fontFamily: "system-ui, -apple-system, sans-serif",
					background: "#f8f6f0",
					color: "#232a3a",
					minHeight: "100vh",
					display: "flex",
					alignItems: "center",
					justifyContent: "center",
					padding: "1.5rem",
				}}
			>
				<div style={{ maxWidth: 480, textAlign: "center" }}>
					<div
						style={{
							fontSize: 48,
							marginBottom: 16,
							color: "#dc2626",
						}}
					>
						⚠️
					</div>
					<h1 style={{ fontSize: 22, margin: "0 0 8px", fontWeight: 600 }}>
						Etwas ist schiefgelaufen
					</h1>
					<p
						style={{
							fontSize: 14,
							color: "#6a748a",
							margin: "0 0 24px",
							lineHeight: 1.5,
						}}
					>
						Wir konnten die Seite gerade nicht laden. Versuch es nochmal — wenn
						es wieder kracht, ist der Fehler bei uns gelandet und wir schauen
						drüber.
					</p>
					<div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
						<button
							type="button"
							onClick={reset}
							style={{
								background: "#2c4ed8",
								color: "white",
								border: "none",
								padding: "0.6rem 1.2rem",
								borderRadius: 6,
								cursor: "pointer",
								fontWeight: 500,
								fontSize: 14,
							}}
						>
							Neu laden
						</button>
						<a
							href="/"
							style={{
								background: "transparent",
								color: "#232a3a",
								border: "1px solid #d6dae6",
								padding: "0.6rem 1.2rem",
								borderRadius: 6,
								cursor: "pointer",
								fontWeight: 500,
								fontSize: 14,
								textDecoration: "none",
								display: "inline-block",
							}}
						>
							Zur Startseite
						</a>
					</div>
					{error.digest && (
						<p
							style={{
								marginTop: 24,
								fontFamily: "monospace",
								fontSize: 11,
								color: "#9da9b8",
							}}
						>
							Referenz: {error.digest}
						</p>
					)}
				</div>
			</body>
		</html>
	);
}
