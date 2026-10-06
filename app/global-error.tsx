"use client";

export default function GlobalError({
	reset,
}: {
	error: Error & { digest?: string };
	reset: () => void;
}) {
	return (
		<html lang="de">
			<body
				style={{
					fontFamily: "system-ui, sans-serif",
					padding: "4rem 1rem",
					textAlign: "center",
				}}
			>
				<h1>Da ist etwas schiefgelaufen.</h1>
				<p>Der Fehler wurde protokolliert.</p>
				<button type="button" onClick={() => reset()}>
					Noch einmal versuchen
				</button>
			</body>
		</html>
	);
}
