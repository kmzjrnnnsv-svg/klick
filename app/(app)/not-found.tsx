import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { buttonVariants } from "@/components/ui/button";

// 404 innerhalb der App: zurück nach /heute statt auf die Marketing-Startseite.
export default async function AppNotFound() {
	const t = await getTranslations("Errors");
	const tNav = await getTranslations("Nav");
	const ts = await getTranslations("Search");
	return (
		<div className="mx-auto flex w-full max-w-xl flex-col items-center gap-6 py-24 text-center">
			<p className="lv-eyebrow text-[0.62rem] text-muted-foreground">404</p>
			<h1 className="font-serif-display text-4xl text-primary">
				{t("notFoundTitle")}
			</h1>
			<p className="text-muted-foreground">{t("notFoundLead")}</p>
			<div className="flex flex-wrap justify-center gap-2">
				<Link href="/heute" className={buttonVariants({ variant: "outline" })}>
					{tNav("today")}
				</Link>
				<Link href="/suche" className={buttonVariants({ variant: "ghost" })}>
					{ts("title")}
				</Link>
			</div>
		</div>
	);
}
