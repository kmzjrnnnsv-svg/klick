// Verteiler eines Dokuments (Kenntnisnahme, /richtlinien): „all“ = alle
// Mitglieder, eine Grundrolle (z. B. „employee“ für Mitarbeitende) oder
// eine Funktion als „function:<key>“ (Inhaber:in oder Vertretung, auch
// eigene Rollen „function:role:<id>“). Leer = alle. Rein.

export const DISTRIBUTION_ALL = "all";
export const functionTarget = (fn: string) => `function:${fn}`;

export function inDistribution(
	distribution: readonly string[],
	viewer: { role: string; functions: readonly string[] },
): boolean {
	if (distribution.length === 0 || distribution.includes(DISTRIBUTION_ALL))
		return true;
	if (distribution.includes(viewer.role)) return true;
	return viewer.functions.some((f) => distribution.includes(functionTarget(f)));
}

// Wer eine veröffentlichte Fassung zur Kenntnis nehmen soll: Mitglieder im
// Verteiler, ohne Externe (Prüfer:innen, Berater:innen nehmen nichts zur
// Kenntnis). Mitarbeitende bestätigen auf /richtlinien, alle anderen am
// Dokument.
export function acknowledgementAudience(
	distribution: readonly string[],
	members: readonly { userId: string; role: string }[],
	functionsOf: (userId: string) => readonly string[],
): { userId: string; employee: boolean }[] {
	return members
		.filter(
			(m) =>
				m.role !== "auditor" &&
				m.role !== "consultant" &&
				inDistribution(distribution, {
					role: m.role,
					functions: functionsOf(m.userId),
				}),
		)
		.map((m) => ({ userId: m.userId, employee: m.role === "employee" }));
}

// Ziel der Kenntnisnahme je Person
export const acknowledgementLink = (docNumber: string, employee: boolean) =>
	`${employee ? "/richtlinien" : "/dokumente"}/${encodeURIComponent(docNumber)}`;
