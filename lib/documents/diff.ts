// Zeilen-Diff (LCS) für die Versionsansicht — klein, ohne Abhängigkeit.
export type DiffLine = { type: "same" | "add" | "del"; text: string };

export function diffLines(before: string, after: string): DiffLine[] {
	const a = before.split("\n");
	const b = after.split("\n");
	const n = a.length;
	const m = b.length;
	// LCS-Tabelle (begrenzt, damit riesige Dokumente nicht explodieren)
	if (n * m > 4_000_000) {
		return [
			...a.map((text) => ({ type: "del" as const, text })),
			...b.map((text) => ({ type: "add" as const, text })),
		];
	}
	const dp: number[][] = Array.from({ length: n + 1 }, () =>
		new Array<number>(m + 1).fill(0),
	);
	for (let i = n - 1; i >= 0; i--) {
		for (let j = m - 1; j >= 0; j--) {
			dp[i][j] =
				a[i] === b[j]
					? dp[i + 1][j + 1] + 1
					: Math.max(dp[i + 1][j], dp[i][j + 1]);
		}
	}
	const out: DiffLine[] = [];
	let i = 0;
	let j = 0;
	while (i < n && j < m) {
		if (a[i] === b[j]) {
			out.push({ type: "same", text: a[i] });
			i++;
			j++;
		} else if (dp[i + 1][j] >= dp[i][j + 1]) {
			out.push({ type: "del", text: a[i] });
			i++;
		} else {
			out.push({ type: "add", text: b[j] });
			j++;
		}
	}
	while (i < n) out.push({ type: "del", text: a[i++] });
	while (j < m) out.push({ type: "add", text: b[j++] });
	return out;
}
