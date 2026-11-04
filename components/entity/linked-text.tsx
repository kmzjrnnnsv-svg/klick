import Link from "next/link";
import { splitInternalPaths } from "@/lib/text/internal-paths";

// Freitext (z. B. Aufgabenbeschreibung) mit klickbaren internen Pfaden:
// „… unter /controls/CC-IAM-01“ wird zum Link. Nur eigene Pfade, nie fremde
// Adressen (die bleiben Text).
export function LinkedText({ text }: { text: string }) {
	return (
		<>
			{splitInternalPaths(text).map((part, i) =>
				part.kind === "path" ? (
					<Link
						// biome-ignore lint/suspicious/noArrayIndexKey: feste Reihenfolge
						key={i}
						href={part.value}
						className="text-primary hover:underline"
					>
						{part.value}
					</Link>
				) : (
					// biome-ignore lint/suspicious/noArrayIndexKey: feste Reihenfolge
					<span key={i}>{part.value}</span>
				),
			)}
		</>
	);
}
