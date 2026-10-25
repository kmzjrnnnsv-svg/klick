// Bildschirmfotos aus Klick für die Website (Beispieldaten), einzige Quelle
// für Pfad und Maße. Neu aufnehmen mit scripts/qa/marketing-shots.ts; das
// Skript gibt die Maße aus, Test `marketing-shots` prüft sie gegen die Dateien.
// Ausgeliefert werden sie über assetUrl() (lib/marketing/asset-url.ts), damit
// ein neues Bild trotz langem Browser-Cache sofort sichtbar ist.

export type Shot = { src: string; w: number; h: number };

export const SHOTS = {
	anmeldung: { src: "/funktionen/anmeldung.jpg", w: 1440, h: 920 },
	freigaben: { src: "/funktionen/freigaben.jpg", w: 2304, h: 1520 },
	risiko: { src: "/funktionen/risiko.jpg", w: 2304, h: 1520 },
	trustCenter: { src: "/funktionen/trust-center.jpg", w: 1536, h: 1800 },
	verwahrung: { src: "/funktionen/verwahrung.jpg", w: 2304, h: 1280 },
	cvss: { src: "/leistungen/cvss.jpg", w: 1344, h: 1680 },
	frage: { src: "/leistungen/frage.jpg", w: 2304, h: 1338 },
	portal: { src: "/leistungen/portal.jpg", w: 780, h: 1688 },
	produkt: { src: "/leistungen/produkt.jpg", w: 1504, h: 810 },
	pruefungsreife: { src: "/leistungen/pruefungsreife.jpg", w: 2304, h: 1120 },
	sicherheit: { src: "/leistungen/sicherheit.jpg", w: 2304, h: 1240 },
	vertrag: { src: "/leistungen/vertrag.jpg", w: 1504, h: 2200 },
} as const satisfies Record<string, Shot>;

export type ShotKey = keyof typeof SHOTS;
