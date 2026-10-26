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
