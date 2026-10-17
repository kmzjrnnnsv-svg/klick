// Erste Pfadsegmente, die keine öffentlichen Inhaltsseiten sind. Eine Quelle
// für robots.txt, reservierte CMS-Slugs und tests/links.test.ts (der Test
// gleicht die Liste mit den Ordnern unter app/ ab — neue Route = hier ergänzen).
export const APP_SEGMENTS = [
	"abweichungen",
	"aktivitaet",
	"aml",
	"antrag",
	"assets",
	"audits",
	"baseline",
	"beschluesse",
	"beschwerden",
	"controls",
	"datenschutz",
	"dienstleister",
	"dokumente",
	"eigenmittel",
	"einstellungen",
	"gap-analyse",
	"heute",
	"kalender",
	"kryptowerte",
	"managementbewertung",
	"nachweise",
	"organisation",
	"produkte",
	"prozesse",
	"rahmenwerke",
	"risiken",
	"roadmap",
	"schulungen",
	"sicherheit",
	"suche",
	"synergien",
	"team",
	"testprogramm",
	"ueberblick",
	"vorfaelle",
] as const;

export const AUTH_SEGMENTS = [
	"einladung",
	"einrichtung",
	"login",
	"onboarding",
] as const;

// Nicht indexieren, aber kein App-Bereich im engeren Sinn.
export const PRIVATE_SEGMENTS = ["admin", "api", "lieferant"] as const;

// Öffentliche Seiten mit eigener Route (kein CMS).
export const MARKETING_SEGMENTS = [
	"leistungen",
	"preise",
	"vertrauen",
] as const;

// Slugs, die das CMS nicht vergeben darf — sonst überdeckte die App-Route die
// Seite (oder umgekehrt).
export const RESERVED_SLUGS: ReadonlySet<string> = new Set([
	...APP_SEGMENTS,
	...AUTH_SEGMENTS,
	...PRIVATE_SEGMENTS,
	...MARKETING_SEGMENTS,
]);

export function siteUrl(): string {
	return (process.env.BETTER_AUTH_URL ?? "https://raza.work").replace(
		/\/+$/,
		"",
	);
}
