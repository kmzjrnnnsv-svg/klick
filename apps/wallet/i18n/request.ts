import { getRequestConfig } from "next-intl/server";

// both.money: Oberfläche auf Deutsch (Du-Form), Zeitzone Europe/Berlin.
export const locale = "de" as const;
export const timeZone = "Europe/Berlin" as const;

export default getRequestConfig(async () => ({
	locale,
	timeZone,
	messages: (await import("../messages/de.json")).default,
}));
