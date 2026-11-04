import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

export const metadata: Metadata = {
	title: "Konten und Anmeldungen",
	robots: { index: false, follow: false },
};

const KEYS = {
	ok: "resultOk",
	abgelehnt: "resultDenied",
	fremd: "resultUnbound",
	vergeben: "resultTaken",
} as const;

// Ergebnis der Freigabe von „Klick Identität“ in Microsoft Entra (Teil D)
// für die Kunden-IT
export default async function IdentityConsentResult({
	searchParams,
}: {
	searchParams: Promise<{ ergebnis?: string }>;
}) {
	const t = await getTranslations("Identity");
	const { ergebnis } = await searchParams;
	const key =
		ergebnis && ergebnis in KEYS
			? KEYS[ergebnis as keyof typeof KEYS]
			: "resultInvalid";
	return (
		<div className="flex flex-col gap-3">
			<h1 className="font-bold text-title-1">{t("resultTitle")}</h1>
			<p className="text-body">{t(key)}</p>
		</div>
	);
}
