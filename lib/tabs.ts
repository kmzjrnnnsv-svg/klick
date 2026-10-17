// Reiter aus ?tab=…: unbekannte oder fehlende Werte fallen auf den ersten
// Reiter zurück — sonst bliebe die Seite bei einem veralteten Link leer.
export function pickTab<T extends string>(
	value: string | string[] | undefined,
	tabs: readonly [T, ...T[]],
): T {
	const v = Array.isArray(value) ? value[0] : value;
	return (tabs as readonly string[]).includes(v ?? "") ? (v as T) : tabs[0];
}
