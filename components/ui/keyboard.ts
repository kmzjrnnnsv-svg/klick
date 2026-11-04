// Tastatur wie in Mac- und iPad-Apps, rein und ohne Browser-Zugriff
// (getestet in tests/ui-keyboard.test.ts):
//   ⌘F (Mac) bzw. Strg+F springt ins Suchfeld der Seite (data-page-search)
//   ↑/↓ wandert durch die Einträge einer Liste (ListKeys)

type KeyLike = {
	key: string;
	metaKey: boolean;
	ctrlKey: boolean;
	altKey: boolean;
	shiftKey: boolean;
};

/** ⌘F am Mac, Strg+F sonst — ohne weitere Umschalttasten. Strg+F am Mac
 *  bleibt dem System (ein Zeichen vor in Textfeldern). */
export function isFindShortcut(e: KeyLike, mac: boolean): boolean {
	if (e.altKey || e.shiftKey) return false;
	if (e.key.toLowerCase() !== "f") return false;
	return mac ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey;
}

/** Plattform aus dem Browser-Kopf (Mac, iPhone, iPad mit Tastatur) */
export function isApplePlatform(platform: string): boolean {
	return /mac|iphone|ipad|ipod/i.test(platform);
}

/** Nächster Eintrag für ↑/↓, Pos1/Ende; null = Taste gehört nicht dazu.
 *  current -1 = noch kein Eintrag (Fokus im Suchfeld). Über den Anfang
 *  hinaus geht es zurück ins Suchfeld (-1), über das Ende nicht weiter. */
export function moveIndex(
	current: number,
	count: number,
	key: string,
): number | null {
	if (count === 0) return null;
	switch (key) {
		case "ArrowDown":
			return current < 0 ? 0 : Math.min(current + 1, count - 1);
		case "ArrowUp":
			return current <= 0 ? -1 : current - 1;
		case "Home":
			return current < 0 ? null : 0;
		case "End":
			return current < 0 ? null : count - 1;
		default:
			return null;
	}
}
