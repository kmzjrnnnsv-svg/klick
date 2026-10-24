import { getTranslations } from "next-intl/server";

export default async function VerifyPage() {
	const t = await getTranslations("Auth");
	return (
		<div className="flex flex-col gap-4">
			<h1 className="font-bold text-title-1">{t("verifyTitle")}</h1>
			<p className="text-muted-foreground">{t("verifyLead")}</p>
			<p className="text-muted-foreground text-subhead">{t("verifyHint")}</p>
		</div>
	);
}
