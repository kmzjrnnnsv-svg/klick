// Suche in kurzen Listen im Browser (Einstellungen, Hilfe): Groß- und
// Kleinschreibung, Umlaute und Akzente egal, jedes Wort der Eingabe muss
// vorkommen. Rein, für Client und Server.

export function foldText(v: string): string {
	return v
		.toLocaleLowerCase("de-DE")
		.normalize("NFD")
		.replace(/\p{M}/gu, "")
		.replace(/ß/g, "ss");
}

/** Wörter der Eingabe (leer = keine Suche) */
export function searchWords(query: string): string[] {
	return foldText(query).split(/\s+/).filter(Boolean);
}

/** Kommt jedes Wort in text vor? text am besten schon über foldText. */
export function matchesWords(words: readonly string[], text: string): boolean {
	const folded = foldText(text);
	return words.every((w) => folded.includes(w));
}
