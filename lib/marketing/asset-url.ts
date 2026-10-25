import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// nginx liefert Bilder mit `immutable` und 7 Tagen Cache aus. Ein neu
// aufgenommenes Bild unter demselben Namen sähe man sonst erst eine Woche
// später: die Prüfsumme des Inhalts als `?v=` macht daraus eine neue URL.
// Nur auf dem Server (liest public/), je Prozess einmal je Datei.
const cache = new Map<string, string>();

export function assetUrl(src: string): string {
	const hit = cache.get(src);
	if (hit) return hit;
	let url = src;
	try {
		const bytes = readFileSync(join(process.cwd(), "public", src));
		url = `${src}?v=${createHash("sha256").update(bytes).digest("hex").slice(0, 10)}`;
	} catch {
		// Datei fehlt (z. B. im Test): ohne Version ausliefern
	}
	cache.set(src, url);
	return url;
}
