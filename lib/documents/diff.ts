// Zeilen- und Wort-Diff für die Versionsansicht — klein, ohne Abhängigkeit.
// Gleiche Zeilen am Anfang und Ende fallen vorab weg; lange Mitten werden an
// Zeilen geteilt, die in beiden Fassungen genau einmal vorkommen (Anker wie
// beim Patience-Diff), erst die Stücke dazwischen gehen in die LCS-Tabelle.
// So bleibt eine lange Datei mit wenigen Änderungen Zeile für Zeile
// vergleichbar statt „alles neu“.
export type DiffLine = { type: "same" | "add" | "del"; text: string };

// höchstens so viele Zellen je LCS-Tabelle (Int32, ≈ 16 MB)
const MAX_CELLS = 4_000_000;

function lcs(
	a: readonly string[],
	b: readonly string[],
	out: DiffLine[],
): void {
	const n = a.length;
	const m = b.length;
	if (n * m > MAX_CELLS) {
		for (const text of a) out.push({ type: "del", text });
		for (const text of b) out.push({ type: "add", text });
		return;
	}
	const w = m + 1;
	const dp = new Int32Array((n + 1) * w);
	for (let i = n - 1; i >= 0; i--) {
		for (let j = m - 1; j >= 0; j--) {
			dp[i * w + j] =
				a[i] === b[j]
					? dp[(i + 1) * w + j + 1] + 1
					: Math.max(dp[(i + 1) * w + j], dp[i * w + j + 1]);
		}
	}
	let i = 0;
	let j = 0;
	while (i < n && j < m) {
		if (a[i] === b[j]) {
			out.push({ type: "same", text: a[i] });
			i++;
			j++;
		} else if (dp[(i + 1) * w + j] >= dp[i * w + j + 1]) {
			out.push({ type: "del", text: a[i++] });
		} else {
			out.push({ type: "add", text: b[j++] });
		}
	}
	while (i < n) out.push({ type: "del", text: a[i++] });
	while (j < m) out.push({ type: "add", text: b[j++] });
}

// Zeilen, die in a und b genau einmal vorkommen, in aufsteigender Folge in
// beiden (längste steigende Teilfolge nach der Position in b)
function anchors(
	a: readonly string[],
	b: readonly string[],
): Array<[number, number]> {
	const count = new Map<
		string,
		{ a: number; b: number; ai: number; bi: number }
	>();
	a.forEach((line, i) => {
		const c = count.get(line) ?? { a: 0, b: 0, ai: -1, bi: -1 };
		c.a += 1;
		c.ai = i;
		count.set(line, c);
	});
	b.forEach((line, j) => {
		const c = count.get(line);
		if (!c) return;
		c.b += 1;
		c.bi = j;
	});
	const pairs: Array<[number, number]> = [];
	for (const c of count.values())
		if (c.a === 1 && c.b === 1) pairs.push([c.ai, c.bi]);
	pairs.sort((x, y) => x[0] - y[0]);
	// LIS über die b-Position (Patience-Sortierung)
	const tails: number[] = [];
	const prev = new Int32Array(pairs.length).fill(-1);
	for (let k = 0; k < pairs.length; k++) {
		const bj = pairs[k][1];
		let lo = 0;
		let hi = tails.length;
		while (lo < hi) {
			const mid = (lo + hi) >> 1;
			if (pairs[tails[mid]][1] < bj) lo = mid + 1;
			else hi = mid;
		}
		if (lo > 0) prev[k] = tails[lo - 1];
		tails[lo] = k;
	}
	const out: Array<[number, number]> = [];
	for (let k = tails.at(-1) ?? -1; k >= 0; k = prev[k]) out.push(pairs[k]);
	return out.reverse();
}

function diffRange(
	a: readonly string[],
	b: readonly string[],
	out: DiffLine[],
): void {
	let start = 0;
	while (start < a.length && start < b.length && a[start] === b[start]) {
		out.push({ type: "same", text: a[start] });
		start++;
	}
	let endA = a.length;
	let endB = b.length;
	while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
		endA--;
		endB--;
	}
	const midA = a.slice(start, endA);
	const midB = b.slice(start, endB);
	if (midA.length * midB.length <= MAX_CELLS) lcs(midA, midB, out);
	else {
		const anchor = anchors(midA, midB);
		if (anchor.length === 0) lcs(midA, midB, out);
		else {
			let ai = 0;
			let bi = 0;
			for (const [x, y] of anchor) {
				diffRange(midA.slice(ai, x), midB.slice(bi, y), out);
				out.push({ type: "same", text: midA[x] });
				ai = x + 1;
				bi = y + 1;
			}
			diffRange(midA.slice(ai), midB.slice(bi), out);
		}
	}
	for (let k = endA; k < a.length; k++) out.push({ type: "same", text: a[k] });
}

export function diffLines(before: string, after: string): DiffLine[] {
	const out: DiffLine[] = [];
	diffRange(before.split("\n"), after.split("\n"), out);
	return out;
}

// Wort-Diff innerhalb eines geänderten Absatzpaars: Wörter und Leerraum als
// Teile, gleiche Teile am Stück. null, wenn das Paar zu lang ist.
export type WordPart = { type: "same" | "add" | "del"; text: string };

const MAX_WORD_CELLS = 250_000;

export function diffWords(before: string, after: string): WordPart[] | null {
	const a = before.match(/\s+|\S+/g) ?? [];
	const b = after.match(/\s+|\S+/g) ?? [];
	if (a.length * b.length > MAX_WORD_CELLS) return null;
	const lines: DiffLine[] = [];
	diffRange(a, b, lines);
	const out: WordPart[] = [];
	for (const l of lines) {
		const last = out.at(-1);
		if (last && last.type === l.type) last.text += l.text;
		else out.push({ type: l.type, text: l.text });
	}
	return out;
}

// Anteil gleicher Wörter (ohne Leerraum) an beiden Absätzen, 0 … 1
export function wordSimilarity(parts: readonly WordPart[]): number {
	let same = 0;
	let total = 0;
	for (const p of parts) {
		const words = p.text.split(/\s+/).filter(Boolean).length;
		total += p.type === "same" ? 2 * words : words;
		if (p.type === "same") same += 2 * words;
	}
	return total === 0 ? 1 : same / total;
}
