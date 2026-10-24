import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { buttonVariants } from "@/components/ui/button";

// Inhalt der 404-Seite — einmal für die Wurzel (mit Rechtslinks) und einmal
// in der Marketing-Gruppe (dort trägt die Fußzeile die Links).
export async function NotFoundContent() {
	const t = await getTranslations("Errors");
	const tc = await getTranslations("Common");
	return (
		<main
			id="inhalt"
			className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center gap-6 px-4 py-24 text-center"
		>
			<p className="font-medium text-footnote text-muted-foreground">404</p>
			<h1 className="font-bold text-title-1">{t("notFoundTitle")}</h1>
			<p className="text-muted-foreground">{t("notFoundLead")}</p>
			<Link href="/" className={buttonVariants({ variant: "outline" })}>
				{tc("toHome")}
			</Link>
		</main>
	);
}
