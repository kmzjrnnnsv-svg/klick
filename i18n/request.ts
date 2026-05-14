import { getRequestConfig } from "next-intl/server";

export const locales = ["de"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "de";

// Die App läuft fest auf Deutsch. Der Sprach-Umschalter wurde entfernt;
// es gibt keine Locale-Auswahl mehr.
export default getRequestConfig(async () => {
	return {
		locale: "de",
		messages: (await import("../messages/de.json")).default,
	};
});
