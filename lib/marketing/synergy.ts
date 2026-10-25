// Rahmenwerk-Ausschnitt auf /funktionen — rein und ohne Katalog-Import,
// damit der Browser nur die Zahlen bekommt, nicht den ganzen Katalog.

export type PickerFramework = {
	slug: string;
	label: string;
	requirements: number;
	controls: string[];
};

// Was eine Auswahl bedeutet: Anforderungen, Controls insgesamt, Controls,
// die für mehrere gewählte Rahmenwerke zählen, und wie viele Umsetzungen es
// ohne gemeinsame Controls wären.
export function synergyOf(
	frameworks: readonly PickerFramework[],
	selected: readonly string[],
) {
	const chosen = frameworks.filter((f) => selected.includes(f.slug));
	const count = new Map<string, number>();
	for (const f of chosen)
		for (const c of f.controls) count.set(c, (count.get(c) ?? 0) + 1);
	return {
		requirements: chosen.reduce((n, f) => n + f.requirements, 0),
		controls: count.size,
		shared: [...count.values()].filter((n) => n > 1).length,
		separate: chosen.reduce((n, f) => n + f.controls.length, 0),
	};
}

// Was jedes noch nicht gewählte Rahmenwerk neu dazubrächte: Controls, die die
// Auswahl noch nicht hat (added), und solche, die schon da sind (reused).
// Ohne Auswahl ist added = total.
export function addedControls(
	frameworks: readonly PickerFramework[],
	selected: readonly string[],
): Map<string, { added: number; reused: number; total: number }> {
	const have = new Set(
		frameworks
			.filter((f) => selected.includes(f.slug))
			.flatMap((f) => f.controls),
	);
	const out = new Map<
		string,
		{ added: number; reused: number; total: number }
	>();
	for (const f of frameworks) {
		if (selected.includes(f.slug)) continue;
		const reused = f.controls.filter((c) => have.has(c)).length;
		out.set(f.slug, {
			added: f.controls.length - reused,
			reused,
			total: f.controls.length,
		});
	}
	return out;
}

// Das nicht gewählte Rahmenwerk, von dem die Auswahl schon den größten Anteil
// abdeckt (bei Gleichstand das mit mehr vorhandenen Controls) — Beispiel für
// den Satz unter dem Ausschnitt. null ohne Auswahl oder ohne Kandidaten.
export function bestReuse(
	frameworks: readonly PickerFramework[],
	selected: readonly string[],
): { slug: string; label: string; reused: number; total: number } | null {
	if (!frameworks.some((f) => selected.includes(f.slug))) return null;
	let best: {
		slug: string;
		label: string;
		reused: number;
		total: number;
	} | null = null;
	for (const [slug, a] of addedControls(frameworks, selected)) {
		if (a.total === 0 || a.reused === 0) continue;
		const share = a.reused / a.total;
		const bestShare = best ? best.reused / best.total : -1;
		if (
			share > bestShare ||
			(share === bestShare && best && a.reused > best.reused)
		) {
			const label = frameworks.find((f) => f.slug === slug)?.label ?? slug;
			best = { slug, label, reused: a.reused, total: a.total };
		}
	}
	return best;
}
