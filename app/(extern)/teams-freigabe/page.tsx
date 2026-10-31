import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

export const metadata: Metadata = {
	title: "Microsoft Teams",
	robots: { index: false, follow: false },
};

// Ergebnis der Freigabe in Microsoft Entra (T5) für die Kunden-IT
export default async function TeamsConsentResult({
	searchParams,
}: {
	searchParams: Promise<{ ergebnis?: string }>;
}) {
	const t = await getTranslations("Teams");
	const { ergebnis } = await searchParams;
	const key =
		ergebnis === "ok"
			? "resultOk"
			: ergebnis === "abgelehnt"
				? "resultDenied"
				: "resultInvalid";
	return (
		<div className="flex flex-col gap-3">
			<h1 className="font-bold text-title-1">{t("resultTitle")}</h1>
			<p className="text-body">{t(key)}</p>
		</div>
	);
}
