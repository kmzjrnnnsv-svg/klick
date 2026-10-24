import { LinkRegistration } from "@wallet/components/auth/link-registration";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

export const metadata: Metadata = { title: "Konto aktivieren" };

// Aktivieren und Zugang zurücksetzen: Passkey für ein bestehendes Konto
export default async function ActivatePage() {
	const t = await getTranslations("Link");
	return (
		<div className="flex flex-col gap-6">
			<h1 className="font-serif-display text-2xl">{t("activateTitle")}</h1>
			<LinkRegistration page="activate" sessionEmail={null} />
		</div>
	);
}
