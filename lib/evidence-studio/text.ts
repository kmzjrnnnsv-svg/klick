import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";

// Textvergleich für den Nachweisbogen (pure): gleiche oder sehr ähnliche
// Prüffragen und Hinweise aus verschiedenen Rahmenwerken werden zu einer
// Position zusammengeführt. Stabile IDs aus dem normalisierten Text, damit
// Antworten an der Frage hängen bleiben, auch wenn sich die Quellen ändern.

const STOP = new Set(
	"der die das den dem des ein eine einer einem eines und oder mit für von zu zur zum im in ist sind wird werden wurde auf als bei nach über unter wie welche welcher welches wer was wo gibt es ihr euch eure euer eurer ihre ihren sie wir uns unsere unser alle allen jede jeder jedes ob auch noch nur nicht kein keine durch aus vor an am bis dass sowie bzw z b etc ggf je".split(
		" ",
	),
);

export function normalize(text: string): string {
	return text
		.toLowerCase()
		.replace(/^\(p\)\s*/, "")
		.replace(/[„“"'‚‘()[\]{}?!.,:;–—/\\]/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

export function tokens(text: string): Set<string> {
	return new Set(
		normalize(text)
			.split(" ")
			.filter((w) => w.length >= 3 && !STOP.has(w))
			// einfache Stammform: Plural/Flexion grob abschneiden
			.map((w) => w.replace(/(ungen|ung|en|er|es|e|n|s)$/, "")),
	);
}

export function similarity(a: string, b: string): number {
	const ta = tokens(a);
	const tb = tokens(b);
	if (ta.size === 0 || tb.size === 0) return 0;
	let inter = 0;
	for (const t of ta) if (tb.has(t)) inter += 1;
	return inter / (ta.size + tb.size - inter);
}

export const stableId = (prefix: string, text: string): string =>
	`${prefix}-${bytesToHex(sha256(new TextEncoder().encode(normalize(text)))).slice(0, 12)}`;

// Gruppiert Texte mit Quellen: ab `threshold` Ähnlichkeit eine Gruppe; der
// erste Text (Control vor Anforderungen) gibt Wortlaut und ID vor.
export function mergeSimilar<T extends { text: string }>(
	entries: readonly T[],
	threshold: number,
): { text: string; members: T[] }[] {
	const groups: { text: string; members: T[] }[] = [];
	for (const e of entries) {
		const hit = groups.find(
			(g) =>
				normalize(g.text) === normalize(e.text) ||
				similarity(g.text, e.text) >= threshold,
		);
		if (hit) hit.members.push(e);
		else groups.push({ text: e.text, members: [e] });
	}
	return groups;
}
