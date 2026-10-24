import { getTranslations } from "next-intl/server";
import { LinkRegistration } from "@/components/auth/link-registration";

// Zugang zurücksetzen (ADR-019): /zugang#klk_recover_… — neuer Passkey für ein
// bestehendes Konto, ausgestellt von Owner oder Plattform-Admin.
export default async function RecoverPage() {
	const t = await getTranslations("Recover");
	return (
		<div className="flex flex-col gap-6">
			<div>
				<h1 className="font-bold text-title-1">{t("title")}</h1>
			</div>
			<LinkRegistration expected="recover" sessionEmail={null} />
		</div>
	);
}
