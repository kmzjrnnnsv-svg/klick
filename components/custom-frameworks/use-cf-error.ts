"use client";

import { useTranslations } from "next-intl";
import { errorText } from "@/components/ui/error-text";

// Fehlercodes des Dienstes für eigene Rahmenwerke als Satz mit nächstem
// Schritt; alles andere über errorText (Common)
const KNOWN = new Set([
	"too_many_rows",
	"key_taken",
	"too_many_frameworks",
	"too_many_requirements",
	"retired",
	"active",
	"section_not_empty",
	"code_taken",
	"control_unknown",
	"exclusion_not_allowed",
	"reason_required",
	"unchanged",
]);

export function useCfError() {
	const t = useTranslations("CustomFrameworks");
	const tc = useTranslations("Common");
	return (res: { ok?: boolean; error?: unknown; ref?: unknown }) => {
		const code = typeof res.error === "string" ? res.error : "";
		return KNOWN.has(code)
			? t(`error_${code}` as "error_key_taken")
			: errorText(tc, res);
	};
}

// Vorlage für den CSV-Import (Spalten wie im Import erwartet)
export const CSV_COLUMNS =
	"abschnitt;abschnitt_titel;code;titel;text;bereich;controls;abdeckung";

export const CSV_TEMPLATE = `${CSV_COLUMNS}
A;Zugriff;A.1;Rechte prüfen;Zugriffsrechte werden vierteljährlich geprüft.;Zugriff;CC-IAM-05;ganz
B;Notfall;B.1;Datensicherung;Daten werden täglich gesichert und die Wiederherstellung jährlich getestet.;Notfall;CC-BCM-03;teilweise
`;
