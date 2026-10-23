import { getTranslations } from "next-intl/server";
import { LinkRegistration } from "@/components/auth/link-registration";

// Konto aktivieren: /aktivieren#klk_activate_… — erster Passkey für ein
// Konto, das ein Plattform-Admin angelegt hat. Ohne Passkey kein Zugang.
export default async function ActivatePage() {
	const t = await getTranslations("Activate");
	return (
		<div className="flex flex-col gap-6">
			<div>
				<h1 className="font-serif-display text-3xl text-primary">
					{t("title")}
				</h1>
			</div>
			<LinkRegistration expected="activate" sessionEmail={null} />
		</div>
	);
}
