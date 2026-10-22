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
