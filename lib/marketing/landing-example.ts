// Beispiel „Ohne Klick / Mit Klick“ auf der Startseite: eine Maßnahme, die
// überall dasselbe verlangt (alle Konten mit zweitem Faktor). Schulungen taugen
// dafür nicht: das Programm ist gleich, die Inhalte (Geldwäsche, Kartendaten,
// Gesundheitsdaten) nicht. Gezählt werden nur Rahmenwerke, deren Anforderung das
// Control ganz trägt; die Liste kommt aus den Katalog-Kanten, nicht aus dem Text.

import {
	CONTROL_BY_CODE,
	EDGES_BY_CONTROL,
	FRAMEWORK_BY_SLUG,
	REQUIREMENT_BY_KEY,
	splitRequirementKey,
} from "@/lib/compliance/catalog";

export const LANDING_EXAMPLE_CONTROL = "CC-IAM-03";

// „DORA — Digital Operational …“ → „DORA“, „GwG (Geldwäschegesetz)“ → „GwG“.
function shortName(name: string): string {
	return name.split(/ — | \(/)[0].trim();
}

/** Titel des Controls und die Rahmenwerke, die es ganz erfüllt (Kurznamen). */
export function landingExample(code = LANDING_EXAMPLE_CONTROL): {
	title: string;
	frameworks: string[];
} {
	const slugs = new Set(
		(EDGES_BY_CONTROL.get(code) ?? [])
			.filter(
				(e) =>
					e.coverage === "full" &&
					REQUIREMENT_BY_KEY.get(e.requirement)?.legalStatus !== "repealed",
			)
			.map((e) => splitRequirementKey(e.requirement).framework),
	);
	return {
		title: CONTROL_BY_CODE.get(code)?.title ?? "",
		frameworks: [...slugs]
			.flatMap((slug) => FRAMEWORK_BY_SLUG.get(slug) ?? [])
			.sort((a, b) => a.sortOrder - b.sortOrder)
			.map((f) => shortName(f.name)),
	};
}
