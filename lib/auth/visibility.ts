import { isExternal } from "./memberships";

// Was externe Rollen sehen (ADR-018, Prüfer-Sicht): ohne Grant
// „Entwürfe und Verlauf“ (work_in_progress) nur die gültige Fassung — je
// Dokument die veröffentlichte, die gilt; je Nachweis die aktuelle.
// Entwürfe, Arbeitskopien, Freigaben und ersetzte Fassungen bleiben
// unsichtbar, auch beim Download. Berater:innen haben den Grant
// voreingestellt. Rein.

type Viewer = { orgRole: string | null; grants: readonly string[] };

export const WORK_IN_PROGRESS = "work_in_progress";
export const SECRET_GRANT = "secret_evidence";

export function restrictedView(ctx: Viewer): boolean {
	return isExternal(ctx.orgRole) && !ctx.grants.includes(WORK_IN_PROGRESS);
}

// Streng geheime Unterlagen: Externe nur mit Grant
export function seesSecret(ctx: Viewer): boolean {
	return !isExternal(ctx.orgRole) || ctx.grants.includes(SECRET_GRANT);
}

// Titel und Beschreibung einer streng geheimen Unterlage ausblenden
export function hidesSecret(
	ctx: Viewer,
	row: { classification: string },
): boolean {
	return row.classification === "secret" && !seesSecret(ctx);
}

// Listen für Externe ohne Grant: streng geheime Einträge bleiben sichtbar
// (es gibt sie), aber ohne Titel, Beschreibung, Link und Dateinamen
export function maskSecret<
	T extends {
		classification: string;
		title: string;
		description?: string | null;
		url?: string | null;
		fileName?: string | null;
	},
>(ctx: Viewer, rows: readonly T[], label: string): T[] {
	if (seesSecret(ctx)) return [...rows];
	return rows.map((r) =>
		r.classification === "secret"
			? {
					...r,
					title: label,
					...("description" in r ? { description: null } : {}),
					...("url" in r ? { url: null } : {}),
					...("fileName" in r ? { fileName: null } : {}),
				}
			: r,
	);
}
