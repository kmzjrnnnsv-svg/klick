import { cookies, headers } from "next/headers";
import { getRequestConfig } from "next-intl/server";

export const locales = ["de", "en"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "de";

function pickLocale(value: string | null | undefined): Locale {
	return value === "en" ? "en" : "de";
}

export default getRequestConfig(async () => {
	// 1. Explicit cookie (user-chosen).
	const cookieLocale = (await cookies()).get("NEXT_LOCALE")?.value;
	if (cookieLocale === "de" || cookieLocale === "en") {
		return load(cookieLocale);
	}

	// 2. Accept-Language fallback (DE-first).
	const accept = (await headers()).get("accept-language") ?? "";
	const detected = accept.toLowerCase().startsWith("en") ? "en" : "de";
	return load(pickLocale(detected));
});

async function load(locale: Locale) {
	return {
		locale,
		messages: (await import(`../messages/${locale}.json`)).default,
	};
}
