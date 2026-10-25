// Neu-Produkt-Prozess (MaRisk AT 8): Kennung des nächsten Antrags — pure.
export function nextChangeCode(existing: readonly string[]): string {
	const max = existing.reduce((m, c) => {
		const n = /^AE-(\d+)$/.exec(c)?.[1];
		return n ? Math.max(m, Number.parseInt(n, 10)) : m;
	}, 0);
	return `AE-${String(max + 1).padStart(3, "0")}`;
}
