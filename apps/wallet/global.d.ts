import type de from "./messages/de.json";

// next-intl: typisierte Message-Keys für both.money
declare module "next-intl" {
	interface AppConfig {
		Locale: "de";
		Messages: typeof de;
	}
}
