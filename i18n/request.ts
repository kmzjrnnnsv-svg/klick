import { getRequestConfig } from "next-intl/server";

// DE-only, fest. Zeitzone Europe/Berlin für alle Fristen und Formatierungen.
export const locale = "de" as const;
export const timeZone = "Europe/Berlin" as const;

export default getRequestConfig(async () => ({
	locale,
	timeZone,
	messages: (await import("../messages/de.json")).default,
}));
