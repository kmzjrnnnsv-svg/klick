import type de from "./messages/de.json";

// next-intl: typisierte Message-Keys — `t("Nicht.Vorhanden")` ist ein tsc-Fehler.
declare module "next-intl" {
	interface AppConfig {
		Locale: "de";
		Messages: typeof de;
	}
}
