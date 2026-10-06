import { getTranslations } from "next-intl/server";

export default async function VerifyPage() {
	const t = await getTranslations("Auth");
	return (
		<div className="flex flex-col gap-4">
			<p className="lv-eyebrow text-[0.6rem] text-brown">Klick</p>
			<h1 className="font-serif-display text-3xl text-primary">
				{t("verifyTitle")}
			</h1>
			<p className="text-muted-foreground">{t("verifyLead")}</p>
			<p className="text-muted-foreground text-sm">{t("verifyHint")}</p>
		</div>
	);
}
